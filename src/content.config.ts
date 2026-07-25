import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Every collection is prose → one MDX file per entry, frontmatter for the
// structured fields and the body for the writeup. See src/lib/content.ts for
// the seam where these can later be swapped for a Go/Postgres-backed query.

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    readTime: z.string(),
    category: z.string(),
    excerpt: z.string(),
    featured: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: z.object({
    name: z.string(),
    status: z.enum(["SHIPPED", "BUILDING", "PLANNED"]),
    tags: z.array(z.string()),
    meta: z.string(),
    description: z.string(),
    codeSnippet: z.string(),
    order: z.number().default(0),
  }),
});

const reviews = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/reviews" }),
  schema: z.object({
    type: z.enum(["HARDWARE", "SOFTWARE"]),
    verdict: z.enum(["RECOMMENDED", "MIXED", "PASS"]),
    name: z.string(),
    date: z.string(),
    excerpt: z.string(),
  }),
});

export const collections = { blog, projects, reviews };
