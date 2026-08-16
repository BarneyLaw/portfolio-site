import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";

import { rehypeHeadingAnchors } from "./src/lib/rehype-heading-anchors.mjs";

// ── Dev API proxy target ─────────────────────────────────────────────────
// Where `astro dev` forwards /api. Defaults to the deployed backend so a fresh
// clone can exercise comments immediately; point DEV_API_TARGET at a local Go
// process (e.g. http://localhost:8080) when you have one running.
//
// A trailing /api is tolerated and stripped: the proxy preserves the request
// path, so the target must be a bare origin or every call would land on
// /api/api/…, which is a genuinely confusing 404 to debug.
const DEV_API_TARGET = (process.env.DEV_API_TARGET?.trim() || "https://site.packetcraft.dev")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

/** Warns once, at dev startup, that dev traffic is hitting a real backend. */
const devProxyNotice = {
  name: "packetcraft:dev-api-proxy",
  hooks: {
    "astro:config:setup": ({ command, logger }) => {
      if (command !== "dev") return;
      logger.warn(`/api is proxied to ${DEV_API_TARGET}`);
      if (!DEV_API_TARGET.includes("localhost") && !DEV_API_TARGET.includes("127.0.0.1")) {
        logger.warn(
          "That is a real backend: comments and likes posted in dev are real writes. Set DEV_API_TARGET to point elsewhere.",
        );
      }
    },
  },
};

// ── Administrator surface ────────────────────────────────────────────────
// Built only when ADMIN_UI is set, and served only from the Cloudflare
// Access-protected hostname. The page lives outside src/pages and is injected
// here, rather than living in src/pages behind an empty getStaticPaths:
// suppressing the route still compiles the page's <script>, which put 4.7 KB
// of moderation code on the public origin as an orphan chunk.
//
// This switch keeps a useless page off the public site. It is not what
// protects moderation — that is the Access application in front of the admin
// hostname and the assertion-verifying middleware in the Go API.
const adminUiEnabled = ["1", "true"].includes(
  (process.env.ADMIN_UI ?? "").trim().toLowerCase(),
);

const adminUi = {
  name: "packetcraft:admin-ui",
  hooks: {
    "astro:config:setup": ({ injectRoute, logger }) => {
      if (!adminUiEnabled) return;
      logger.warn(
        "ADMIN_UI is set: building /admin/comments. Serve this output only from the Cloudflare Access-protected hostname.",
      );
      injectRoute({
        pattern: "/admin/comments",
        entrypoint: "./src/admin/comments.astro",
      });
    },
  },
};

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

    // ── Dev-only API proxy ───────────────────────────────────────────────
    // In production the site and the API share an origin, so the browser
    // never involves CORS. `astro dev` breaks that: the page is on
    // localhost:4321 and the API is on another host, which makes every call a
    // cross-origin request — and the Go backend sends no CORS headers at all
    // (by design; it never needs them in production). The browser fetches the
    // response and then refuses to let JavaScript read it, surfacing as a bare
    // "TypeError: Failed to fetch". A comment POST fails even earlier: its
    // preflight OPTIONS gets a 405.
    //
    // Proxying restores the production shape. The page calls
    // http://localhost:4321/api/… (same origin, no CORS), and Vite forwards it
    // server-side, where CORS does not apply.
    //
    // `changeOrigin` is required, not cosmetic: Traefik routes the backend by
    // Host, so a forwarded request still carrying `Host: localhost:4321` would
    // not match its rule.
    //
    // This block only exists in `astro dev`. It is absent from `astro build`
    // output and does NOT apply to `astro preview`, which serves dist/ from a
    // different server — point PUBLIC_API_BASE_URL at a real origin, or use a
    // standalone proxy, when testing a production build.
    server: {
      proxy: {
        "/api": {
          target: DEV_API_TARGET,
          changeOrigin: true,
        },
      },
    },
  },

  integrations: [
    mdx(),
    // Emits /sitemap-index.xml + /sitemap-0.xml from the routes actually
    // built. Drafts never reach the build (see src/lib/content.ts), so the
    // only thing to exclude is the administrator surface — which is normally
    // absent anyway, since it is built only when ADMIN_UI is set.
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith("/admin"),
    }),
    adminUi,
    devProxyNotice,
  ],
});
