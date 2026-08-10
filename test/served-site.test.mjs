// Smoke tests over HTTP, against the production build in dist/.
//
// The other suites read files off disk; these ask for URLs, which is the only
// way to check the things a file listing cannot: that a clean URL resolves,
// that a missing route is a 404 rather than a 200 with empty content, and that
// assets come back with a usable content type.
//
// The server below is a deliberate re-implementation of the `try_files` rule
// in nginx.conf. It is not a substitute for nginx — the `container-smoke` job
// in .github/workflows/ci.yaml runs these same probes against the real image.
// Keeping a local version means `npm test` needs no Docker and no new
// dependency, and it fails fast when a route stops resolving.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

/** The first of these that is a real file wins — same order as nginx.conf:
    `try_files $uri $uri.html $uri/index.html $uri/ =404`. */
const candidates = (urlPath) => [
  urlPath,
  `${urlPath}.html`,
  join(urlPath, "index.html"),
];

let server;
let origin;

before(async () => {
  server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    // Refuse to escape the root, exactly as a static server must.
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");

    // Decided from the URL, not the resolved filesystem path: normalize()
    // yields backslashes on Windows, which would never match "/_astro/".
    const fingerprinted = urlPath.startsWith("/_astro/");

    for (const candidate of candidates(safe)) {
      const file = join(dist, candidate);
      if (!file.startsWith(dist)) continue;
      if (existsSync(file) && statSync(file).isFile()) {
        const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
        res.writeHead(200, {
          "content-type": type.startsWith("text/") ? `${type}; charset=utf-8` : type,
          // Mirrors the nginx cache policy: fingerprinted assets are
          // immutable, everything else must be revalidated.
          "cache-control": fingerprinted
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

const get = (path) => fetch(`${origin}${path}`);

test("representative routes render real HTML", async () => {
  for (const path of ["/", "/about", "/blog", "/projects", "/reviews"]) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
    assert.match(res.headers.get("content-type"), /text\/html/, `${path} is not HTML`);

    const body = await res.text();
    assert.match(body, /<main[\s>]/, `${path} rendered no <main>`);
    assert.match(body, /<h1[\s>]/, `${path} rendered no heading`);
    assert.ok(body.length > 1000, `${path} looks suspiciously empty`);
  }
});

test("content detail routes render their entry", async () => {
  for (const [path, expected] of [
    ["/blog/building-a-homelab", "Building a Homelab"],
    ["/projects/k3s-cluster", "k3s"],
    ["/reviews/warframe", "Warframe"],
  ]) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
    assert.ok((await res.text()).includes(expected), `${path} does not mention "${expected}"`);
  }
});

test("a missing route is a 404, not an empty 200", async () => {
  for (const path of ["/nope", "/blog/does-not-exist", "/projects/nothing/deeper"]) {
    const res = await get(path);
    assert.equal(res.status, 404, `${path} returned ${res.status}, expected 404`);
  }
});

test("clean URLs resolve with and without a trailing slash", async () => {
  for (const path of ["/blog", "/blog/", "/projects/k3s-cluster", "/projects/k3s-cluster/"]) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
  }
});

test("the feed and sitemap are served as XML", async () => {
  for (const path of ["/rss.xml", "/sitemap-index.xml", "/sitemap-0.xml"]) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
    assert.match(res.headers.get("content-type"), /xml/, `${path} is not served as XML`);
    assert.match(await res.text(), /^<\?xml/, `${path} is not an XML document`);
  }
});

test("assets are served with a usable content type and cache policy", async () => {
  const home = await (await get("/")).text();
  const css = home.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
  assert.ok(css, "home page links no built stylesheet");

  const cssRes = await get(css);
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers.get("content-type"), /text\/css/);
  // Fingerprinted, so it may be cached forever.
  assert.match(cssRes.headers.get("cache-control"), /immutable/, `${css} is not immutable`);

  // The social card has a stable, un-fingerprinted name, so it must stay
  // revalidatable or a regenerated card would never reach anyone.
  const og = await get("/og-default.png");
  assert.equal(og.status, 200);
  assert.match(og.headers.get("content-type"), /image\/png/);
  assert.doesNotMatch(og.headers.get("cache-control") ?? "", /immutable/);

  // HTML must never be immutable either, or a deploy would not appear.
  const html = await get("/");
  assert.doesNotMatch(html.headers.get("cache-control") ?? "", /immutable/);
});
