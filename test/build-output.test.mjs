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

test("emits an RSS feed of exactly the published posts", () => {
  const feed = readFileSync(join(dist, "rss.xml"), "utf8");
  const links = [...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
  const items = links.filter((l) => l.includes("/blog/"));

  const published = entriesIn("blog").filter((e) => e.published);
  assert.equal(items.length, published.length, "feed item count != published post count");
  for (const { slug } of published) {
    assert.ok(
      items.some((l) => l.includes(`/blog/${slug}`)),
      `feed is missing ${slug}`,
    );
  }
  for (const { slug } of entriesIn("blog").filter((e) => !e.published)) {
    assert.ok(!feed.includes(`/blog/${slug}`), `feed leaks unpublished ${slug}`);
  }
  // Absolute URLs and RFC-822 dates, or readers reject the feed.
  for (const link of links) {
    assert.match(link, /^https:\/\//, `feed link ${link} is not absolute`);
  }
  assert.match(feed, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/, "bad pubDate");
});

test("sitemap lists the public routes and nothing else", () => {
  const locs = [...readFileSync(join(dist, "sitemap-0.xml"), "utf8").matchAll(
    /<loc>([^<]+)<\/loc>/g,
  )].map((m) => m[1]);
  assert.ok(locs.length > 0, "empty sitemap");

  const paths = new Set(locs.map((l) => new URL(l).pathname.replace(/(.)\/$/, "$1")));
  for (const route of ["/", "/about", "/blog", "/projects", "/reviews"]) {
    assert.ok(paths.has(route), `sitemap is missing ${route}`);
  }
  // Every listed URL must be a page we actually built.
  for (const path of paths) {
    assert.ok(routes.has(path), `sitemap lists ${path}, which was never built`);
  }
  for (const collection of ["blog", "projects", "reviews"]) {
    for (const { slug } of entriesIn(collection).filter((e) => !e.published)) {
      assert.ok(
        !paths.has(`/${collection}/${slug}`),
        `sitemap leaks unpublished /${collection}/${slug}`,
      );
    }
  }
});

test("canonical URLs agree with the sitemap and are unique", () => {
  const sitemapLocs = new Set(
    [...readFileSync(join(dist, "sitemap-0.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    ),
  );
  const seen = new Map();
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${routeOf(file)} has no canonical URL`);
    assert.match(canonical, /^https:\/\//, `${routeOf(file)} canonical is not absolute`);
    // Two pages claiming the same canonical means one is telling crawlers to
    // drop it. Two *forms* of the same URL is the subtler version of that bug,
    // which is why this is checked against the sitemap's exact spelling.
    assert.ok(!seen.has(canonical), `${routeOf(file)} shares a canonical with ${seen.get(canonical)}`);
    seen.set(canonical, routeOf(file));
    assert.ok(
      sitemapLocs.has(canonical),
      `${routeOf(file)} canonical ${canonical} is spelled differently in the sitemap`,
    );
  }
});

test("every page advertises the feed", () => {
  for (const file of htmlFiles) {
    assert.match(
      readFileSync(file, "utf8"),
      /<link rel="alternate" type="application\/rss\+xml"[^>]*href="https:\/\/[^"]*\/rss\.xml"/,
      `${routeOf(file)} does not advertise the RSS feed`,
    );
  }
});

test("every page renders a complete social card", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const meta = (property) =>
      html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1];

    for (const required of ["og:type", "og:title", "og:description", "og:url"]) {
      assert.ok(meta(required), `${routeOf(file)} is missing ${required}`);
    }
    // Scrapers do not run JavaScript and do not resolve relative URLs.
    const image = meta("og:image");
    assert.match(image ?? "", /^https:\/\//, `${routeOf(file)} og:image is not absolute`);
    assert.ok(
      meta("og:image:width") && meta("og:image:height"),
      `${routeOf(file)} og:image has no declared size`,
    );
    assert.ok(meta("og:image:alt"), `${routeOf(file)} og:image has no alt text`);
    // og:url must agree with the canonical, or a share and a crawl disagree
    // about which URL this page is.
    assert.equal(
      meta("og:url"),
      html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
      `${routeOf(file)} og:url and canonical disagree`,
    );
  }
});

test("social card images actually exist and match their declared size", async () => {
  const { default: sharp } = await import("sharp");
  const seen = new Set();
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const url = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    const w = Number(html.match(/<meta property="og:image:width" content="(\d+)"/)?.[1]);
    const h = Number(html.match(/<meta property="og:image:height" content="(\d+)"/)?.[1]);
    const path = new URL(url).pathname;
    if (seen.has(path)) continue;
    seen.add(path);

    const onDisk = join(dist, path);
    assert.ok(existsSync(onDisk), `og:image ${path} was not emitted into dist/`);
    const meta = await sharp(onDisk).metadata();
    assert.equal(meta.width, w, `og:image ${path} width tag disagrees with the file`);
    assert.equal(meta.height, h, `og:image ${path} height tag disagrees with the file`);
  }
});

test("content images reserve their space before loading", () => {
  // Missing intrinsic dimensions is the classic cause of layout shift: the
  // browser cannot size the box until the bytes arrive.
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    for (const [tag] of html.matchAll(/<img\s[^>]*>/g)) {
      const src = tag.match(/src="([^"]*)"/)?.[1] ?? "?";
      assert.match(tag, /\swidth="\d+"/, `${routeOf(file)}: <img ${src}> has no width`);
      assert.match(tag, /\sheight="\d+"/, `${routeOf(file)}: <img ${src}> has no height`);
      // alt must be present; empty is allowed and means "decorative". Astro
      // serialises alt="" as a bare `alt`, so both spellings count.
      assert.match(
        tag,
        /\salt(=|\s|>)/,
        `${routeOf(file)}: <img ${src}> has no alt attribute`,
      );
    }
  }
});

/** dist path of a route like "/blog/page/2". */
const fileForRoute = (route) =>
  join(dist, ...route.split("/").filter(Boolean), "index.html");

/** The blog archive: /blog followed by /blog/page/2, /blog/page/3, … */
function archiveRoutes() {
  const paged = [...routes]
    .filter((r) => /^\/blog\/page\/\d+$/.test(r))
    .sort((a, b) => Number(a.split("/").pop()) - Number(b.split("/").pop()));
  return ["/blog", ...paged];
}

test("every published post is reachable from the archive without JavaScript", () => {
  const linked = new Set();
  for (const route of archiveRoutes()) {
    const html = readFileSync(fileForRoute(route), "utf8");
    for (const m of html.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)) linked.add(m[1]);
  }
  for (const { slug } of entriesIn("blog").filter((e) => e.published)) {
    assert.ok(linked.has(slug), `${slug} is not linked from any archive page`);
  }
});

test("archive pages chain correctly and have no dead end controls", () => {
  const pages = archiveRoutes();
  pages.forEach((route, index) => {
    const html = readFileSync(fileForRoute(route), "utf8");
    const prev = html.match(/href="([^"]+)" rel="prev"/)?.[1];
    const next = html.match(/href="([^"]+)" rel="next"/)?.[1];

    if (index === 0) {
      assert.equal(prev, undefined, `${route} offers a previous page from page 1`);
    } else {
      assert.equal(prev, pages[index - 1], `${route} previous link is wrong`);
    }

    if (index === pages.length - 1) {
      assert.equal(next, undefined, `${route} offers a next page from the last page`);
    } else {
      assert.equal(next, pages[index + 1], `${route} next link is wrong`);
    }

    // Paging must never depend on a button or a script.
    assert.doesNotMatch(
      html.match(/<nav[^>]*aria-label="Blog pages"[\s\S]*?<\/nav>/)?.[0] ?? "",
      /<button/,
      `${route} pages with a <button> instead of a link`,
    );
  });

  // A single-page archive shows no pagination chrome at all.
  if (pages.length === 1) {
    assert.doesNotMatch(
      readFileSync(fileForRoute("/blog"), "utf8"),
      /aria-label="Blog pages"/,
      "single-page archive still renders pagination controls",
    );
  }
});

test("no post appears on two archive pages", () => {
  const seen = new Map();
  for (const route of archiveRoutes()) {
    const html = readFileSync(fileForRoute(route), "utf8");
    // The featured hero on page 1 is deliberately held out of the paged list,
    // so only count links inside the list itself.
    const list = html.match(/<div class="flex flex-col divide-y[\s\S]*?<\/div>\s*(?:<nav|<\/main)/)?.[0] ?? "";
    for (const m of list.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)) {
      assert.ok(!seen.has(m[1]), `${m[1]} appears on both ${seen.get(m[1])} and ${route}`);
      seen.set(m[1], route);
    }
  }
});

/** The rendered MDX body of a page, or "" if it has none. */
const articleOf = (html) => html.match(/<article class="mdx-content">([\s\S]*?)<\/article>/)?.[1] ?? "";

test("every MDX heading is a keyboard-reachable anchor to itself", () => {
  let checked = 0;
  for (const file of htmlFiles) {
    const article = articleOf(readFileSync(file, "utf8"));
    for (const [, tag, id, inner] of article.matchAll(
      /<(h[2-4]) id="([^"]+)">([\s\S]*?)<\/\1>/g,
    )) {
      checked++;
      const href = inner.match(/^<a class="heading-anchor" href="([^"]+)"/)?.[1];
      assert.equal(
        href,
        `#${id}`,
        `${routeOf(file)}: <${tag} id="${id}"> is not linked to its own id`,
      );
    }
  }
  assert.ok(checked > 0, "no MDX headings found — the check would be vacuous");
});

test("table of contents entries point at headings that exist", () => {
  let checked = 0;
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const toc = html.match(/<nav aria-label="Table of contents">([\s\S]*?)<\/nav>/)?.[1];
    if (!toc) continue;

    const ids = new Set([...articleOf(html).matchAll(/<h[2-4] id="([^"]+)"/g)].map((m) => m[1]));
    for (const [, target] of toc.matchAll(/href="#([^"]+)"/g)) {
      checked++;
      assert.ok(ids.has(target), `${routeOf(file)}: contents links to #${target}, no such heading`);
    }
  }
  assert.ok(checked > 0, "no table of contents rendered — the check would be vacuous");
});

test("fenced code is highlighted at build time and cannot overflow the page", () => {
  for (const file of htmlFiles) {
    const article = articleOf(readFileSync(file, "utf8"));
    for (const [tag] of article.matchAll(/<pre[^>]*>/g)) {
      // Shiki ran at build time, so no highlighter ships to the browser.
      assert.match(tag, /class="[^"]*astro-code/, `${routeOf(file)}: <pre> was not highlighted`);
      assert.match(tag, /overflow-x:\s*auto/, `${routeOf(file)}: <pre> can overflow horizontally`);
    }
  }
});

