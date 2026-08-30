// Unit tests for src/lib/tags.ts.
//
// Tag identity is the whole basis of review filtering: the authored spelling
// is what a reader sees, the slug is what a filter button, a `data-tags`
// attribute and a `?tag=` query string all match on. If those two ever
// disagree, a tag renders but selects nothing. Imported directly because Node
// strips its TypeScript, same as test/api-transport.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

import { tagSlug, tagSlugs } from "../src/lib/tags.ts";

test("slugs are lowercase and URL-safe", () => {
  assert.equal(tagSlug("game"), "game");
  assert.equal(tagSlug("IDE"), "ide");
  assert.equal(tagSlug("Mod Review"), "mod-review");
  assert.equal(tagSlug("free to play"), "free-to-play");
});

test("spellings that differ only in case or separator are the same tag", () => {
  const spellings = ["Mod Review", "mod review", "mod-review", "MOD_REVIEW", "  Mod   Review  "];
  const slugs = new Set(spellings.map(tagSlug));
  assert.equal(slugs.size, 1, `expected one identity, got ${[...slugs].join(", ")}`);
  assert.equal([...slugs][0], "mod-review");
});

test("slugs never carry leading, trailing or repeated hyphens", () => {
  for (const input of ["  spaced  ", "--dashed--", "a///b", "C++", "!!!weird!!!"]) {
    const slug = tagSlug(input);
    assert.doesNotMatch(slug, /^-|-$|--/, `${input} slugged to "${slug}"`);
  }
});

test("a tag with nothing to slug returns empty, which the schema rejects", () => {
  // Pages never see this: src/content.config.ts refuses such a tag at build
  // time. The contract is asserted here so that guarantee stays deliberate.
  for (const input of ["", "   ", "///", "-", "!!!"]) {
    assert.equal(tagSlug(input), "", `${JSON.stringify(input)} should slug to ""`);
  }
});

test("tagSlugs preserves authored order", () => {
  assert.deepEqual(tagSlugs(["Game", "Free To Play", "IDE"]), ["game", "free-to-play", "ide"]);
  assert.deepEqual(tagSlugs([]), []);
});
