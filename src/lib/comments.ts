// Comment and view endpoints, per openapi.yaml.
//
// Thin: every endpoint is one apiRequest call with the right validator. The
// transport rules (timeout, cancellation, error shape) live in src/lib/api.ts
// and the shapes in src/lib/api-contract.ts; this file only knows the paths.

import { apiRequest, ApiError } from "./api";
import {
  isComment,
  isCommentPage,
  isValidSlug,
  LIMITS,
  type CommentPage,
  type Comment,
  type CreateComment,
} from "./api-contract";

/** Path segment for a post's comment collection. The slug is pattern-checked
    before it is interpolated, and encoded regardless. */
function commentsPath(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new ApiError("http", 400, `Refusing to request an invalid slug: ${slug}`);
  }
  return `/posts/${encodeURIComponent(slug)}/comments`;
}

export interface ListCommentsOptions {
  /** Cursor from a previous page's `next_before_id`. Omit for the newest page. */
  beforeId?: number;
  /** Defaults to the server's own default rather than guessing. */
  limit?: number;
  signal?: AbortSignal;
}

/** GET /posts/{slug}/comments — newest first, bounded page. */
export function listComments(
  slug: string,
  options: ListCommentsOptions = {},
): Promise<CommentPage> {
  const { beforeId, limit, signal } = options;
  return apiRequest<CommentPage>(commentsPath(slug), {
    query: {
      before_id: beforeId,
      // Clamped rather than passed through: an out-of-range value is a
      // guaranteed 400, and the caller cannot do anything useful with that.
      limit:
        limit === undefined
          ? undefined
          : Math.min(Math.max(limit, LIMITS.pageSizeMin), LIMITS.pageSizeMax),
    },
    validate: isCommentPage,
    signal,
  });
}

/**
 * POST /posts/{slug}/comments
 *
 * Resolves to the created Comment, or to `null` when the server answered 204 —
 * which is what it does for a honeypot submission. The caller must show the
 * same success either way; telling a spammer their comment was discarded is
 * how a honeypot stops being useful.
 */
export async function createComment(
  slug: string,
  input: CreateComment,
  signal?: AbortSignal,
): Promise<Comment | null> {
  const created = await apiRequest<Comment | undefined>(commentsPath(slug), {
    method: "POST",
    body: input,
    signal,
    // 201 returns a Comment; 204 returns nothing. apiRequest short-circuits on
    // a 204 before consulting the validator, so both paths are covered.
    validate: isComment,
  });
  return created ?? null;
}

// View recording lives in src/lib/views.ts, not here: it runs eagerly on every
// post page, and sharing a module would drag this comment code into its chunk.
