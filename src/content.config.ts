import { defineCollection, type SchemaContext } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

import { tagSlug } from "./lib/tags";

// Every collection is prose → one MDX file per entry, frontmatter for the
// structured fields and the body for the writeup. See src/lib/content.ts for
// the seam where these can later be swapped for a Go/Postgres-backed query.

/** ISO calendar date. Validated so lexicographic sort == chronological sort,
    which is what every "newest first" ordering in src/lib/content.ts relies on,
    and what lets a future-dated entry be detected with a string compare. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be an ISO calendar date, e.g. 2026-07-26");

/** Withheld from the public build entirely: no list entry, no detail route.
    See the publication rules in src/lib/content.ts. */
const draft = z.boolean().default(false);

/**
 * Whether this entry accepts comments. **Defaults to false**, deliberately.
 *
 * This value is not just a UI switch: it is published to the backend as
 * `comments_enabled` in the content registry (see src/lib/registry.ts), and the
 * API refuses comment listing and creation unless it is true. Defaulting to
 * false means a new entry cannot silently open a public write surface — opening
 * one is always an explicit `comments: true` in frontmatter.
 *
 * The backend contract spells this out: "Only content whose frontmatter or JSON
 * explicitly sets `comments: true` should emit `comments_enabled: true`."
 */
const comments = z.boolean().default(false);

/**
 * Free-form categories for a review: "mod-review", "game", "ide", anything.
 * There is no allowlist — a new tag is created by typing it in frontmatter.
 *
 * The values are authored for display, but they are matched on by
 * `tagSlug()` (src/lib/tags.ts), so "Mod Review", "mod review" and
 * "mod-review" are all the *same* tag and land in one filter bucket. That
 * normalisation is what makes these safe to filter and to put in a URL later
 * without an allowlist to maintain.
 *
 * Two rules are enforced here rather than left to a page:
 *   - a tag must slug to something non-empty, so " " and "///" are rejected
 *     instead of silently becoming an unmatchable blank pill;
 *   - tags must be distinct *after* normalisation, so an entry cannot carry
 *     "IDE" and "ide" and render the same filter twice.
 *
 * Defaults to `[]`: tagging is optional and an untagged review is not a
 * schema error. Reviews only — `projects.tags` is a different, required field
 * describing a stack, and is deliberately left alone.
 */
const tags = z
  .array(
    z
      .string()
      .trim()
      .refine((tag) => tagSlug(tag).length > 0, "a tag needs at least one letter or digit"),
  )
  .default([])
  .refine(
    (list) => new Set(list.map(tagSlug)).size === list.length,
    'tags must be distinct once normalised — "Mod Review" and "mod-review" are the same tag',
  );

/**
 * Media fields, shared by all three collections. The two image slots had
 * overlapping names and a single shared alt string; these are their roles:
 *
 *   image        A *meaningful* preview — a screenshot, a product photo. Shown
 *                in list and grid cards. Describe it in `imageAlt`.
 *   coverArt     *Decorative* artwork for the wide feature cards on the home
 *                page. The card's own headline already carries the meaning, so
 *                this renders with alt="" unless `coverArtAlt` overrides it.
 *   *Alt         Alternative text for the slot of the same name.
 *
 * Social cards prefer coverArt, then image, then the site default — see
 * socialImageOf() in src/lib/content.ts.
 *
 * Both are processed by Astro's asset pipeline, so intrinsic width/height are
 * known at build time and every <Image> reserves its box before it loads.
 */
const media = ({ image }: SchemaContext) => ({
  image: image().optional(),
  imageAlt: z.string().optional(),
  coverArt: image().optional(),
  coverArtAlt: z.string().optional(),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: (ctx) =>
    z.object({
      title: z.string(),
      date: isoDate,
      readTime: z.string(),
      category: z.string(),
      excerpt: z.string(),
      featured: z.boolean().default(false),
      draft,
      comments,
      ...media(ctx),
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: (ctx) =>
    z.object({
      name: z.string(),
      status: z.enum(["SHIPPED", "BUILDING", "PLANNED"]),
      tags: z.array(z.string()),
      meta: z.string(),
      description: z.string(),
      codeSnippet: z.string(),
      order: z.number().default(0),
      draft,
      /** Off-site destinations for the detail-page sidebar (repo, release
          notes, demo…). `.url()` rejects a typo'd or relative href at build
          time. Omit entirely when a project has nowhere to point yet — the
          sidebar block disappears rather than showing a dead link. */
      links: z
        .array(
          z.object({
            label: z.string(),
            href: z
              .string()
              .regex(/^https?:\/\//, "project links must be absolute http(s) URLs"),
          }),
        )
        .default([]),
      comments,
      ...media(ctx),
    }),
});

const reviews = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/reviews" }),
  schema: (ctx) =>
    z.object({
      type: z.enum(["HARDWARE", "SOFTWARE"]),
      verdict: z.enum(["RECOMMENDED", "MIXED", "PASS"]),
      name: z.string(),
      date: isoDate,
      excerpt: z.string(),
      tags,
      draft,
      comments,
      ...media(ctx),
    }),
});

export const collections = { blog, projects, reviews };
