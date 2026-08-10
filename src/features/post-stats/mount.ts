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
  readLocalLike,
  setPostLiked,
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

  (async () => {
    try {
      const stats = await getPostStats(slug, controller.signal);
      likes = stats.likes;
      viewsEl.textContent = plural(stats.views, "view", "views");
      paint();
      // Only offer the control once the totals it mutates are known.
      root.append(viewsEl, likeButton);
      statusEl.textContent = "";
    } catch (error) {
      if (controller.signal.aborted) return;
      // No numbers means no meaningful like button either, so show nothing
      // but an honest line. The article is unaffected.
      statusEl.textContent =
        error instanceof ApiError && error.status === 404
          ? ""
          : "Stats are unavailable right now.";
    }
  })();

  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
