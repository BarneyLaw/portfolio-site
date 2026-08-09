// Smoke tests for the built site.
//
// These assert on the contents of dist/, so run `npm run build` first (CI does).
// The site is static and has no runtime test surface, so the useful things to
// check are: every route we expect actually got emitted, every content entry
// got a page, nothing links at a page that doesn't exist, the CSS pipeline
// produced real output, and the pre-paint theme bootstrap still defaults to
// light. A green `astro check` won't catch any of those.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const contentDir = join(root, "src", "content");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

/** Every file under dir, as absolute paths. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));

/** dist/blog/foo/index.html -> /blog/foo */
const routeOf = (file) =>
  "/" +
  file
    .slice(dist.length + 1)
    .split(/[\\/]/)
    .join("/")
    .replace(/(^|\/)index\.html$/, "")
    .replace(/\.html$/, "");

const routes = new Set(htmlFiles.map(routeOf));

/** Slugs of a content collection, taken from its .mdx filenames. */
const slugsIn = (collection) =>
  readdirSync(join(contentDir, collection))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));

test("emits the top-level routes", () => {
  for (const route of ["/", "/about", "/blog", "/projects", "/reviews"]) {
    assert.ok(routes.has(route), `missing page for ${route}`);
  }
});

test("emits a page for every content entry", () => {
  for (const collection of ["blog", "projects", "reviews"]) {
    const slugs = slugsIn(collection);
    assert.ok(slugs.length > 0, `no .mdx entries found in src/content/${collection}`);
    for (const slug of slugs) {
      assert.ok(
        routes.has(`/${collection}/${slug}`),
        `src/content/${collection}/${slug}.mdx did not produce /${collection}/${slug}`,
      );
    }
  }
});

test("every page has a title and rendered body content", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
    assert.ok(title, `${routeOf(file)} has no <title>`);
    assert.match(html, /<main[\s>]/, `${routeOf(file)} rendered no <main> content`);
  }
});

test("internal links point at something that exists", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      // Asset links (anything with an extension) resolve to a file on disk;
      // page links resolve to a route we emitted.
      if (/\.[a-z0-9]+$/i.test(path)) {
        assert.ok(
          existsSync(join(dist, path)),
          `${routeOf(file)} links to missing asset ${href}`,
        );
      } else {
        assert.ok(routes.has(path), `${routeOf(file)} links to missing page ${href}`);
      }
    }
  }
});

test("ships a non-empty stylesheet", () => {
  const home = readFileSync(join(dist, "index.html"), "utf8");
  const sheets = [...home.matchAll(/href="(\/[^"]+\.css)"/g)].map((m) => m[1]);
  assert.ok(sheets.length > 0, "home page links no stylesheet");
  for (const sheet of sheets) {
    const file = join(dist, sheet);
    assert.ok(existsSync(file), `missing stylesheet ${sheet}`);
    // A Tailwind build that silently produced nothing would still emit a file.
    assert.ok(statSync(file).size > 1024, `stylesheet ${sheet} is suspiciously small`);
  }
});

test("theme bootstrap defaults to light", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(
      html,
      /localStorage\.getItem\("theme"\)\s*===\s*"dark"/,
      `${routeOf(file)} is missing the pre-paint theme bootstrap`,
    );
    // A prefers-color-scheme fallback would hand dark mode to first-time
    // visitors on a dark-themed OS, which is the behaviour we removed.
    assert.doesNotMatch(
      html,
      /prefers-color-scheme/,
      `${routeOf(file)} reintroduced an OS dark-mode fallback`,
    );
  }
});
