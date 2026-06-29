import { getCollection, type CollectionEntry } from "astro:content";

// ── Content access layer ─────────────────────────────────────────────────
// Single seam between pages and the content source. Today everything comes
// from local content collections (MDX + JSON). When a Go backend + database
// land, swap the *bodies* of these functions to fetch from the API (see
// src/lib/api.ts) — page components, schemas, and call sites stay unchanged.
//
// Keeping all collection access here (rather than calling getCollection in
// pages) is what makes that future swap a one-file change.

export type ProjectEntry = CollectionEntry<"projects">;
export type BlogEntry = CollectionEntry<"blog">;
export type ReviewEntry = CollectionEntry<"reviews">;

export async function getProjects(): Promise<ProjectEntry[]> {
  const entries = await getCollection("projects");
  return entries.sort((a, b) => a.data.order - b.data.order);
}

export async function getProject(id: string): Promise<ProjectEntry | undefined> {
  const entries = await getCollection("projects");
  return entries.find((p) => p.id === id);
}

export async function getBlogPosts(): Promise<BlogEntry[]> {
  const entries = await getCollection("blog");
  return entries.sort((a, b) => b.data.date.localeCompare(a.data.date));
}

export async function getBlogPost(id: string): Promise<BlogEntry | undefined> {
  const entries = await getCollection("blog");
  return entries.find((p) => p.id === id);
}

export async function getReviews(): Promise<ReviewEntry[]> {
  const entries = await getCollection("reviews");
  return entries.sort((a, b) => b.data.date.localeCompare(a.data.date));
}
