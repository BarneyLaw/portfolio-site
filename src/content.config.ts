import { defineCollection, type SchemaContext } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

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

/** Set false to close comments on one entry. Every reading type supports them.
    The section also needs the backend configured at build time *and* the slug
    registered in the API's content registry — see src/lib/comments.ts. */
const comments = z.boolean().default(true);

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
      draft,
      comments,
      ...media(ctx),
    }),
});

export const collections = { blog, projects, reviews };
