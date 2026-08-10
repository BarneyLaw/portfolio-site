import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";

import { rehypeHeadingAnchors } from "./src/lib/rehype-heading-anchors.mjs";

// ── Production origin ────────────────────────────────────────────────────
// The one place the deployed origin is decided. Astro injects it as
// `import.meta.env.SITE`, which src/lib/site.ts re-exports as SITE_ORIGIN, so
// canonical tags, the RSS feed and the sitemap cannot drift apart.
//
// Override per-environment with PUBLIC_SITE_ORIGIN (the container passes it as
// a build arg). Validated here rather than at render time: a malformed origin
// silently produces a sitemap full of broken URLs, and the build is the last
// moment anyone is watching.
const DEFAULT_ORIGIN = "https://packetcraft.dev";
const rawOrigin = process.env.PUBLIC_SITE_ORIGIN?.trim() || DEFAULT_ORIGIN;

let site;
try {
  const url = new URL(rawOrigin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("must use https (except on localhost)");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("must be a bare origin, with no path, query or fragment");
  }
  // Astro wants no trailing slash; URL.origin never has one.
  site = url.origin;
} catch (err) {
  throw new Error(
    `PUBLIC_SITE_ORIGIN is not a usable production origin: ${rawOrigin}\n` +
      `  ${err instanceof Error ? err.message : String(err)}\n` +
      `  Expected something like ${DEFAULT_ORIGIN}`,
  );
}

// https://astro.build/config
export default defineConfig({
  site,

  // We manage images ourselves (sprite frames via import.meta.glob), so we
  // don't need sharp-based image optimization.
  image: {
    service: { entrypoint: "astro/assets/services/noop" },
  },

  markdown: {
    // @astrojs/mdx inherits this block, so MDX bodies get the same treatment.
    //
    // Plugins hang off `processor: unified(...)`; the old top-level
    // markdown.rehypePlugins is deprecated and warns on every build.
    //
    // Astro assigns heading ids in its own rehype pass, which runs *after*
    // these, so the anchor plugin would see no ids to link to. Running
    // Astro's own rehypeHeadingIds first is the documented fix, and reuses
    // the exact slugger Astro's `headings` list (and the table of contents)
    // is built from — hand-rolling a slug here would eventually disagree.
    processor: unified({
      rehypePlugins: [rehypeHeadingIds, rehypeHeadingAnchors],
    }),

    // Shiki highlights at build time — no highlighter ships to the browser.
    // Two themes are emitted at once: colours land as inline CSS custom
    // properties and src/styles/content.css picks the dark set under `.dark`.
    // defaultColor:false is what stops Shiki hardcoding the light colours and
    // makes the variables authoritative.
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      wrap: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },

  integrations: [
    mdx(),
    // Emits /sitemap-index.xml + /sitemap-0.xml from the routes actually
    // built. Drafts never reach the build (see src/lib/content.ts), so there
    // is nothing to exclude here today; `filter` is where admin routes would
    // be dropped when Milestone 3 adds them.
    sitemap(),
  ],
});
