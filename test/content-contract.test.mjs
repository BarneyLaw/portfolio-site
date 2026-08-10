// FEAT-202 — repository-backed content contract.
//
// Published blog, project and review content is file-backed and rendered at
// build time. The Go API exists only for capabilities that cannot be
// repository content (comments, views, likes). These tests are the guardrail
// on that boundary: they fail if public content ever starts coming from the
// network, or if the build stops being self-contained.
//
// The behavioural rules themselves (drafts, future dates, ordering) are
// enforced in test/build-output.test.mjs; this file is about *where the
// content comes from*.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const srcDir = join(root, "src");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

function walk(dir, filter = () => true) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path, filter) : filter(path) ? [path] : [];
  });
}

const rel = (path) => path.slice(root.length + 1).split(/[\\/]/).join("/");

const pageFiles = walk(join(srcDir, "pages"), (f) => /\.(astro|ts)$/.test(f));
const htmlFiles = walk(dist, (f) => f.endsWith(".html"));

test("pages read content through the content layer, never the API", () => {
  // src/lib/content.ts is the single content accessor. A page importing an API
  // module would mean a public entry could arrive over the network — the exact
  // thing this contract forbids.
  const apiModules = ["lib/api", "lib/comments", "lib/stats", "lib/views", "lib/api-contract"];

  for (const file of pageFiles) {
    const source = readFileSync(file, "utf8");
    const frontmatter = source.split("---")[1] ?? "";
    for (const module of apiModules) {
      assert.ok(
        !frontmatter.includes(module),
        `${rel(file)} imports ${module} at build time; content must come from src/lib/content.ts`,
      );
    }
  }
});

test("no page calls a content collection loader directly", () => {
  for (const file of pageFiles) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      !source.includes("getCollection("),
      `${rel(file)} calls getCollection directly; go through src/lib/content.ts`,
    );
  }
});

test("published content lives in the repository, not a database", () => {
  // A migration, a content table or a sync job would each be a step toward
  // the API becoming a content delivery service.
  const banned = [/\.sql$/i, /migrations?\//i, /schema\.prisma$/i];
  const offenders = walk(srcDir)
    .concat(existsSync(join(root, "scripts")) ? walk(join(root, "scripts")) : [])
    .filter((f) => banned.some((pattern) => pattern.test(rel(f))));

  assert.deepEqual(offenders.map(rel), [], "content persistence artifacts found");

  // And every published entry is still a file on disk.
  for (const collection of ["blog", "projects", "reviews"]) {
    const dir = join(srcDir, "content", collection);
    const entries = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
    assert.ok(entries.length > 0, `src/content/${collection} has no entries`);
  }
});

test("the built site carries its content without the backend", () => {
  // Every article body must be present in the emitted HTML. If a page were
  // fetching its content at runtime, the static file would be a shell.
  const detailRoutes = htmlFiles.filter((f) =>
    /[\\/](blog|projects|reviews)[\\/][^\\/]+[\\/]index\.html$/.test(f),
  );
  assert.ok(detailRoutes.length > 0, "no content detail routes were built");

  for (const file of detailRoutes) {
    const html = readFileSync(file, "utf8");
    const article = html.match(/<article class="mdx-content">([\s\S]*?)<\/article>/)?.[1] ?? "";
    const text = article.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(
      text.length > 200,
      `${rel(file)} has almost no rendered body — is it being fetched at runtime?`,
    );
  }
});

test("content pages ship no runtime fetch of their own content", () => {
  // The only scripts on a content page should be the optional fragments.
  // A content page that fetched its own text would show a flash of nothing.
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join("\n");
    // The pre-paint theme bootstrap is the only inline script that should
    // exist, and it touches localStorage, not the network.
    assert.ok(!inline.includes("fetch("), `${rel(file)} has an inline fetch()`);
  }
});

test("adding content requires no build-time network access", () => {
  // The build must not reach out for content, or a rebuild would depend on the
  // backend being up — and publishing would stop being "edit a file, rebuild".
  // Literal URLs are fine here (the default origin is one); a fetch is not.
  for (const file of [
    join(root, "astro.config.mjs"),
    join(srcDir, "content.config.ts"),
    join(srcDir, "lib", "content.ts"),
  ]) {
    const code = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    assert.ok(!code.includes("fetch("), `${rel(file)} fetches during the build`);
  }
});

test("dist is complete: every emitted page is static HTML on disk", () => {
  for (const file of htmlFiles) {
    assert.ok(statSync(file).size > 0, `${rel(file)} is empty`);
  }
});
