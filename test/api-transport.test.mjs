// Transport tests for src/lib/api.ts, against a real HTTP server.
//
// These cover the guarantees FEAT-201 actually claims — a bounded timeout,
// one consistent error type, and a validated body — which are otherwise only
// ever exercised by hand against a running backend.
//
// No browser and no mocking library: `fetch`, `AbortController` and
// `AbortSignal` are all built into Node, and the module is imported directly
// because Node strips its TypeScript. requestFrom() takes the base explicitly
// so no Vite-injected configuration is involved.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { requestFrom, buildUrl, ApiError, REQUEST_TIMEOUT_MS } from "../src/lib/api.ts";

/** Records what the server saw, so request-shaping can be asserted. */
let lastRequest = null;
let server;
let base;

const isStatus = (v) => typeof v === "object" && v !== null && typeof v.status === "string";

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let body = "";
    for await (const chunk of req) body += chunk;
    lastRequest = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body,
    };

    const send = (status, payload, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(payload);
    };

    switch (url.pathname) {
      case "/ok":
        return send(200, JSON.stringify({ status: "ok" }));
      case "/no-content":
        res.writeHead(204);
        return res.end();
      case "/wrong-shape":
        return send(200, JSON.stringify({ nope: true }));
      case "/not-json":
        return send(200, "<html>definitely not json</html>", "text/html");
      case "/error-with-body":
        return send(422, JSON.stringify({ error: "author_name is required" }));
      case "/error-without-body":
        return send(500, "<html>gateway exploded</html>", "text/html");
      case "/hang":
        return; // never responds
      default:
        return send(404, JSON.stringify({ error: "no such route" }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

test("builds URLs from a base, path and query", () => {
  assert.equal(buildUrl("/api", "/posts/x/comments"), "/api/posts/x/comments");
  // A trailing slash on the base must not double up.
  assert.equal(buildUrl("/api/", "/healthz"), "/api/healthz");
  assert.equal(buildUrl("https://h.example/api", "/healthz"), "https://h.example/api/healthz");
  assert.equal(
    buildUrl("/api", "/c", { limit: 25, before_id: 7 }),
    "/api/c?limit=25&before_id=7",
  );
  // undefined and null are dropped rather than sent as "undefined".
  assert.equal(buildUrl("/api", "/c", { limit: undefined, before_id: null }), "/api/c");
  assert.equal(buildUrl("/api", "/c", {}), "/api/c");
});

test("returns a validated body on success", async () => {
  const result = await requestFrom(base, "/ok", { validate: isStatus });
  assert.deepEqual(result, { status: "ok" });
});

test("refuses to run without a configured base", async () => {
  await assert.rejects(
    () => requestFrom("", "/ok", { validate: isStatus }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, "network");
      assert.equal(error.status, 0);
      return true;
    },
  );
});

test("sends JSON bodies and no credentials", async () => {
  await requestFrom(base, "/ok", {
    method: "POST",
    body: { author_name: "Ada", body: "hi" },
    validate: isStatus,
  });
  assert.equal(lastRequest.method, "POST");
  assert.equal(lastRequest.headers["content-type"], "application/json");
  assert.equal(lastRequest.headers.accept, "application/json");
  assert.deepEqual(JSON.parse(lastRequest.body), { author_name: "Ada", body: "hi" });
  // credentials: "omit" — every endpoint is public and must stay that way.
  assert.equal(lastRequest.headers.cookie, undefined);
});

test("a GET sends no body and no content-type", async () => {
  await requestFrom(base, "/ok", { validate: isStatus });
  assert.equal(lastRequest.method, "GET");
  assert.equal(lastRequest.body, "");
  assert.equal(lastRequest.headers["content-type"], undefined);
});

test("accepts 204 as success when no content is expected", async () => {
  const result = await requestFrom(base, "/no-content", { expectNoContent: true });
  assert.equal(result, undefined);
});

test("a 2xx that violates the contract is a failure, not data", async () => {
  // The single most important guarantee here: a validator that says no means
  // the caller gets an error, never the unvalidated object.
  await assert.rejects(
    () => requestFrom(base, "/wrong-shape", { validate: isStatus }),
    (error) => {
      assert.equal(error.kind, "malformed");
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("a 2xx that is not JSON is a failure", async () => {
  await assert.rejects(
    () => requestFrom(base, "/not-json", { validate: isStatus }),
    (error) => {
      assert.equal(error.kind, "malformed");
      return true;
    },
  );
});

test("a 2xx with no validator is refused rather than trusted", async () => {
  await assert.rejects(
    () => requestFrom(base, "/ok"),
    (error) => {
      assert.equal(error.kind, "malformed");
      return true;
    },
  );
});

test("surfaces the server's error message when it sends one", async () => {
  await assert.rejects(
    () => requestFrom(base, "/error-with-body", { validate: isStatus }),
    (error) => {
      assert.equal(error.kind, "http");
      assert.equal(error.status, 422);
      assert.equal(error.detail, "author_name is required");
      assert.equal(error.retryable, false, "a 4xx is not worth retrying");
      return true;
    },
  );
});

test("survives an error response that is not JSON", async () => {
  // A crashing proxy returns HTML. That must still be an ApiError with the
  // status intact, not a parse failure.
  await assert.rejects(
    () => requestFrom(base, "/error-without-body", { validate: isStatus }),
    (error) => {
      assert.equal(error.kind, "http");
      assert.equal(error.status, 500);
      assert.equal(error.detail, undefined);
      assert.equal(error.retryable, true, "a 5xx is worth retrying");
      return true;
    },
  );
});

test("an unreachable server is a network failure, not a TypeError", async () => {
  // Port 1 is reserved and nothing listens on it.
  await assert.rejects(
    () => requestFrom("http://127.0.0.1:1", "/ok", { validate: isStatus, timeoutMs: 2000 }),
    (error) => {
      assert.ok(error instanceof ApiError, "must not leak fetch's TypeError");
      assert.equal(error.kind, "network");
      assert.equal(error.status, 0);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("a hung server is abandoned at the timeout", async () => {
  const started = Date.now();
  await assert.rejects(
    () => requestFrom(base, "/hang", { validate: isStatus, timeoutMs: 300 }),
    (error) => {
      assert.equal(error.kind, "timeout");
      assert.equal(error.retryable, true);
      return true;
    },
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `gave up after ${elapsed}ms; the timeout did not fire`);
});

test("the caller can cancel in flight", async () => {
  const controller = new AbortController();
  const pending = requestFrom(base, "/hang", {
    validate: isStatus,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 50);

  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, "timeout", "a cancelled request reports as timeout");
    return true;
  });
});

test("the default timeout is bounded and documented", () => {
  assert.ok(Number.isInteger(REQUEST_TIMEOUT_MS));
  assert.ok(
    REQUEST_TIMEOUT_MS > 0 && REQUEST_TIMEOUT_MS <= 15000,
    `${REQUEST_TIMEOUT_MS}ms is not a bounded default`,
  );
});
