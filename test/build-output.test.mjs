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

/** Today in YYYY-MM-DD, matching the BUILD_DATE rule in src/lib/content.ts. */
const today = new Date().toISOString().slice(0, 10);

/**
 * Entries of a content collection, read straight from the .mdx frontmatter.
 * Deliberately a dumb scanner rather than an import of src/lib/content.ts:
 * these tests check what the *build actually emitted* against what the source
 * files say, so sharing the implementation would make the check circular.
 */
const entriesIn = (collection) =>
  readdirSync(join(contentDir, collection))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, "");
      const frontmatter = readFileSync(join(contentDir, collection, f), "utf8").split(
        /^---$/m,
      )[1];
      const date = frontmatter.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1];
      const draft = /^draft:\s*true\b/m.test(frontmatter);
      // Mirrors the publication rules documented in src/lib/content.ts.
      return { slug, date, draft, published: !draft && (date === undefined || date <= today) };
    });

test("emits the top-level routes", () => {
  for (const route of ["/", "/about", "/blog", "/projects", "/reviews"]) {
    assert.ok(routes.has(route), `missing page for ${route}`);
  }
});

test("emits a page for every published content entry", () => {
  for (const collection of ["blog", "projects", "reviews"]) {
    const entries = entriesIn(collection);
    assert.ok(entries.length > 0, `no .mdx entries found in src/content/${collection}`);
    for (const { slug } of entries.filter((e) => e.published)) {
      assert.ok(
        routes.has(`/${collection}/${slug}`),
        `src/content/${collection}/${slug}.mdx did not produce /${collection}/${slug}`,
      );
    }
  }
});

test("drafts and future-dated entries never reach the build", () => {
  for (const collection of ["blog", "projects", "reviews"]) {
    for (const { slug, draft, date } of entriesIn(collection).filter((e) => !e.published)) {
      const why = draft ? "is a draft" : `is dated ${date}, in the future`;
      assert.ok(
        !routes.has(`/${collection}/${slug}`),
        `/${collection}/${slug} was emitted but ${why}`,
      );
      // A withheld entry must not be linked from anywhere either, or the
      // internal-link test below would be the only thing catching it.
      for (const file of htmlFiles) {
        assert.doesNotMatch(
          readFileSync(file, "utf8"),
          new RegExp(`href="/${collection}/${slug}/?"`),
          `${routeOf(file)} links to /${collection}/${slug}, which ${why}`,
        );
      }
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

/** Every <a> in a page, as { href, target, rel, tag }. */
function anchorsIn(html) {
  return [...html.matchAll(/<a\s([^>]*)>/g)].map((m) => {
    const tag = m[1];
    const attr = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    return { href: attr("href"), target: attr("target"), rel: attr("rel"), tag };
  });
}

test("external links open safely", () => {
  let seen = 0;
  for (const file of htmlFiles) {
    for (const a of anchorsIn(readFileSync(file, "utf8"))) {
      if (!a.href?.startsWith("http")) continue;
      seen++;
      assert.equal(
        a.target,
        "_blank",
        `${routeOf(file)}: external link ${a.href} should open in a new context`,
      );
      // Without noopener the opened page can steer this one via window.opener.
      assert.match(
        a.rel ?? "",
        /\bnoopener\b/,
        `${routeOf(file)}: external link ${a.href} is missing rel="noopener"`,
      );
    }
  }
  assert.ok(seen > 0, "no external links found — the check would be vacuous");
});

test("primary navigation is present and resolvable on every page", () => {
  for (const file of htmlFiles) {
    const hrefs = new Set(anchorsIn(readFileSync(file, "utf8")).map((a) => a.href));
    for (const route of ["/", "/projects", "/blog", "/reviews", "/about"]) {
      assert.ok(hrefs.has(route), `${routeOf(file)} does not link to ${route}`);
      assert.ok(routes.has(route), `nav target ${route} was never built`);
    }
  }
});

test("calls to action are real links, not decorated spans", () => {
  // The About page's github/email links and the project sidebar links were all
  // <span class="… cursor-pointer">, which look clickable and do nothing.
  const about = readFileSync(join(dist, "about", "index.html"), "utf8");
  const hrefs = anchorsIn(about).map((a) => a.href);
  assert.ok(
    hrefs.some((h) => h?.startsWith("mailto:")),
    "/about exposes no contact address",
  );
  assert.ok(
    hrefs.some((h) => h?.startsWith("https://github.com/")),
    "/about does not link to GitHub",
  );
  for (const file of htmlFiles) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /<span[^>]*cursor-pointer/,
      `${routeOf(file)} still renders a span styled as a clickable control`,
    );
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
