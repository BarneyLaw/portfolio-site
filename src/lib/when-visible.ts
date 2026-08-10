/**
 * Runs `load` once, when `element` is close to the viewport.
 *
 * Used by the optional fragments at the bottom of a blog post (comments, the
 * stats row) so their code and their requests belong to readers who actually
 * reach them. Most readers of a long post never scroll that far.
 *
 * Falls back to running immediately where IntersectionObserver is missing:
 * loading early is a far better failure than never loading at all.
 */
export function whenVisible(
  element: Element,
  load: () => void,
  // Start a little before the element appears, so the content is usually
  // there by the time it is actually on screen.
  rootMargin = "300px",
): void {
  if (!("IntersectionObserver" in window)) {
    load();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    // Disconnect first: `load` may be slow, and this must not fire twice.
    observer.disconnect();
    load();
  }, { rootMargin });

  observer.observe(element);
}
