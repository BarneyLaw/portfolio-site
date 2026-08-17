// The short-lived stats memo.
//
// This is the one piece of the site that can show a *stale* number, so its
// edges are worth pinning down: when it expires, and what it refuses to trust.
// sessionStorage is user-writable, so a cached entry is untrusted input on the
// way back in, exactly like an API response.
//
// The cache functions take a Storage explicitly, which is what makes them
// testable under plain `node --test` — there is no sessionStorage in Node.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STATS_CACHE_TTL_MS,
  readCachedStats,
  writeCachedStats,
} from "../src/lib/stats.ts";

/** Minimal in-memory Storage. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    _dump: () => Object.fromEntries(map),
  };
}

const STATS = { views: 4212, likes: 7 };
const T0 = 1_700_000_000_000;

test("a fresh entry round-trips", () => {
  const store = memoryStorage();
  writeCachedStats("a-post", STATS, T0, store);
  assert.deepEqual(readCachedStats("a-post", T0, store), STATS);
});

test("entries are keyed per slug", () => {
  const store = memoryStorage();
  writeCachedStats("post-one", STATS, T0, store);
  assert.equal(readCachedStats("post-two", T0, store), null);
  assert.deepEqual(readCachedStats("post-one", T0, store), STATS);
});

test("an entry expires exactly at the TTL", () => {
  const store = memoryStorage();
  writeCachedStats("a-post", STATS, T0, store);

  assert.deepEqual(
    readCachedStats("a-post", T0 + STATS_CACHE_TTL_MS, store),
    STATS,
    "still usable at the boundary",
  );
  assert.equal(
    readCachedStats("a-post", T0 + STATS_CACHE_TTL_MS + 1, store),
    null,
    "one millisecond past the TTL it is gone",
  );
});

test("a snapshot from the future is refused", () => {
  // A changed system clock, or a hand-edited entry. Either way it must not be
  // trusted until `now` catches up with it.
  const store = memoryStorage();
  writeCachedStats("a-post", STATS, T0 + 5000, store);
  assert.equal(readCachedStats("a-post", T0, store), null);
});

test("a tampered or malformed entry never reaches the page", () => {
  for (const [label, raw] of [
    ["not JSON", "{{{"],
    ["not an object", '"nope"'],
    ["null", "null"],
    ["missing timestamp", JSON.stringify({ views: 1, likes: 1 })],
    ["non-numeric timestamp", JSON.stringify({ views: 1, likes: 1, at: "now" })],
    ["missing likes", JSON.stringify({ views: 1, at: T0 })],
    ["negative views", JSON.stringify({ views: -1, likes: 0, at: T0 })],
    ["fractional likes", JSON.stringify({ views: 1, likes: 1.5, at: T0 })],
    ["string counter", JSON.stringify({ views: "1", likes: 0, at: T0 })],
    ["counter beyond safe range", JSON.stringify({ views: 2 ** 53, likes: 0, at: T0 })],
  ]) {
    const store = memoryStorage({ "stats:a-post": raw });
    assert.equal(readCachedStats("a-post", T0, store), null, `accepted ${label}`);
  }
});

test("the memo degrades to nothing when storage is unavailable", () => {
  // Private modes throw on access; the page must still work, just uncached.
  assert.equal(readCachedStats("a-post", T0, null), null);
  assert.doesNotThrow(() => writeCachedStats("a-post", STATS, T0, null));
});

test("a write that throws does not take the page with it", () => {
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  assert.doesNotThrow(() => writeCachedStats("a-post", STATS, T0, full));
});

test("the TTL is short enough that a live counter is never badly wrong", () => {
  assert.ok(
    STATS_CACHE_TTL_MS > 0 && STATS_CACHE_TTL_MS <= 5 * 60_000,
    `${STATS_CACHE_TTL_MS}ms is too long for a live counter`,
  );
});
