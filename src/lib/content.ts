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
