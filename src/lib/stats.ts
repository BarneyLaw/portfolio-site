// Post statistics and likes, per openapi.yaml.
//
// Read and write live together because one component uses both: the stats row
// shows the totals and owns the like button. View *recording* stays in
// src/lib/views.ts — that runs eagerly on every post and must not pull this
// module into its chunk.
//
// ── Why the like state is not stored here ────────────────────────────────
// The API exposes aggregate totals and two idempotent state assertions
// (PUT = "I like this", DELETE = "I don't"), but nothing that answers "does
// *this* visitor already like it?". The server identifies the visitor itself;
// the frontend cannot ask.
//
// So the button's own on/off state is a *local memory* only — see
// readLocalLike/writeLocalLike below. It can legitimately disagree with the
// server: clear your storage, or open the post on another device, and the
// button shows unliked while the server still holds your like. That is
// harmless precisely because the endpoints are idempotent — pressing like
// again asserts the same state rather than adding a second one. Do not
// "improve" this into a counter-style POST without a per-visitor read.

import { apiRequest, ApiError } from "./api";
import { isPostStats, isValidSlug, type PostStats } from "./api-contract";

function postPath(slug: string, suffix: string): string {
  if (!isValidSlug(slug)) {
    throw new ApiError("http", 400, `Refusing to request an invalid slug: ${slug}`);
  }
  return `/posts/${encodeURIComponent(slug)}${suffix}`;
}

/** GET /posts/{slug}/stats — public view and like totals. */
export function getPostStats(slug: string, signal?: AbortSignal): Promise<PostStats> {
  return apiRequest<PostStats>(postPath(slug, "/stats"), {
    validate: isPostStats,
    signal,
  });
}

/**
 * PUT/DELETE /posts/{slug}/like — assert the desired state rather than
 * incrementing, so a retry after a timeout cannot double-count.
 */
export function setPostLiked(
  slug: string,
  liked: boolean,
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(postPath(slug, "/like"), {
    method: liked ? "PUT" : "DELETE",
    expectNoContent: true,
    signal,
  });
}

/** Storage key for this visitor's own like, per post. */
const likeKey = (slug: string) => `like:${slug}`;

/**
 * Whether this browser remembers liking the post.
 *
 * This is UI memory, not authority — see the note at the top of this file.
 * Storage can be unavailable entirely (private modes throw on access), in
 * which case the button simply starts unpressed.
 */
export function readLocalLike(slug: string): boolean {
  try {
    return localStorage.getItem(likeKey(slug)) === "1";
  } catch {
    return false;
  }
}

export function writeLocalLike(slug: string, liked: boolean): void {
  try {
    if (liked) localStorage.setItem(likeKey(slug), "1");
    else localStorage.removeItem(likeKey(slug));
  } catch {
    // Nothing to do: the like still reached the server, and the button shows
    // the right state for this page view. Only the memory is lost.
  }
}
