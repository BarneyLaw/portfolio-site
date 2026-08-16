// Tests for the comment and view fragments (FEAT-204).
//
// Two kinds of assertion here:
//
//  1. Source guards — the XSS rule in src/features/comments/mount.ts is a
//     property of the source, not of any one rendered page, so it is checked
//     against the source directly.
//  2. Emitted markup — that the static page carries only the shell, and that
//     the article does not depend on any of it.
//
// The suite adapts to whether PUBLIC_API_BASE_URL was set for the build:
// unconfigured, none of this markup should exist at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const contentDir = join(root, "src", "content");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

/** Every reading — blog posts, projects and reviews all carry comments. */
const collections = [
  { name: "blog", route: "blog" },
  { name: "projects", route: "projects" },
  { name: "reviews", route: "reviews" },
];

const posts = collections.flatMap(({ name, route }) =>
  readdirSync(join(contentDir, name))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
    .map((slug) => ({
      slug,
      collection: name,
      route: `/${route}/${slug}`,
      file: join(dist, route, slug, "index.html"),
      frontmatter: readFileSync(join(contentDir, name, `${slug}.mdx`), "utf8").split(/^---$/m)[1],
    }))
    .filter((p) => existsSync(p.file))
    .map((p) => ({ ...p, html: readFileSync(p.file, "utf8") })),
);

/** Was the build given an API base? Inferred from the output itself, so the
    suite is correct for a configured and an unconfigured build alike. */
const apiConfigured = posts.some((p) => p.html.includes("data-comments"));

const commentsEnabled = (p) => !/^comments:\s*false\b/m.test(p.frontmatter);

// ── Source guards ────────────────────────────────────────────────────────

/** Every .ts file under src/features and src/lib, as { name, source }. */
function clientModules() {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".ts")) {
        out.push({ name: `${prefix}${entry.name}`, source: readFileSync(path, "utf8") });
      }
    }
  };
  walk(join(root, "src", "features"), "features/");
  walk(join(root, "src", "lib"), "lib/");
  return out;
}

/** Strip comments so a sink named in prose is not mistaken for a use. */
const codeOnly = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

test("no feature module writes HTML from untrusted values", () => {
  // Comment bodies, author names and counters all come from the API and are
  // echoed to every reader. The whole defence is that they are only ever
  // assigned with textContent, so any HTML-writing sink in these modules is a
  // bug, not a style preference.
  for (const { name, source } of clientModules()) {
    const code = codeOnly(source);
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
      assert.ok(!code.includes(sink), `${name} uses ${sink}; API values must go through textContent`);
    }
  }

  // And the two renderers must actually be using textContent, or the check
  // above would pass on a module that renders nothing at all.
  for (const renderer of ["features/comments/mount.ts", "features/post-stats/mount.ts"]) {
    const module = clientModules().find((m) => m.name === renderer);
    assert.ok(module, `${renderer} not found`);
    assert.ok(module.source.includes("textContent"), `${renderer} should render with textContent`);
  }
});

test("the API client is the only thing that calls fetch", () => {
  // Scattered fetch() calls are how base URLs, timeouts and validation drift
  // apart. Everything must go through apiRequest in src/lib/api.ts.
  const offenders = clientModules()
    .filter((m) => m.name !== "lib/api.ts")
    .filter((m) => codeOnly(m.source).includes("fetch("))
    .map((m) => m.name);

  assert.deepEqual(offenders, [], "these call fetch() directly instead of using apiRequest");
});

// ── Emitted markup ───────────────────────────────────────────────────────

test("posts render the article regardless of the comment fragment", () => {
  for (const post of posts) {
    assert.match(post.html, /<article class="mdx-content">/, `${post.route} lost its article`);
    // The article must not be nested inside the comment section, or a failure
    // there could take the post with it.
    const article = post.html.indexOf('<article class="mdx-content">');
    const section = post.html.indexOf("data-comments");
    if (section !== -1) {
      assert.ok(article < section, `${post.route} renders the article after the comments`);
    }
  }
});

test("the comment section ships only a shell, never a form or a comment", () => {
  if (!apiConfigured) {
    assert.ok(true, "no API base configured for this build — nothing to check");
    return;
  }
  let checked = 0;
  for (const post of posts.filter(commentsEnabled)) {
    checked++;
    assert.match(
      post.html,
      new RegExp(`data-comments[^>]*data-slug="${post.slug}"`),
      `${post.route} comment section has the wrong slug`,
    );
    // Static HTML carries the heading and the reserved regions only. The list
    // and the form are built by the client module, so a reader without
    // JavaScript is never shown a control that cannot work.
    const section = post.html.slice(post.html.indexOf("data-comments"));
    assert.doesNotMatch(section, /<form/, `${post.route} ships a comment form in HTML`);
    assert.doesNotMatch(section, /<li[\s>]/, `${post.route} ships pre-rendered comments`);
    assert.match(section, /<noscript>/, `${post.route} has no no-JS explanation`);
    assert.match(section, /data-comments-status/, `${post.route} has no status region`);
    assert.match(section, /data-comments-list/, `${post.route} has no list region`);
  }
  assert.ok(checked > 0, "no posts with comments enabled — the check would be vacuous");
});

