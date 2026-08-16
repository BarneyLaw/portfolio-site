// ── Content registry manifest ────────────────────────────────────────────
// The complete snapshot of content identity and comment policy that the Go
// backend synchronises into `content_items`. Emitted by
// src/pages/content-registry.json.ts as dist/content-registry.json, which CI
// copies into the GitOps repository.
//
// ── Read this before changing anything here ──────────────────────────────
// The snapshot is authoritative and complete: `mode: "full"`. The sync job
// archives every registry row it owns whose slug is absent from the manifest.
//
// It cannot tell a deliberate removal from a generator bug that dropped a whole
// collection — both look like "those slugs are gone". A manifest that silently
// omitted `reviews` would archive every review, taking their comment threads
// out of public view. Archiving does not delete comments, views or likes, and
// restoring the slug brings the history back, so this is recoverable rather
// than catastrophic; it is still a public outage of every affected page's
// interactions.
//
// That is why buildManifest throws rather than returning a partial result, and
// why test/content-registry.test.mjs asserts every configured collection is
// represented.

import { getRegistryEntries, REGISTERED_COLLECTIONS, type RegisteredCollection } from "./content";
import { validateAgainstSchema, type JsonSchema } from "./json-schema";

/** Matches api/content-registry.schema.json in the backend repository. */
export interface RegistryItem {
  slug: string;
  kind: string;
  status: "draft" | "published" | "archived";
  comments_enabled: boolean;
}

export interface RegistryManifest {
  schema_version: 1;
  mode: "full";
  source: "portfolio-site";
  revision: string;
  items: RegistryItem[];
}

/**
 * Collection → the `kind` recorded against the row.
 *
 * `kind` is descriptive metadata: the backend's allowlist is the row's
 * existence, and nothing authorizes on kind (its published check reads
 * `status` and `comments_enabled` by slug alone). It still wants to be
 * accurate, because it is what a human reads in the table.
 *
 * Note the four blog rows were originally seeded as `post` by backend
 * migration 000002. This mapping follows the contract's own example, which
 * uses `blog`, so the first sync rewrites that column on those four rows.
 * Harmless — but it is a real change, so it is called out rather than
 * discovered.
 */
const KIND_BY_COLLECTION: Record<RegisteredCollection, string> = {
  blog: "blog",
  projects: "project",
  reviews: "review",
};

/** The identifier this site claims ownership under. The sync job will only
    update or archive rows whose `managed_by` matches, so this must not drift. */
const SOURCE = "portfolio-site";

/** Lowercase hex, 7–64 characters, per the schema. */
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/;

/**
 * The commit this manifest describes.
 *
 * Fails loudly rather than inventing a placeholder: the revision is how an
 * operator ties a deployed registry back to the content that produced it, and
 * a fake one is worse than a failed build.
 */
export function resolveRevision(env: Record<string, string | undefined>): string {
  const candidate = (env.GITHUB_SHA ?? env.CONTENT_REVISION ?? "").trim().toLowerCase();
  if (candidate) {
    if (!REVISION_PATTERN.test(candidate)) {
      throw new Error(
        `Content registry revision "${candidate}" is not 7-64 lowercase hex characters. ` +
          `Set GITHUB_SHA or CONTENT_REVISION to a commit id.`,
      );
    }
    return candidate;
  }
  return "";
}

export interface BuildManifestOptions {
  revision: string;
  /** The vendored backend schema. Validation is skipped when absent. */
  schema?: JsonSchema;
}

/**
 * Builds and validates the complete snapshot.
 *
 * Throws on anything that would produce a manifest the backend should not act
 * on: a missing revision, a duplicate slug, an unrepresented collection, or a
 * schema violation. Every one of those is better as a failed build than as a
 * deployed archive sweep.
 */
export async function buildManifest(options: BuildManifestOptions): Promise<RegistryManifest> {
  const { revision, schema } = options;

  if (!revision) {
    throw new Error(
      "Content registry needs a revision. Set GITHUB_SHA (CI sets this automatically) " +
        "or CONTENT_REVISION to the frontend commit id.",
    );
  }

  const entries = await getRegistryEntries();

  // A generator that skipped a collection is the failure mode the backend
  // cannot detect for us, so it is checked here first and hardest.
  const present = new Set(entries.map((entry) => entry.collection));
  const missing = REGISTERED_COLLECTIONS.filter((collection) => !present.has(collection));
  if (missing.length > 0) {
    throw new Error(
      `Content registry is missing every entry from: ${missing.join(", ")}. ` +
        `Publishing this snapshot would archive that content and hide its comments. ` +
        `If a collection is genuinely empty, remove it from REGISTERED_COLLECTIONS deliberately.`,
    );
  }

  // Slugs are the API's only key — /posts/{slug} has no collection segment —
  // so a duplicate would attach two pages' interactions to one row.
  const seen = new Map<string, RegisteredCollection>();
  for (const entry of entries) {
    const clash = seen.get(entry.slug);
    if (clash) {
      throw new Error(
        `Duplicate content slug "${entry.slug}" in both ${clash} and ${entry.collection}. ` +
          `The interaction API is keyed on slug alone, so their comments would merge.`,
      );
    }
    seen.set(entry.slug, entry.collection);
  }

  const items: RegistryItem[] = entries
    // Sorted so the file has a stable diff in the GitOps repository; an
    // unordered manifest would churn on every build.
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => ({
      slug: entry.slug,
      kind: KIND_BY_COLLECTION[entry.collection],
      // Never "archived": that is the backend's word for something this
      // manifest stopped listing, not a state the site can declare.
      status: entry.published ? "published" : "draft",
      comments_enabled: entry.commentsEnabled,
    }));

  const manifest: RegistryManifest = {
    schema_version: 1,
    mode: "full",
    source: SOURCE,
    revision,
    items,
  };

  if (schema) {
    const errors = validateAgainstSchema(manifest, schema);
    if (errors.length > 0) {
      throw new Error(
        `Content registry does not satisfy content-registry.schema.json:\n  ${errors.join("\n  ")}`,
      );
    }
  }

  return manifest;
}
