import { getCollection, type CollectionEntry } from "astro:content";

// ── Content access layer ─────────────────────────────────────────────────
// Single seam between pages and the content source. Today everything comes
// from local MDX content collections. When a Go backend + database
// land, swap the *bodies* of these functions to fetch from the API (see
// src/lib/api.ts) — page components, schemas, and call sites stay unchanged.
//
// Keeping all collection access here (rather than calling getCollection in
// pages) is what makes that future swap a one-file change.
//
// ── Publication rules (the whole contract, in one place) ──────────────────
//
// 1. An entry is PUBLISHED when `draft` is false and its `date` is not in the
//    future. Projects have no date, so only `draft` applies to them.
// 2. Unpublished entries are invisible to the entire build: they are absent
//    from lists, feeds, sitemaps, AND from getStaticPaths, so no detail route
//    is emitted for them. There is no "unlisted but reachable" state.
// 3. Ordering is total, never dependent on filesystem or glob order. Posts and
//    reviews sort by date descending then id ascending; projects sort by
//    `order` ascending then id ascending. Two entries can never tie.
// 4. The FEATURED post is the newest published post carrying `featured: true`.
//    If several are flagged, rule 3 breaks the tie — the flag is a nomination,
//    not a guarantee. If none is flagged, the newest published post stands in,
//    so the hero card is only ever empty when there are no posts at all.
//
// Every list here is safe on an empty collection: callers get `[]` or
// `undefined`, never a throw.

export type ProjectEntry = CollectionEntry<"projects">;
export type BlogEntry = CollectionEntry<"blog">;
export type ReviewEntry = CollectionEntry<"reviews">;

/** Today, in the entry `date` format, resolved once so a slow build cannot
    straddle midnight and emit two different sets of pages. */
const BUILD_DATE = new Date().toISOString().slice(0, 10);

/** Rule 1. `date` is schema-validated as YYYY-MM-DD, so this string compare is
    a real chronological compare. */
function isPublished(entry: { data: { draft: boolean; date?: string } }): boolean {
  if (entry.data.draft) return false;
  return entry.data.date === undefined || entry.data.date <= BUILD_DATE;
}

/** Rule 3, for dated collections: newest first, id breaking ties. */
function byDateDesc(
  a: { id: string; data: { date: string } },
  b: { id: string; data: { date: string } },
): number {
  return b.data.date.localeCompare(a.data.date) || a.id.localeCompare(b.id);
}

export async function getProjects(): Promise<ProjectEntry[]> {
  const entries = await getCollection("projects", isPublished);
  return entries.sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

export async function getProject(id: string): Promise<ProjectEntry | undefined> {
  return (await getProjects()).find((p) => p.id === id);
}

export async function getBlogPosts(): Promise<BlogEntry[]> {
  const entries = await getCollection("blog", isPublished);
  return entries.sort(byDateDesc);
}

export async function getBlogPost(id: string): Promise<BlogEntry | undefined> {
  return (await getBlogPosts()).find((p) => p.id === id);
}

/** Rule 4. `undefined` only when there are no published posts at all. */
export async function getFeaturedPost(): Promise<BlogEntry | undefined> {
  const posts = await getBlogPosts();
  return posts.find((p) => p.data.featured) ?? posts[0];
}

export async function getReviews(): Promise<ReviewEntry[]> {
  const entries = await getCollection("reviews", isPublished);
  return entries.sort(byDateDesc);
}

export async function getReview(id: string): Promise<ReviewEntry | undefined> {
  return (await getReviews()).find((r) => r.id === id);
}

// ── Content registry ─────────────────────────────────────────────────────
// The backend keeps identity and policy (not bodies) for the entries it must
// authorize comments, views and likes for. It learns them from a manifest this
// site generates — see src/lib/registry.ts.
//
// This is the one place that needs *unpublished* entries too: the manifest is a
// complete snapshot, and anything missing from it gets archived by the sync
// job. So it deliberately does not reuse getBlogPosts() and friends, which
// filter drafts out. It does reuse `isPublished`, so the status it reports can
// never disagree with what the site actually builds.

/** Every collection whose entries the backend registry owns. The manifest must
    cover all of them; omitting one would archive that entire collection. */
export const REGISTERED_COLLECTIONS = ["blog", "projects", "reviews"] as const;

export type RegisteredCollection = (typeof REGISTERED_COLLECTIONS)[number];

export interface RegistryEntry {
  /** The API's `{slug}` path parameter. Unique across all collections. */
  slug: string;
  collection: RegisteredCollection;
  /** Same predicate the site uses to decide whether to emit a page. */
  published: boolean;
  /** Explicit opt-in only; the schema default is false. */
  commentsEnabled: boolean;
}

/**
 * Every entry in every registered collection, drafts and future-dated items
 * included, in no particular order. Callers sort.
 */
export async function getRegistryEntries(): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];

  for (const collection of REGISTERED_COLLECTIONS) {
    // Unfiltered on purpose — see the note above.
    for (const entry of await getCollection(collection)) {
      entries.push({
        slug: entry.id,
        collection,
        published: isPublished(entry),
        // `=== true` rather than a truthiness check: this value opens a public
        // write surface, so only a real boolean true may do it.
        commentsEnabled: entry.data.comments === true,
      });
    }
  }

  return entries;
}

/**
 * The image a social scraper should show for an entry: its cover art if it has
 * any, else its preview image, else nothing — in which case Layout falls back
 * to the site-wide card. Cover art wins because it is chosen to look good at
 * card size, while `image` is often a dense screenshot.
 */
export function socialImageOf(entry: {
  data: { coverArt?: ImageMetadata; image?: ImageMetadata };
}): ImageMetadata | undefined {
  return entry.data.coverArt ?? entry.data.image;
}
