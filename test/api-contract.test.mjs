// Unit tests for the API boundary validators.
//
// These are the guards that decide whether unknown network data is allowed to
// reach a page, so they are worth testing directly rather than only through a
// rendered page. Node strips the TypeScript types, so this imports the source
// module with no build step and no new dependency.
//
// src/lib/api-contract.ts is deliberately free of import.meta.env and fetch,
// which is what makes it importable here at all.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMITS,
  isValidSlug,
  isStatus,
  isErrorBody,
  isComment,
  isCommentPage,
  validateComment,
} from "../src/lib/api-contract.ts";

const comment = (over = {}) => ({
  id: 1,
  author_name: "Ada",
  body: "Hello",
  created_at: "2026-08-10T12:00:00Z",
  ...over,
});

test("slugs match the pattern the API documents", () => {
  for (const good of ["a", "building-a-homelab", "k3s-cluster", "i7-9700k", "cs2105"]) {
    assert.ok(isValidSlug(good), `${good} should be valid`);
  }
  for (const bad of [
    "",
    "-leading",
    "trailing-",
    "double--hyphen",
    "Upper",
    "has space",
    "sym$bol",
    "../escape",
    "a".repeat(LIMITS.slugMax + 1),
  ]) {
    assert.ok(!isValidSlug(bad), `${JSON.stringify(bad)} should be rejected`);
  }
});

test("isStatus accepts the documented shape only", () => {
  assert.ok(isStatus({ status: "ok" }));
  assert.ok(isStatus({ status: "unavailable" }));
  // Forward compatible: an added field must not invalidate a response.
  assert.ok(isStatus({ status: "ready", uptime: 12 }));

  for (const bad of [null, undefined, "ok", 1, [], {}, { status: 1 }, { status: null }]) {
    assert.ok(!isStatus(bad), `${JSON.stringify(bad)} should be rejected`);
  }
});

test("isErrorBody accepts the documented error envelope", () => {
  assert.ok(isErrorBody({ error: "nope" }));
  assert.ok(!isErrorBody({}));
  assert.ok(!isErrorBody({ error: 500 }));
  assert.ok(!isErrorBody(null));
});

test("isComment requires every field the contract marks required", () => {
  assert.ok(isComment(comment()));
  assert.ok(isComment(comment({ body: "" })), "an empty body is still a valid comment");
  assert.ok(isComment(comment({ moderated: true })), "unknown fields are ignored");

  for (const [label, value] of [
    ["missing id", { ...comment(), id: undefined }],
    ["zero id", comment({ id: 0 })],
    ["negative id", comment({ id: -1 })],
    ["fractional id", comment({ id: 1.5 })],
    ["id beyond safe integer range", comment({ id: 2 ** 53 })],
    ["string id", comment({ id: "1" })],
    ["missing author", { ...comment(), author_name: undefined }],
    ["numeric author", comment({ author_name: 7 })],
    ["missing body", { ...comment(), body: undefined }],
    ["empty timestamp", comment({ created_at: "" })],
    ["unparseable timestamp", comment({ created_at: "not-a-date" })],
    ["not an object", "comment"],
    ["array", [comment()]],
  ]) {
    assert.ok(!isComment(value), `${label} should be rejected`);
  }
});

test("isCommentPage validates the page and its cursor", () => {
  assert.ok(isCommentPage({ comments: [], next_before_id: null }));
  assert.ok(isCommentPage({ comments: [comment()], next_before_id: 5 }));

  for (const [label, value] of [
    ["missing comments", { next_before_id: null }],
    ["comments not an array", { comments: {}, next_before_id: null }],
    ["a bad comment in the array", { comments: [comment(), { id: 2 }], next_before_id: null }],
    ["missing cursor", { comments: [] }],
    ["cursor of zero", { comments: [], next_before_id: 0 }],
    ["fractional cursor", { comments: [], next_before_id: 2.5 }],
    ["string cursor", { comments: [], next_before_id: "5" }],
    [
      "more items than the documented maximum",
      { comments: Array.from({ length: LIMITS.pageSizeMax + 1 }, (_, i) => comment({ id: i + 1 })), next_before_id: null },
    ],
  ]) {
    assert.ok(!isCommentPage(value), `${label} should be rejected`);
  }
});

test("validateComment mirrors the server's limits", () => {
  assert.deepEqual(validateComment({ author_name: "Ada", body: "Hi" }), []);

  const fieldsFor = (input) => validateComment(input).map((e) => e.field);

  assert.deepEqual(fieldsFor({ author_name: "", body: "Hi" }), ["author_name"]);
  assert.deepEqual(fieldsFor({ author_name: "   ", body: "Hi" }), ["author_name"], "whitespace is not a name");
  assert.deepEqual(fieldsFor({ author_name: "Ada", body: "" }), ["body"]);
  assert.deepEqual(fieldsFor({ author_name: "", body: "" }), ["author_name", "body"]);

  assert.deepEqual(fieldsFor({ author_name: "a".repeat(LIMITS.authorNameMax), body: "Hi" }), []);
  assert.deepEqual(fieldsFor({ author_name: "a".repeat(LIMITS.authorNameMax + 1), body: "Hi" }), [
    "author_name",
  ]);
  assert.deepEqual(fieldsFor({ author_name: "Ada", body: "b".repeat(LIMITS.bodyMax) }), []);
  assert.deepEqual(fieldsFor({ author_name: "Ada", body: "b".repeat(LIMITS.bodyMax + 1) }), ["body"]);
});

test("validateComment catches a body that is short but too many bytes", () => {
  // The server limits the encoded request, so multi-byte characters can be
  // over 16 KiB while well under the 2000-character limit.
  const fourBytesEach = "😀".repeat(LIMITS.bodyMax);
  const errors = validateComment({ author_name: "Ada", body: fourBytesEach });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "body");
});
