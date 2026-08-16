// The content registry manifest that the Go backend synchronises.
//
// ## Why this suite is worth its weight
//
// The manifest is a *complete* snapshot (`mode: "full"`). The sync job archives
// every row it owns whose slug the manifest does not list, and it cannot tell a
// deliberate removal from a generator that dropped a whole collection — both
// look identical from its side. The backend contract says so explicitly:
// "frontend CI must test that the generator enumerates every configured
// collection." That test is `manifest covers every configured collection`
// below.
//
// Archiving does not destroy comments, views or likes, and re-listing a slug
// restores them, so a mistake here is recoverable — but it would still pull
// every affected page's interactions out of public view until someone noticed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../src/lib/json-schema.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const manifestPath = join(dist, "content-registry.json");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const schema = JSON.parse(
  readFileSync(join(root, "schema", "content-registry.schema.json"), "utf8"),
);

/** The collections the site actually has on disk, and their manifest `kind`. */
const COLLECTIONS = { blog: "blog", projects: "project", reviews: "review" };

/** Frontmatter of every entry, whatever its publication state. */
const sourceEntries = Object.keys(COLLECTIONS).flatMap((collection) =>
  readdirSync(join(root, "src", "content", collection))
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => ({
      slug: file.replace(/\.mdx$/, ""),
      collection,
      frontmatter: readFileSync(join(root, "src", "content", collection, file), "utf8").split(
        /^---$/m,
      )[1],
    })),
);

const today = new Date().toISOString().slice(0, 10);

/** Mirrors the publication rules in src/lib/content.ts. */
function isPublished(entry) {
  if (/^draft:\s*true\b/m.test(entry.frontmatter)) return false;
  const date = entry.frontmatter.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1];
  return date === undefined || date <= today;
}

const commentsEnabled = (entry) => /^comments:\s*true\b/m.test(entry.frontmatter);

test("the build emits a manifest", () => {
  assert.ok(existsSync(manifestPath), "dist/content-registry.json was not generated");
});

test("manifest satisfies the backend's own JSON Schema", () => {
  // The schema is vendored verbatim from the backend repository, so this is
  // the same contract its sync command enforces before touching the database.
  const errors = validateAgainstSchema(manifest, schema);
  assert.deepEqual(errors, [], `schema violations:\n  ${errors.join("\n  ")}`);
});

test("manifest is a full snapshot from this source", () => {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.mode, "full", "a delta manifest is never accepted");
  assert.equal(manifest.source, "portfolio-site");
  assert.match(
    manifest.revision,
    /^[a-f0-9]{7,64}$/,
    "revision must be a lowercase hex commit id so a deployed registry is traceable",
  );
});

test("manifest covers every configured collection", () => {
  // THE important one. A generator bug that skipped a collection would archive
  // all of its content, and the backend cannot detect that for us.
  const kinds = new Set(manifest.items.map((item) => item.kind));
  for (const [collection, kind] of Object.entries(COLLECTIONS)) {
    assert.ok(
      kinds.has(kind),
      `no item of kind "${kind}" — every ${collection} entry would be archived`,
    );
  }
});

test("manifest lists every entry on disk, drafts included", () => {
  // Omission is what archives, so an unpublished entry must still appear —
  // as `draft`, not as an absence.
  const listed = new Set(manifest.items.map((item) => item.slug));
  for (const entry of sourceEntries) {
    assert.ok(
      listed.has(entry.slug),
      `${entry.collection}/${entry.slug} is missing; publishing this would archive it`,
    );
  }
  assert.equal(
    manifest.items.length,
    sourceEntries.length,
    "manifest item count does not match the entries on disk",
  );
});

test("status mirrors the site's own publication rule", () => {
  for (const entry of sourceEntries) {
    const item = manifest.items.find((i) => i.slug === entry.slug);
    assert.equal(
      item.status,
      isPublished(entry) ? "published" : "draft",
      `${entry.slug}: manifest status disagrees with what the site publishes`,
    );
    assert.notEqual(
      item.status,
      "archived",
      `${entry.slug}: "archived" is the backend's state for an omitted slug, never ours to declare`,
    );
  }
});

test("comments_enabled requires an explicit opt-in", () => {
  for (const entry of sourceEntries) {
    const item = manifest.items.find((i) => i.slug === entry.slug);
    assert.equal(
      item.comments_enabled,
      commentsEnabled(entry),
      `${entry.slug}: comments_enabled must come from an explicit "comments: true"`,
    );
  }
});

test("kinds match the collection each entry came from", () => {
  for (const entry of sourceEntries) {
    const item = manifest.items.find((i) => i.slug === entry.slug);
    assert.equal(item.kind, COLLECTIONS[entry.collection], `${entry.slug}: wrong kind`);
  }
});

test("slugs are unique and sorted", () => {
  const slugs = manifest.items.map((item) => item.slug);
  assert.deepEqual(
    slugs,
    [...slugs].sort((a, b) => a.localeCompare(b)),
    "items must be sorted by slug so the GitOps diff is stable",
  );
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug in the manifest");
});

test("the schema validator rejects the failures that matter", () => {
  // The validator is hand-written, so it is worth proving it actually says no —
  // a validator that accepted everything would make the check above worthless.
  const valid = {
    schema_version: 1,
    mode: "full",
    source: "portfolio-site",
    revision: "abc1234",
    items: [{ slug: "a-post", kind: "blog", status: "published", comments_enabled: true }],
  };
  assert.deepEqual(validateAgainstSchema(valid, schema), []);

  const broken = {
    "wrong schema_version": { ...valid, schema_version: 2 },
    "delta mode": { ...valid, mode: "delta" },
    "foreign source": { ...valid, source: "somewhere-else" },
    "non-hex revision": { ...valid, revision: "NOT-HEX" },
    "short revision": { ...valid, revision: "abc" },
    "empty items": { ...valid, items: [] },
    "unknown top-level field": { ...valid, extra: true },
    "uppercase slug": { ...valid, items: [{ ...valid.items[0], slug: "Bad-Slug" }] },
    "slug with underscore": { ...valid, items: [{ ...valid.items[0], slug: "bad_slug" }] },
    "bad status": { ...valid, items: [{ ...valid.items[0], status: "hidden" }] },
    "missing comments_enabled": {
      ...valid,
      items: [{ slug: "a", kind: "blog", status: "draft" }],
    },
    "non-boolean comments_enabled": {
      ...valid,
      items: [{ ...valid.items[0], comments_enabled: "yes" }],
    },
    "unknown item field": { ...valid, items: [{ ...valid.items[0], extra: 1 }] },
  };

  for (const [label, value] of Object.entries(broken)) {
    assert.ok(
      validateAgainstSchema(value, schema).length > 0,
      `validator accepted an invalid manifest: ${label}`,
    );
  }
});
