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

// Explicit .ts extensions, as in src/lib/api.ts: the cache helpers below are
// imported directly by test/stats-cache.test.mjs, and Node's ESM resolver
// (unlike Vite's) will not guess them. Do not "tidy" these away.
import { apiRequest, ApiError } from "./api.ts";
import { isPostStats, isValidSlug, type PostStats } from "./api-contract.ts";

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

// ── Short-lived stats cache ──────────────────────────────────────────────
// The site is multi-page: every navigation is a fresh document, so nothing
// survives in memory. Without this, browsing four posts and coming back to the
// first re-queries /stats five times for numbers that barely move.
//
// sessionStorage rather than localStorage, and a short TTL, because these are
// *live counters*. The cache exists to avoid re-asking within one browsing
// session, not to remember totals across days — a stale number is the one
// failure mode that makes this feature look broken.
//
// Deliberately stats-only. Comments are not cached: a thread that omits the
// comment you just posted is worse than a re-fetch.
//
// This is a client-side memo, nothing more. The API still sends
// `Cache-Control: no-store` and apiRequest still uses `cache: "no-store"`, so
// a request that *is* made is never served from the HTTP cache.

/** How long a cached snapshot stays usable. Long enough to cover a burst of
    navigation, short enough that a counter is never visibly wrong. */
export const STATS_CACHE_TTL_MS = 60_000;

const statsKey = (slug: string) => `stats:${slug}`;

/** sessionStorage, or null where it is unavailable (private modes throw on
    access rather than returning null). Injectable so the cache is testable. */
function sessionStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A cached snapshot for this slug, or null when there is none, it has expired,
 * or it does not look like stats any more.
 *
 * The value is validated on read: sessionStorage is user-writable, and a
 * tampered or half-written entry must not reach the page as if the API had
 * returned it.
 */
export function readCachedStats(
  slug: string,
  now: number = Date.now(),
  store: Storage | null = sessionStore(),
): PostStats | null {
  if (!store) return null;

  let parsed: unknown;
  try {
    const raw = store.getItem(statsKey(slug));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { at, ...stats } = parsed as { at?: unknown };
  if (!isPostStats(stats)) return null;
  // A future timestamp means a changed clock or a tampered entry; treat it as
  // unusable rather than trusting it until `now` catches up.
  if (typeof at !== "number" || !Number.isFinite(at) || at > now) return null;
  if (now - at > STATS_CACHE_TTL_MS) return null;

  return stats;
}

export function writeCachedStats(
  slug: string,
  stats: PostStats,
  now: number = Date.now(),
  store: Storage | null = sessionStore(),
): void {
  if (!store) return;
  try {
    store.setItem(statsKey(slug), JSON.stringify({ ...stats, at: now }));
  } catch {
    // Full or disabled storage. The page already has its numbers; only the
    // memo is lost, and the next view simply re-fetches.
  }
}
