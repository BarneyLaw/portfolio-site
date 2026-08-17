// ── Post stats row ───────────────────────────────────────────────────────
// View and like totals, plus the like button. Loaded on demand by
// src/components/astro/PostStats.astro when the row nears the viewport.
//
// Entirely optional: the article is complete without it, and every failure
// path below leaves the row saying so rather than disturbing the page. The
// row reserves its height in the static HTML so populating it never shifts
// what is underneath.

import { ApiError } from "../../lib/api";
import {
  getPostStats,
  readCachedStats,
  readLocalLike,
  setPostLiked,
  writeCachedStats,
  writeLocalLike,
} from "../../lib/stats";

const BUTTON =
  "inline-flex items-center gap-1.5 text-[13px] font-mono px-2.5 py-1 rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const LIKED = "border-primary text-primary bg-primary/5";
const UNLIKED = "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground";

const numberFormat = new Intl.NumberFormat();

/** Views and likes are int64; format with grouping, and never as raw HTML. */
const plural = (n: number, one: string, many: string) =>
  `${numberFormat.format(n)} ${n === 1 ? one : many}`;

export function mountPostStats(root: HTMLElement): () => void {
  const slug = root.dataset.slug;
  const statusEl = root.querySelector<HTMLElement>("[data-post-stats-status]");
  if (!slug || !statusEl) return () => {};

  const controller = new AbortController();
  const dispose = () => controller.abort();

  // Local memory only — the API has no per-visitor read. See src/lib/stats.ts.
  let liked = readLocalLike(slug);
  let likes = 0;
  // Kept alongside `likes` so the cache can be rewritten after a like without
  // re-fetching just to learn the view count again.
  let views = 0;
  let busy = false;

  const viewsEl = document.createElement("span");
  viewsEl.className = "text-[13px] font-mono text-muted-foreground";

  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = `${BUTTON} ${UNLIKED}`;

  // The heart is decoration — the button's accessible name comes from the
  // aria-label set in paint(), which spells out both the action and the count.
  const heart = document.createElement("span");
  heart.textContent = "♥";
  heart.setAttribute("aria-hidden", "true");

  const likeLabel = document.createElement("span");
  likeButton.append(heart, likeLabel);

  const paint = () => {
    likeLabel.textContent = plural(likes, "like", "likes");
    likeButton.className = `${BUTTON} ${liked ? LIKED : UNLIKED}`;
    likeButton.setAttribute("aria-pressed", String(liked));
    likeButton.setAttribute(
      "aria-label",
      liked
        ? `Unlike this post. ${plural(likes, "like", "likes")}`
        : `Like this post. ${plural(likes, "like", "likes")}`,
    );
  };

  likeButton.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    likeButton.disabled = true;

    // Optimistic: flip immediately, roll back if the server disagrees. The
    // endpoints assert a state rather than incrementing, so a retry after a
    // timeout cannot double-count.
    const previousLiked = liked;
    const previousLikes = likes;
    liked = !liked;
    likes = Math.max(0, likes + (liked ? 1 : -1));
    paint();

    try {
      await setPostLiked(slug, liked, controller.signal);
      writeLocalLike(slug, liked);
      // Keep the memo in step with what the reader just did, or navigating
      // away and back within the TTL would show the pre-like total and look
      // like the like was lost.
      writeCachedStats(slug, { views, likes });
      statusEl.textContent = "";
    } catch (error) {
      if (controller.signal.aborted) return;
      liked = previousLiked;
      likes = previousLikes;
      paint();
      statusEl.textContent =
        error instanceof ApiError && error.kind === "http" && error.status === 404
          ? "Likes are not available for this post."
          : "That did not save. Try again.";
    } finally {
      busy = false;
      likeButton.disabled = false;
    }
  });

  const spinner = root.querySelector<HTMLElement>("[data-post-stats-spinner]");
  const setLoading = (busy: boolean) => {
    if (spinner) spinner.hidden = !busy;
  };

  /** Renders a set of totals and reveals the control they belong to. */
  const show = (stats: { views: number; likes: number }) => {
    views = stats.views;
    likes = stats.likes;
    viewsEl.textContent = plural(views, "view", "views");
    paint();
    // Only offer the control once the totals it mutates are known.
    root.append(viewsEl, likeButton);
    statusEl.textContent = "";
  };

  (async () => {
    // A recent snapshot from this browsing session paints straight away — no
    // spinner, no request. Every navigation is a fresh document on this site,
    // so without it, revisiting a post re-queries totals that barely move.
    const cached = readCachedStats(slug);
    if (cached) {
      show(cached);
      return;
    }

    setLoading(true);
    try {
      const stats = await getPostStats(slug, controller.signal);
      show(stats);
      writeCachedStats(slug, stats);
    } catch (error) {
      if (controller.signal.aborted) return;
      // No numbers means no meaningful like button either, so show nothing
      // but an honest line. The article is unaffected.
      statusEl.textContent =
        error instanceof ApiError && error.status === 404
          ? ""
          : "Stats are unavailable right now.";
    } finally {
      // Cleared on both paths: a spinner left turning after a failure claims
      // work is still happening when it is not.
      setLoading(false);
    }
  })();

  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
