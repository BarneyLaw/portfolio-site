// ── Go backend transport ─────────────────────────────────────────────────
// Every request to the Go API goes through this module. Endpoint modules
// (src/lib/comments.ts) describe *what* to call; this decides how — base URL,
// timeout, cancellation, error shape, and validating the body before any
// caller sees it. Nothing else in the codebase may call fetch() at the API.
//
// The site is static and stays useful with the backend down: these calls only
// ever power optional fragments, never page content. See FEAT-204.

// Explicit .ts extension, unlike the rest of the codebase: this module is
// imported directly by test/api-transport.test.mjs, and Node's ESM resolver
// (unlike Vite's) will not guess it. Astro's tsconfig sets
// allowImportingTsExtensions, so both toolchains accept this. Do not "tidy"
// the extension away — it breaks the transport tests.
import { isErrorBody } from "./api-contract.ts";

/**
 * Public base for the API. `/api` in the container (same origin, so the
 * deployment routes it to the Go service); empty when unconfigured, which
 * disables every dynamic fragment at build time.
 *
 * PUBLIC_* is compiled into public output — it must never hold a secret. This
 * is the only public base configuration; nothing else may introduce another.
 */
export const API_BASE: string = readConfiguredBase();

function readConfiguredBase(): string {
  try {
    // Vite replaces this with a string literal at build time.
    return import.meta.env.PUBLIC_API_BASE_URL ?? "";
  } catch {
    // `import.meta.env` exists only inside the Vite build. Under the Node test
    // runner it does not, and reading through it would throw at import time —
    // which would make this module untestable. There is no configured base
    // outside the build; tests pass one explicitly to requestFrom().
    return "";
  }
}

/** Whether a Go backend is configured. Pages fall back to static content when
    false, and dynamic fragments are not rendered at all. */
export function apiConfigured(): boolean {
  return API_BASE.length > 0;
}

/**
 * How long any single request may take before it is abandoned. Bounded so a
 * hung backend cannot leave a spinner on the page forever — the fragment shows
 * its unavailable state instead, and the article is unaffected.
 */
export const REQUEST_TIMEOUT_MS = 8000;

/** Why a request failed. Callers branch on this rather than on message text. */
export type ApiFailure =
  /** Could not reach the server at all: DNS, offline, CORS, connection reset. */
  | "network"
  /** Exceeded REQUEST_TIMEOUT_MS, or the caller cancelled. */
  | "timeout"
  /** Reached the server, which answered with a non-2xx status. */
  | "http"
  /** 2xx, but the body was not what the contract says it should be. */
  | "malformed";

export class ApiError extends Error {
  readonly kind: ApiFailure;
  /** HTTP status, or 0 when the response never arrived. */
  readonly status: number;
  /** The server's `error` string, when it sent one. Safe to show to a reader
      only after escaping — treat as untrusted text, never as HTML. */
  readonly detail?: string;

  constructor(kind: ApiFailure, status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }

  /** True when retrying the identical request could plausibly succeed. */
  get retryable(): boolean {
    return this.kind === "network" || this.kind === "timeout" || this.status >= 500;
  }
}

export interface RequestOptions<T> {
  /** PUT and DELETE are used for the like endpoints, which are idempotent
      state assertions rather than "add one" actions. */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Serialised as JSON. Omit for bodyless requests. */
  body?: unknown;
  /** Appended as a query string; undefined and null entries are dropped. */
  query?: Record<string, string | number | undefined | null>;
  /** Caller cancellation — e.g. the reader navigated away mid-request. */
  signal?: AbortSignal;
  /** Overrides REQUEST_TIMEOUT_MS for one call. */
  timeoutMs?: number;
  /**
   * Validates the parsed body. Required for anything with a response body:
   * it is what stops unvalidated network data reaching a page. Omit only for
   * 204-style endpoints, where `expectNoContent` applies instead.
   */
  validate?: (value: unknown) => value is T;
  /** Accept an empty body as success and resolve to undefined. */
  expectNoContent?: boolean;
  /**
   * Whether to send cookies. Defaults to "omit", which is right for every
   * public endpoint: they are all unauthenticated, and sending credentials to
   * them would be a way to leak one.
   *
   * The admin surface sets "same-origin" so the browser attaches the
   * `CF_Authorization` cookie Cloudflare Access issued for the admin
   * hostname. It is deliberately *not* "include": the admin page and the
   * admin API must be the same origin (see src/lib/admin.ts), so
   * "same-origin" sends the cookie where it is meant to go and nowhere else.
   */
  credentials?: RequestCredentials;
}

export function buildUrl(
  base: string,
  path: string,
  query?: RequestOptions<unknown>["query"],
): string {
  // The base may or may not end in "/", and path always starts with one.
  const url = `${base.replace(/\/+$/, "")}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Combines the caller's signal with our timeout, preferring the platform
    implementation and falling back for older browsers. */
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; done: () => void } {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const done = () => clearTimeout(timer);

  if (!signal) return { signal: timeoutController.signal, done };

  const anyOf = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyOf === "function") {
    return { signal: anyOf([signal, timeoutController.signal]), done };
  }

  // Fallback: forward the caller's abort into ours.
  if (signal.aborted) timeoutController.abort();
  else signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  return { signal: timeoutController.signal, done };
}

/**
 * Performs one API request and returns a validated body.
 *
 * Always rejects with an ApiError — never a bare TypeError, never an
 * unvalidated object — so every call site has one thing to catch.
 *
 * Prefer `apiRequest`, which supplies the configured base. This variant takes
 * the base explicitly so the transport rules can be exercised against a local
 * server in `test/api-transport.test.mjs`; `import.meta.env` does not exist
 * outside the Vite build, so a module-level base cannot be tested directly.
 */
export async function requestFrom<T>(
  base: string,
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  if (base.length === 0) {
    throw new ApiError("network", 0, "No API base is configured");
  }

  const { method = "GET", body, query, signal, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const { signal: combined, done } = withTimeout(signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(base, path, query), {
      method,
      signal: combined,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Public endpoints send nothing; only the admin surface opts in. The
      // frontend never constructs, stores or forwards an Access assertion —
      // Cloudflare injects it at the edge and the Go middleware validates it.
      credentials: options.credentials ?? "omit",
      // The reader wants the current comments, not a cached page of them.
      cache: "no-store",
    });
  } catch (cause) {
    const aborted = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiError(
      aborted ? "timeout" : "network",
      0,
      aborted ? `Request timed out after ${timeoutMs}ms` : "Could not reach the server",
    );
  } finally {
    done();
  }

  if (!response.ok) {
    // Error bodies are best-effort: a proxy or a crash can return HTML.
    let detail: string | undefined;
    try {
      const parsed: unknown = await response.json();
      if (isErrorBody(parsed)) detail = parsed.error;
    } catch {
      // Leave detail undefined; the status carries the meaning.
    }
    throw new ApiError("http", response.status, `Request failed (${response.status})`, detail);
  }

  if (options.expectNoContent || response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ApiError("malformed", response.status, "Response was not valid JSON");
  }

  if (!options.validate) {
    throw new ApiError("malformed", response.status, "No validator supplied for this response");
  }
  if (!options.validate(parsed)) {
    throw new ApiError("malformed", response.status, "Response did not match the API contract");
  }
  return parsed;
}

/**
 * The call every endpoint module uses: `requestFrom` against the configured
 * base. Nothing outside this module may call `fetch` at the API — a test in
 * test/comments.test.mjs enforces that.
 */
export function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  return requestFrom<T>(API_BASE, path, options);
}
