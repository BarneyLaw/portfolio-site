// ── Backend API contract ─────────────────────────────────────────────────
// The typed shape of the Go API, transcribed from openapi.yaml, plus the
// runtime validators that guard the boundary.
//
// Deliberately free of `import.meta.env`, `fetch` and any DOM API, for two
// reasons: it stays unit-testable under plain `node --test` (Node strips the
// types), and it can be imported from build-time Astro code without dragging
// transport concerns along. src/lib/api.ts owns the transport.
//
// ── Why hand-written validators ──────────────────────────────────────────
// Everything here runs in the browser. zod is available (astro/zod) but
// shipping a schema library to every reader of a blog post costs far more
// than ~80 lines of type guards, and the dependency policy puts "a small
// local TypeScript function" above "an existing project dependency".
//
// ── Validation stance ────────────────────────────────────────────────────
// The spec marks every schema `additionalProperties: false`, but these guards
// check only that required fields are present and correctly typed, and ignore
// unknown ones. A server that adds a field in a later version should not break
// a cached copy of this page; a server that omits or retypes one must.

/** Limits taken from openapi.yaml. Exported so the form and the validators
    enforce exactly the same numbers the server does. */
export const LIMITS = {
  /** CreateComment.author_name maxLength. */
  authorNameMax: 80,
  /** CreateComment.body maxLength. */
  bodyMax: 2000,
  /** PostSlug maxLength. */
  slugMax: 100,
  /** listPostComments limit: minimum, maximum, and the server's default. */
  pageSizeMin: 1,
  pageSizeMax: 100,
  pageSizeDefault: 25,
  /** Request bodies above this get a 413. Checked client-side so an
      over-long comment fails in the form rather than at the server. */
  requestBytesMax: 16 * 1024,
} as const;

/** PostSlug pattern from openapi.yaml. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Whether a slug is one the API will accept. Checked before building a URL:
 * it turns a guaranteed 400 into a local no-op, and it is the boundary that
 * keeps arbitrary text out of a request path.
 */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= LIMITS.slugMax && SLUG_PATTERN.test(slug);
}

// ── Schemas ──────────────────────────────────────────────────────────────

/** components.schemas.Status */
export interface Status {
  status: string;
}

/** components.schemas.Comment */
export interface Comment {
  id: number;
  author_name: string;
  body: string;
  /** RFC 3339 timestamp. */
  created_at: string;
}

/** components.schemas.CommentPage */
export interface CommentPage {
  comments: Comment[];
  /** Cursor for the next older page, or null when this is the last one. */
  next_before_id: number | null;
}

/** components.schemas.CreateComment */
export interface CreateComment {
  author_name: string;
  body: string;
  /** Honeypot. Real clients send this empty; the server answers 204 and
      stores nothing when it is filled. */
  website?: string;
}

// ── Validators ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isStatus(value: unknown): value is Status {
  return isRecord(value) && typeof value.status === "string";
}

/** components.schemas.Error — the body every non-2xx response carries. */
export function isErrorBody(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

export function isComment(value: unknown): value is Comment {
  if (!isRecord(value)) return false;
  return (
    // int64 in the spec; anything past 2^53 would already have lost precision
    // in JSON.parse, so reject it rather than render a wrong id.
    Number.isSafeInteger(value.id) &&
    (value.id as number) >= 1 &&
    typeof value.author_name === "string" &&
    typeof value.body === "string" &&
    isNonEmptyString(value.created_at) &&
    !Number.isNaN(Date.parse(value.created_at as string))
  );
}

export function isCommentPage(value: unknown): value is CommentPage {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.comments)) return false;
  if (value.comments.length > LIMITS.pageSizeMax) return false;
  if (!value.comments.every(isComment)) return false;

  const cursor = value.next_before_id;
  return cursor === null || (Number.isSafeInteger(cursor) && (cursor as number) >= 1);
}

// ── Client-side request validation ───────────────────────────────────────

export type CommentFieldError = { field: "author_name" | "body"; message: string };

/**
 * Validates a comment before it is sent, against the same limits the server
 * enforces. This is a courtesy to the reader — it puts the message next to the
 * field instead of returning a 400 — never a security control. The server
 * remains authoritative.
 */
export function validateComment(input: CreateComment): CommentFieldError[] {
  const errors: CommentFieldError[] = [];

  const name = input.author_name.trim();
  if (name.length === 0) {
    errors.push({ field: "author_name", message: "Enter a name." });
  } else if (name.length > LIMITS.authorNameMax) {
    errors.push({
      field: "author_name",
      message: `Keep the name to ${LIMITS.authorNameMax} characters or fewer.`,
    });
  }

  const body = input.body.trim();
  if (body.length === 0) {
    errors.push({ field: "body", message: "Enter a comment." });
  } else if (body.length > LIMITS.bodyMax) {
    errors.push({
      field: "body",
      message: `Keep the comment to ${LIMITS.bodyMax} characters or fewer.`,
    });
  }

  // The server measures the encoded body, so multi-byte characters can push a
  // visually short comment over the 16 KiB limit.
  if (errors.length === 0) {
    const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
    if (bytes > LIMITS.requestBytesMax) {
      errors.push({ field: "body", message: "That comment is too large to send." });
    }
  }

  return errors;
}
