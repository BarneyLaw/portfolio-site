// ── Administrator surface: comment moderation ────────────────────────────
//
// ## How authentication works, and what this file is not
//
// There is no login here. There is no login *anywhere* — the backend has no
// login endpoint, no password, no session, no refresh token and issues no
// admin JWT of its own. Authentication happens entirely at the edge:
//
//   1. The whole `site-admin.packetcraft.dev` hostname is a deny-by-default
//      Cloudflare Access application.
//   2. A browser that has not authenticated never reaches the origin at all;
//      Cloudflare serves its own identity flow first.
//   3. Once authenticated, Cloudflare sets a `CF_Authorization` cookie for
//      that hostname and injects a signed `Cf-Access-Jwt-Assertion` header
//      into every request it forwards to the origin.
//   4. The Go middleware verifies that assertion — RS256 signature against
//      Cloudflare's JWKS, exact issuer, audience, expiry, and the configured
//      administrator email — before any moderation handler runs.
//
// So the frontend's entire job is to make a same-origin request and let the
// browser attach the cookie it already has. It never sees, stores, parses or
// forwards a token. There is nothing here to steal.
//
// ## Why same-origin is not optional
//
// The backend sets no CORS headers of any kind. A moderation page served from
// `packetcraft.dev` calling `site-admin.packetcraft.dev` would have every
// response blocked by the browser before it could be read, and the Access
// cookie would not be sent cross-site anyway. The admin page must therefore be
// served *from the admin hostname itself*, behind the same Access application
// as the API. See DEVELOPMENT.md for the deployment contract that requires.
//
// ## This module is not a security boundary
//
// Hiding a button is not authorization. Everything here is reachable by anyone
// who can reach the page; it is the Access application and the Go middleware
// that decide whether a request does anything. This file exists to present the
// result, not to guard it.

import { apiRequest, ApiError } from "./api";
import {
  isModerationComment,
  isModerationCommentPage,
  LIMITS,
  type CommentStatus,
  type ModerationComment,
  type ModerationCommentPage,
} from "./api-contract";

/** Admin requests must carry the Access cookie; public ones must not. */
const ADMIN_REQUEST = { credentials: "same-origin" as const };

export interface ListModerationOptions {
  /** Omit for both visible and hidden. */
  status?: CommentStatus;
  /** Cursor from a previous page's `next_before_id`. */
  beforeId?: number;
  limit?: number;
  signal?: AbortSignal;
}

/** GET /admin/comments — newest first, includes hidden comments. */
export function listModerationComments(
  options: ListModerationOptions = {},
): Promise<ModerationCommentPage> {
  const { status, beforeId, limit, signal } = options;
  return apiRequest<ModerationCommentPage>("/admin/comments", {
    ...ADMIN_REQUEST,
    query: {
      status,
      before_id: beforeId,
      limit:
        limit === undefined
          ? undefined
          : Math.min(Math.max(limit, LIMITS.pageSizeMin), LIMITS.pageSizeMax),
    },
    validate: isModerationCommentPage,
    signal,
  });
}

/**
 * POST /admin/comments/{id}/hide and /unhide.
 *
 * Desired-state operations, like the public like endpoints: repeating one is
 * harmless and produces no duplicate audit event. Both return the updated
 * comment, so the caller renders what the server actually recorded rather
 * than assuming its optimistic guess was right.
 *
 * Unhiding can fail with 409 when restoring the comment would exceed the
 * post's visible-comment cap — a real outcome the UI must show, not swallow.
 */
export function setCommentHidden(
  id: number,
  hidden: boolean,
  signal?: AbortSignal,
): Promise<ModerationComment> {
  if (!Number.isSafeInteger(id) || id < 1) {
    return Promise.reject(new ApiError("http", 400, `Invalid comment id: ${id}`));
  }
  return apiRequest<ModerationComment>(
    `/admin/comments/${encodeURIComponent(String(id))}/${hidden ? "hide" : "unhide"}`,
    {
      ...ADMIN_REQUEST,
      method: "POST",
      validate: isModerationComment,
      signal,
    },
  );
}
