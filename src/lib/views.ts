// View recording, per openapi.yaml.
//
// Separate from src/lib/comments.ts on purpose. The view beacon runs eagerly
// on every post page, while the comment client is loaded only when a reader
// scrolls to the section. Sharing a module would put the comment code in the
// beacon's chunk and every reader would download it, which is exactly what
// the lazy mount exists to avoid.

import { apiRequest, ApiError } from "./api";
import { isValidSlug } from "./api-contract";

/**
 * POST /posts/{slug}/view
 *
 * Records at most one view per visitor per rolling window; the server owns the
 * deduplication, so a refresh does not inflate the count. Answers 204 either
 * way, including when the view was already counted.
 */
export function recordView(slug: string, signal?: AbortSignal): Promise<void> {
  if (!isValidSlug(slug)) {
    return Promise.reject(new ApiError("http", 400, `Invalid slug: ${slug}`));
  }
  return apiRequest<void>(`/posts/${encodeURIComponent(slug)}/view`, {
    method: "POST",
    expectNoContent: true,
    signal,
  });
}
