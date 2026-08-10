import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { getBlogPosts } from "../lib/content";
import { SITE, absoluteUrl } from "../lib/site";

// Feed of published blog posts. Draft and future-dated entries are already
// filtered out by getBlogPosts(), so subscribers see exactly what the site
// shows — the publication rules live in src/lib/content.ts, not here.
//
// Emitted as a static file at /rss.xml by the normal build; nothing dynamic.

export async function GET(context: APIContext) {
  const posts = await getBlogPosts();

  return rss({
    title: SITE.name,
    description: SITE.description,
    // Absolute item URLs are built from this. astro.config.mjs validates it.
    site: context.site ?? absoluteUrl("/"),
    items: posts.map((post) => ({
      title: post.data.title,
      // `date` is schema-validated YYYY-MM-DD, so this parses as UTC midnight
      // and a rebuild never shifts a post's timestamp.
      pubDate: new Date(`${post.data.date}T00:00:00Z`),
      description: post.data.excerpt,
      link: `/blog/${post.id}`,
      categories: [post.data.category],
    })),
    customData: "<language>en-us</language>",
  });
}
