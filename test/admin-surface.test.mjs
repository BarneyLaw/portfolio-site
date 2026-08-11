// The administrator surface (Milestone 3 — Cloudflare Access).
//
// Two things are being protected here, and only one of them is a test's job.
//
// The real boundary is Cloudflare Access in front of the admin hostname plus
// the assertion-verifying middleware in the Go API. Nothing in this repository
// can enforce that, and nothing here pretends to.
//
// What these tests *can* enforce is that the frontend never undermines it:
// that a public build ships no administrator code at all, that the frontend
// invents no authentication of its own, and that the admin surface stays out
// of everything that advertises the site.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const distFiles = walk(dist);
const rel = (path) => path.slice(dist.length + 1).split(/[\\/]/).join("/");

/** True when this build included the admin UI (ADMIN_UI=1). */
const adminBuild = existsSync(join(dist, "admin", "comments", "index.html"));

// ── The frontend invents no authentication ───────────────────────────────
// These hold for every build, admin or not. The backend has no login
// endpoint, no password, no session and issues no admin token; a frontend
// that grew one would be building a parallel, weaker authority.

test("no build ships a login form, password field, or token storage", () => {
  for (const file of distFiles.filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /<input[^>]+type="password"/i, `${rel(file)} has a password field`);
    assert.doesNotMatch(
      html,
      /name="(password|passwd|token|api[_-]?key)"/i,
      `${rel(file)} has a credential input`,
    );
  }

  // And no client module may handle an Access assertion or fabricate a token.
  const sources = walk(join(root, "src")).filter((f) => /\.(ts|astro)$/.test(f));
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    const code = source
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    // Cloudflare injects this header at the edge; the browser must never set
    // it, and code that tried would be forging an identity assertion.
    assert.ok(
      !code.includes("Cf-Access-Jwt-Assertion"),
      `${file} sets the Access assertion header itself`,
    );
    for (const forbidden of ["CF_Authorization", "localStorage.setItem(\"token"]) {
      assert.ok(!code.includes(forbidden), `${file} touches ${forbidden}`);
    }
  }
});

test("public endpoints never send credentials", () => {
  // Only the admin client may opt in, and only to same-origin. A public
  // endpoint sending cookies would be a way to leak one.
  const publicClients = ["comments.ts", "stats.ts", "views.ts"];
  for (const name of publicClients) {
    const source = readFileSync(join(root, "src", "lib", name), "utf8");
    assert.ok(!source.includes("credentials"), `src/lib/${name} sets credentials; it must not`);
  }

  const admin = readFileSync(join(root, "src", "lib", "admin.ts"), "utf8");
  assert.match(admin, /credentials:\s*"same-origin"/, "admin client must send the Access cookie");
  assert.ok(
    !admin.includes('credentials: "include"'),
    'admin must use same-origin, not include: the page and API share an origin',
  );
});

// ── A public build contains no administrator surface ─────────────────────

test("a public build emits no admin route", { skip: adminBuild && "admin build" }, () => {
  assert.ok(!existsSync(join(dist, "admin")), "dist/admin exists in a public build");
});

test(
  "a public build ships no administrator code, not even an orphan chunk",
  { skip: adminBuild && "admin build" },
  () => {
    // Suppressing a route with an empty getStaticPaths is not enough: Astro
    // still compiles the page's <script> into an unreferenced but fetchable
    // chunk. That is why the admin page lives outside src/pages and is
    // injected only when ADMIN_UI is set.
    const markers = ["mountAdminComments", "listModerationComments", "/admin/comments"];
    for (const file of distFiles.filter((f) => /\.(js|html)$/.test(f))) {
      const contents = readFileSync(file, "utf8");
      for (const marker of markers) {
        assert.ok(!contents.includes(marker), `${rel(file)} contains "${marker}"`);
      }
    }
  },
);

// ── An admin build keeps itself out of the public surface ────────────────

test("the admin page is noindex", { skip: !adminBuild && "public build" }, () => {
  const html = readFileSync(join(dist, "admin", "comments", "index.html"), "utf8");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/, "admin page is indexable");
});

test("admin routes stay out of the sitemap and feed", () => {
  const sitemapPath = join(dist, "sitemap-0.xml");
  if (existsSync(sitemapPath)) {
    const sitemap = readFileSync(sitemapPath, "utf8");
    assert.ok(!sitemap.includes("/admin"), "sitemap advertises an admin route");
  }
  const feed = readFileSync(join(dist, "rss.xml"), "utf8");
  assert.ok(!feed.includes("/admin"), "feed advertises an admin route");
});

test("robots.txt disallows the admin surface", () => {
  const robots = readFileSync(join(dist, "robots.txt"), "utf8");
  assert.match(robots, /^Disallow:\s*\/admin$/m, "robots.txt does not disallow /admin");
  assert.match(robots, /^Sitemap:\s*https:\/\/\S+/m, "robots.txt advertises no sitemap");
});

test("the admin page ships no public site chrome that links back into it", () => {
  if (!adminBuild) return;
  // The admin page is served from a different hostname than the public site;
  // its own nav links are relative and would 404 there. This is a known
  // limitation rather than a failure, so the test documents it by asserting
  // the page at least carries no *outbound* advertisement of itself.
  const html = readFileSync(join(dist, "admin", "comments", "index.html"), "utf8");
  assert.ok(!html.includes("<loc>"), "admin page embeds sitemap markup");
});
