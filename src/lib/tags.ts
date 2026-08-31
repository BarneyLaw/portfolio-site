// ── Tag identity ─────────────────────────────────────────────────────────
// Tags are authored free-form ("Mod Review", "IDE", "game"), but filtering
// needs a *stable identity* to match on. Everything that compares, groups,
// counts or routes by tag goes through tagSlug() so display spelling and
// matching identity can never drift apart.
//
// Deliberately free of `astro:content`, `import.meta.env` and any DOM API:
// this module is imported by src/content.config.ts (which runs before the
// content layer exists), by pages, by the page-local filter script, and
// directly by test/tags.test.mjs under Node.

/**
 * Canonical, URL-safe form of a tag. Lowercased, with every run of characters
 * that is not a letter or digit collapsed to a single hyphen.
 *
 *   "Mod Review"  → "mod-review"
 *   "IDE"         → "ide"
 *   "C++"         → "c"
 *
 * Returns "" for input with nothing to slug (" ", "///"). Callers must treat
 * that as "not a tag" — the schema rejects it at build time so no page ever
 * has to.
 */
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slugs of an entry's tags, in authored order. The value that goes into
    a card's `data-tags` attribute, which the filter script splits on space. */
export function tagSlugs(tags: readonly string[]): string[] {
  return tags.map(tagSlug);
}
