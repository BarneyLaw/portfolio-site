import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

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
