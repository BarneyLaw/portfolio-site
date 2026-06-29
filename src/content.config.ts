import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

// Blog posts and project writeups are prose → MDX files with frontmatter.
// Reviews are structured records with no long body → a single JSON data file
// (the most database-like collection; see src/lib/content.ts for the seam
// where this can later be swapped for a Go/Postgres-backed query).

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
  loader: file("./src/content/reviews.json"),
  schema: z.object({
    id: z.string(),
    type: z.enum(["HARDWARE", "SOFTWARE"]),
    verdict: z.enum(["RECOMMENDED", "MIXED", "PASS"]),
    name: z.string(),
    date: z.string(),
    excerpt: z.string(),
  }),
});

export const collections = { blog, projects, reviews };