test("a post that closes comments renders no comment markup", () => {
  for (const post of posts.filter((p) => !commentsEnabled(p))) {
    assert.doesNotMatch(post.html, /data-comments/, `${post.route} closes comments but shows them`);
  }
});

test("the comment section is a labelled region with a heading", () => {
  if (!apiConfigured) return;
  for (const post of posts.filter(commentsEnabled)) {
    assert.match(
      post.html,
      /<section[^>]*aria-labelledby="comments-heading"/,
      `${post.route} comment section is not labelled`,
    );
    assert.match(
      post.html,
      /<h2 id="comments-heading"/,
      `${post.route} comment heading is missing or not an h2`,
    );
  }
});

test("the stats row reserves its height and ships no control", () => {
  if (!apiConfigured) return;
  // Views, likes, stats and comments are all on every reading now.
  for (const post of posts) {
    const row = post.html.match(/<div[^>]*data-post-stats[^>]*>/)?.[0];
    assert.ok(row, `${post.route} has no stats row`);
    assert.match(row, new RegExp(`data-slug="${post.slug}"`), `stats row slug mismatch`);
    // Reserving height is what stops the numbers arriving and shoving the
    // comments below them down the page.
    assert.match(row, /min-h-\[/, `${post.route} stats row reserves no height`);

    // A like button in static HTML would do nothing without JavaScript.
    const section = post.html.slice(post.html.indexOf("data-post-stats"));
    const beforeComments = section.slice(0, section.indexOf("data-comments"));
    assert.doesNotMatch(beforeComments, /<button/, `${post.route} ships a like button in HTML`);
    assert.match(beforeComments, /data-post-stats-status/, `no status region in the stats row`);
  }
});

test("the view beacon is inert markup and renders nothing visible", () => {
  if (!apiConfigured) return;
  for (const post of posts) {
    const beacon = post.html.match(/<span[^>]*data-view-beacon[^>]*>/)?.[0];
    assert.ok(beacon, `${post.route} has no view beacon`);
    assert.match(beacon, /\shidden(\s|>)/, `${post.route} view beacon is not hidden`);
    assert.match(beacon, new RegExp(`data-slug="${post.slug}"`), `beacon slug mismatch`);
  }
});

test("comment code is lazily loaded, not part of the page's initial scripts", () => {
  if (!apiConfigured) return;
  const post = posts.find(commentsEnabled);
  const eager = [...post.html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);

  // The mount module holds the comment UI. Loading it eagerly on every page
  // would defeat the point of waiting for the reader to ask for it.
  for (const src of eager) {
    assert.ok(!/\/mount\./.test(src), `${src} is loaded eagerly; it should be a dynamic import`);
  }
  // It must still exist as its own chunk, or the dynamic import was inlined.
  const chunks = readdirSync(join(dist, "_astro"));
  assert.ok(
    chunks.some((f) => /^mount\..*\.js$/.test(f)),
    "no separate mount chunk was emitted",
  );
});

test("comments open on an explicit request, not on scroll", () => {
  if (!apiConfigured) return;

  // The bootstrap must not observe the viewport: the reader asks for comments
  // by pressing a control, and nothing is fetched before that.
  const bootstrap = readdirSync(join(dist, "_astro"))
    .filter((f) => /^Comments\.astro.*\.js$/.test(f))
    .map((f) => readFileSync(join(dist, "_astro", f), "utf8"))
    .join("\n");

  assert.ok(bootstrap.length > 0, "no Comments bootstrap chunk was emitted");
  assert.ok(
    !bootstrap.includes("IntersectionObserver"),
    "comments still load from a viewport trigger; they must wait for a click",
  );
  assert.match(bootstrap, /addEventListener\(\s*[`"']click[`"']/, "no click handler wires the opener");

  // And the opener itself is script-injected, so no-JS readers get no control.
  for (const post of posts.filter(commentsEnabled)) {
    const section = post.html.slice(post.html.indexOf("data-comments"));
    assert.match(section, /data-comments-open/, `${post.route} has no opener slot`);
    assert.doesNotMatch(section, /<button/, `${post.route} ships the opener button in HTML`);
  }
});

test("every reading carries a comment section", () => {
  if (!apiConfigured) return;
  for (const collection of ["blog", "projects", "reviews"]) {
    const inCollection = posts.filter((p) => p.collection === collection && commentsEnabled(p));
    assert.ok(inCollection.length > 0, `no ${collection} pages found`);
    for (const post of inCollection) {
      assert.match(post.html, /data-comments/, `${post.route} has no comment section`);
    }
  }
});

test("slugs are unique across every collection", () => {
  // The backend's content registry keys on slug alone — `content_items.slug`
  // is its primary key, shared by posts, projects and reviews. Two entries
  // with the same slug in different collections would be one row there, and
  // their comments would merge.
  const seen = new Map();
  for (const post of posts) {
    const clash = seen.get(post.slug);
    assert.ok(
      !clash,
      `slug "${post.slug}" is used by both ${clash} and ${post.collection}; ` +
        `the API keys comments on slug alone, so their threads would merge`,
    );
    seen.set(post.slug, post.collection);
  }
});