test("copy-code is progressive enhancement, not server-rendered", () => {
  for (const file of htmlFiles) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /<button[^>]*class="[^"]*code-copy/,
      `${routeOf(file)} ships a copy button in HTML; it must be script-injected`,
    );
  }
});

test("stylesheet carries print rules and dark-mode code colours", () => {
  const home = readFileSync(join(dist, "index.html"), "utf8");
  const sheet = home.match(/href="(\/[^"]+\.css)"/)?.[1];
  const css = readFileSync(join(dist, sheet), "utf8");

  assert.match(css, /@media\s+print/, "no print styles shipped");
  // The minifier drops quotes from attribute selectors, so accept both forms.
  assert.match(css, /\[data-print=["']?hide["']?\]/, "print styles cannot hide site chrome");
  assert.match(css, /--shiki-dark/, "dark-mode code colours are missing");
});

test("site chrome is marked for print suppression", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<header[^>]*data-print="hide"/, `${routeOf(file)} header prints`);
    assert.match(html, /<footer[^>]*data-print="hide"/, `${routeOf(file)} footer prints`);
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

/**
 * A page's inline HTML plus every bundled script it loads. The theme toggle is
 * a bundled module (only the pre-paint bootstrap is `is:inline`), so anything
 * asserting on behaviour has to look in both places.
 */
function pageScripts(file) {
  const html = readFileSync(file, "utf8");
  const bundles = [...html.matchAll(/<script[^>]+src="(\/[^"]+\.js)"/g)]
    .map((m) => join(dist, m[1]))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8"));
  return [html, ...bundles].join("\n");
}

test("theme persistence is wired end to end", () => {
  // Three pieces have to agree or the theme silently stops persisting: the
  // pre-paint script that reads storage, the click handler that writes it, and
  // the class they both talk about.
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const code = pageScripts(file);

    // The read must be inline in <head>, or the page paints the wrong theme
    // first and flashes.
    assert.match(
      html,
      /localStorage\.getItem\("theme"\)/,
      `${routeOf(file)} does not read the saved theme before paint`,
    );
    // The bundled scripts are minified, and the minifier rewrites string
    // quotes to backticks — so match any quote style, not just double.
    assert.match(
      code,
      /localStorage\.setItem\(\s*["'`]theme["'`]/,
      `${routeOf(file)} never writes the theme back`,
    );
    assert.match(
      code,
      /classList\.(add|toggle)\(\s*["'`]dark["'`]\)/,
      `${routeOf(file)} does not apply the dark class`,
    );
    // Storage throws outright in some privacy modes, and an unguarded read in
    // <head> would blank the page.
    assert.match(html, /try\s*\{[\s\S]*localStorage/, `${routeOf(file)} storage access is unguarded`);
  }
});

test("filter controls match the data they filter", () => {
  // A renamed status/verdict enum would leave a button that quietly matches
  // nothing. Every filter except "all" must select at least one real card.
  for (const [page, attr] of [
    ["projects", "data-status"],
    ["reviews", "data-type"],
  ]) {
    const html = readFileSync(join(dist, page, "index.html"), "utf8");

    const filters = [...html.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1]);
    const values = new Set([...html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map((m) => m[1]));

    assert.ok(filters.includes("all"), `/${page} has no "all" filter`);
    assert.ok(values.size > 0, `/${page} has no filterable cards`);

    for (const filter of filters) {
      if (filter === "all") continue;
      assert.ok(
        values.has(filter),
        `/${page}: filter "${filter}" matches no card (${attr} values: ${[...values].join(", ")})`,
      );
    }
    // And nothing is unreachable: every card value has a button.
    for (const value of values) {
      assert.ok(filters.includes(value), `/${page}: ${attr}="${value}" has no filter button`);
    }
  }
});

test("filtering and paging never hide content from a non-JS reader", () => {
  // Cards must not ship pre-hidden: the unfiltered list is the no-JS default.
  for (const page of ["projects", "reviews"]) {
    const html = readFileSync(join(dist, page, "index.html"), "utf8");
    for (const [tag] of html.matchAll(/<a\s[^>]*data-(status|type)="[^"]*"[^>]*>/g)) {
      // Match the standalone `hidden` class only — "overflow-hidden" is a
      // legitimate utility and a \bhidden\b regex would flag it.
      const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
      assert.ok(!classes.includes("hidden"), `/${page} ships a hidden card`);
    }
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
