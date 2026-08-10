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
const contentDir = join(root, "src", "content", "blog");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

/** Blog post pages, as { slug, html }. */
const posts = readdirSync(contentDir)
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => f.replace(/\.mdx$/, ""))
  .map((slug) => ({
    slug,
    file: join(dist, "blog", slug, "index.html"),
    frontmatter: readFileSync(join(contentDir, `${slug}.mdx`), "utf8").split(/^---$/m)[1],
  }))
  .filter((p) => existsSync(p.file))
  .map((p) => ({ ...p, html: readFileSync(p.file, "utf8") }));

/** Was the build given an API base? Inferred from the output itself, so the
    suite is correct for a configured and an unconfigured build alike. */
const apiConfigured = posts.some((p) => p.html.includes("data-comments"));

const commentsEnabled = (p) => !/^comments:\s*false\b/m.test(p.frontmatter);

// ── Source guards ────────────────────────────────────────────────────────

test("comment rendering never writes HTML from untrusted values", () => {
  // Comment bodies and author names come from the database and are echoed to
  // every reader. The whole defence is that they are only ever assigned with
  // textContent, so any HTML-writing sink appearing in this file is a bug,
  // not a style preference.
  const source = readFileSync(join(root, "src", "features", "comments", "mount.ts"), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
    assert.ok(!code.includes(sink), `mount.ts uses ${sink}; comment text must go through textContent`);
  }
  assert.ok(code.includes("textContent"), "mount.ts should render text with textContent");
});

test("the API client is the only thing that calls fetch", () => {
  // Scattered fetch() calls are how base URLs, timeouts and validation drift
  // apart. Everything must go through apiRequest in src/lib/api.ts.
  const libDir = join(root, "src", "lib");
  const offenders = [];
  for (const file of readdirSync(libDir)) {
    if (file === "api.ts" || !file.endsWith(".ts")) continue;
    if (readFileSync(join(libDir, file), "utf8").includes("fetch(")) offenders.push(file);
  }
  const featureFile = join(root, "src", "features", "comments", "mount.ts");
  if (readFileSync(featureFile, "utf8").includes("fetch(")) offenders.push("features/comments/mount.ts");

  assert.deepEqual(offenders, [], `these call fetch() directly instead of using apiRequest`);
});

// ── Emitted markup ───────────────────────────────────────────────────────

test("posts render the article regardless of the comment fragment", () => {
  for (const post of posts) {
    assert.match(post.html, /<article class="mdx-content">/, `/blog/${post.slug} lost its article`);
    // The article must not be nested inside the comment section, or a failure
    // there could take the post with it.
    const article = post.html.indexOf('<article class="mdx-content">');
    const section = post.html.indexOf("data-comments");
    if (section !== -1) {
      assert.ok(article < section, `/blog/${post.slug} renders the article after the comments`);
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
      `/blog/${post.slug} comment section has the wrong slug`,
    );
    // Static HTML carries the heading and the reserved regions only. The list
    // and the form are built by the client module, so a reader without
    // JavaScript is never shown a control that cannot work.
    const section = post.html.slice(post.html.indexOf("data-comments"));
    assert.doesNotMatch(section, /<form/, `/blog/${post.slug} ships a comment form in HTML`);
    assert.doesNotMatch(section, /<li[\s>]/, `/blog/${post.slug} ships pre-rendered comments`);
    assert.match(section, /<noscript>/, `/blog/${post.slug} has no no-JS explanation`);
    assert.match(section, /data-comments-status/, `/blog/${post.slug} has no status region`);
    assert.match(section, /data-comments-list/, `/blog/${post.slug} has no list region`);
  }
  assert.ok(checked > 0, "no posts with comments enabled — the check would be vacuous");
});

test("a post that closes comments renders no comment markup", () => {
  for (const post of posts.filter((p) => !commentsEnabled(p))) {
    assert.doesNotMatch(post.html, /data-comments/, `/blog/${post.slug} closes comments but shows them`);
  }
});

test("the comment section is a labelled region with a heading", () => {
  if (!apiConfigured) return;
  for (const post of posts.filter(commentsEnabled)) {
    assert.match(
      post.html,
      /<section[^>]*aria-labelledby="comments-heading"/,
      `/blog/${post.slug} comment section is not labelled`,
    );
    assert.match(
      post.html,
      /<h2 id="comments-heading"/,
      `/blog/${post.slug} comment heading is missing or not an h2`,
    );
  }
});

test("the view beacon is inert markup and renders nothing visible", () => {
  if (!apiConfigured) return;
  for (const post of posts) {
    const beacon = post.html.match(/<span[^>]*data-view-beacon[^>]*>/)?.[0];
    assert.ok(beacon, `/blog/${post.slug} has no view beacon`);
    assert.match(beacon, /\shidden(\s|>)/, `/blog/${post.slug} view beacon is not hidden`);
    assert.match(beacon, new RegExp(`data-slug="${post.slug}"`), `beacon slug mismatch`);
  }
});

test("comment code is lazily loaded, not part of the page's initial scripts", () => {
  if (!apiConfigured) return;
  const post = posts.find(commentsEnabled);
  const eager = [...post.html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);

  // The mount module holds the comment UI. Loading it eagerly on every post
  // would defeat the point of deferring it until the section is in view.
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
