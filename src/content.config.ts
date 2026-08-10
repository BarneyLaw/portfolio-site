import { defineCollection } from "astro:content";
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

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: isoDate,
      readTime: z.string(),
      category: z.string(),
      excerpt: z.string(),
      featured: z.boolean().default(false),
      draft,
      image: image().optional(),
      coverArt: image().optional(),
      imageAlt: z.string().optional(),
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      status: z.enum(["SHIPPED", "BUILDING", "PLANNED"]),
      tags: z.array(z.string()),
      meta: z.string(),
      description: z.string(),
      codeSnippet: z.string(),
      order: z.number().default(0),
      draft,
      image: image().optional(),
      coverArt: image().optional(),
      imageAlt: z.string().optional(),
    }),
});

const reviews = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/reviews" }),
  schema: ({ image }) =>
    z.object({
      type: z.enum(["HARDWARE", "SOFTWARE"]),
      verdict: z.enum(["RECOMMENDED", "MIXED", "PASS"]),
      name: z.string(),
      date: isoDate,
      excerpt: z.string(),
      draft,
      image: image().optional(),
      coverArt: image().optional(),
      imageAlt: z.string().optional(),
    }),
});

export const collections = { blog, projects, reviews };
