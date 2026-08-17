# packetcraft.dev — Developer Documentation

A personal site (blog · reviews · portfolio · project showcase) built to ship
**as little client-side JavaScript as possible**.

- **Framework:** [Astro](https://astro.build) 7 (static output)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`) + CSS custom properties
- **Content:** Astro content collections — one MDX file per entry (frontmatter + prose)
- **Client JS:** none from a framework. A few hundred bytes of hand-written
  vanilla script per page (theme toggle, list filters, nav mascot, copy-code),
  all progressive enhancement.
- **Backend:** optional, and never a source of content. A Go + Postgres API
  powers comments on every reading plus view recording and likes on blog posts;
  published content is repository-backed and the site stays fully usable with
  the backend down (see [Backend integration](#backend-integration-go--postgres)).

The site began as a Figma Make export (a single ~900-line React `App.tsx`) and
was migrated to this stack in phases. See [Migration history](#migration-history).

---

## Quick start

```bash
npm install          # install deps
npm run dev          # dev server at http://localhost:4321
npm run build        # static build to ./dist
npm run preview      # serve the built ./dist
npm run check        # astro check — type-checks .astro + .ts, validates content
npm test             # smoke + accessibility tests (needs a build first)
```

Node 18+ recommended. `npm test` asserts on `dist/`, so run `npm run build`
first — CI does. The full gate is `npm run check && npm run build && npm test`.

### Environment variables

Both are optional; both are baked in at **build** time and end up in public
output, so neither may ever hold a secret.

| Variable | Default | Effect |
|---|---|---|
| `PUBLIC_SITE_ORIGIN` | `https://site.packetcraft.dev` | Origin used for canonical tags, the RSS feed, the sitemap and Open Graph URLs. Validated during build: must be a bare `https` origin (or `localhost`) with no path. Must be the host the site is genuinely reachable at — the apex `packetcraft.dev` does not resolve, and pointing this there tells crawlers the canonical URL is a dead host. |
| `PUBLIC_API_BASE_URL` | `/api` in the container, unset locally | Base for the Go backend. Empty disables every dynamic fragment at build time. See [Backend integration](#backend-integration-go--postgres). |
| `DEV_API_TARGET` | `https://site.packetcraft.dev` | Where `astro dev` proxies `/api`. Dev only — never affects a build. Point it at a local Go process to keep dev writes off production. |
| `CONTENT_REVISION` | `GITHUB_SHA`, else `git rev-parse HEAD` | Commit id stamped into `dist/content-registry.json`. Required for container builds — `.dockerignore` excludes `.git`. |
| `ADMIN_UI` | unset | Set to `1` to build the Cloudflare Access-protected moderation page. Off by default; a public build contains no admin route or code. See [Administrator surface](#administrator-surface-cloudflare-access). |

### Generated assets

Two committed artifacts are produced by hand-run scripts, not by the build:

```bash
node scripts/pixelize.mjs [src.png] [out.json] [cols]   # sprite → palette+RLE JSON
node scripts/make-og-card.mjs                           # → public/og-default.png
```

---

## Rendering model (read this first)

Everything is **statically rendered at build time** to plain HTML. There are
**no Astro islands** and **no framework runtime** shipped to the browser.

Interactivity is a handful of small hand-written scripts. Astro inlines most of
them into the page as minified `<script type="module">` blocks; only the theme
bootstrap is `is:inline` (it has to run before first paint).

| Feature | Where | What it does |
|---|---|---|
| Theme bootstrap | `src/layouts/Layout.astro` `<head>` | `is:inline`; applies the saved theme before paint so there is no flash |
| Theme toggle | `src/layouts/Layout.astro` | Flips `.dark`, persists to `localStorage`, keeps `aria-pressed` in sync |
| Nav mascot pause | `src/components/astro/Nav.astro` | Parks the walking packet; persisted, and skipped under `prefers-reduced-motion` |
| Projects / Reviews filters | `src/pages/projects/index.astro`, `src/pages/reviews/index.astro` | Show/hide cards by toggling `hidden`; unfiltered without JS |
| Copy-code buttons | `src/components/astro/CodeCopy.astro` | Injects a copy button into each `.mdx-content pre`; nothing renders without JS |
| Comments (all readings) | `src/components/astro/Comments.astro` → `src/features/comments/mount.ts` | Injects a "view comments" button; the module and its request load only when it is pressed |
| Stats + likes (all readings) | `src/components/astro/PostStats.astro` → `src/features/post-stats/mount.ts` | Same lazy trigger; fetches totals once and owns the like button |
| View beacon (all readings) | `src/components/astro/ViewCounter.astro` | Records one view after a 5s dwell; imports the API client only at that point |

That's the complete client-side JS inventory. Everything else — pagination,
the table of contents, syntax highlighting, filtering's default state — is
static HTML. If you find yourself reaching for a framework or a heavy
dependency, re-read [Guiding principles](#guiding-principles).

### Content rules live in one place

`src/lib/content.ts` documents the whole publication contract as four numbered
rules: what counts as published (`draft`, future dates), that unpublished
entries are absent from **everything** including `getStaticPaths`, that
ordering is total and never depends on file order, and how the featured post is
chosen. Change publication behaviour there, not in a page.

## Testing

One command, seven suites. Most assert on the real `dist/` output; two import
the TypeScript source directly (Node strips the types, so no build step).

| Suite | Covers |
|---|---|
| `test/build-output.test.mjs` | Routes emitted, drafts withheld, internal links, external `rel` safety, RSS/sitemap/canonical agreement, social cards, image dimensions, archive paging, heading anchors, print rules, theme persistence, filter/data agreement |
| `test/accessibility.test.mjs` | Heading structure, landmarks, skip link, unique ids, accessible names, colour-independence, control state, zoom — see [Accessibility](#accessibility) |
| `test/served-site.test.mjs` | HTTP behaviour: clean URLs, 404s, MIME types, cache policy |
| `test/api-contract.test.mjs` | The validators guarding the network boundary — imports the TypeScript source directly (Node strips the types) |
| `test/api-transport.test.mjs` | `apiRequest` against a real local server: timeout, cancellation, error mapping, and that a 2xx failing its validator is rejected |
| `test/comments.test.mjs` | The XSS rule across every feature module, that only `api.ts` calls `fetch`, and the shipped comment and stats shells |
| `test/content-contract.test.mjs` | FEAT-202: pages never import an API module or call `getCollection`, no migration or content table exists, and every detail route carries its body in the HTML |
| `test/content-registry.test.mjs` | The generated manifest: schema validity, full collection coverage, drafts included, explicit `comments_enabled`, sorted unique slugs |
| `test/stats-cache.test.mjs` | The stats memo: TTL boundary, future timestamps, tampered entries, unavailable storage |
| `test/admin-surface.test.mjs` | No build ships a login form or token storage, public builds contain no admin code at all, and admin stays out of sitemap/feed/robots |

There is no browser and no browser dependency. `test/served-site.test.mjs`
re-implements the `try_files` rule from `nginx.conf` over `node:http`; the
`container` job in CI runs the same probes against the real image, which is
what actually validates the nginx config.

---

## Directory structure

```
portfolio-site/
├── astro.config.mjs          # Astro config: MDX + Tailwind vite plugin, @ alias, noop image service
├── tsconfig.json             # extends astro/tsconfigs/strict; @/* path alias
├── package.json              # astro + @astrojs/mdx (deps); tailwind, typescript, checks (dev)
├── src/
│   ├── pages/                # ROUTES (file-based). Each .astro file = one URL.
│   │   ├── index.astro       #   /            Home (feed built from collections)
│   │   ├── about.astro       #   /about       About (static)
│   │   ├── blog.astro        #   /blog        Blog index — page 1 of the archive
│   │   ├── blog/[slug].astro #   /blog/:slug  Blog post (renders MDX body)
│   │   ├── blog/page/[page].astro # /blog/page/:n  Archive pages 2..N
│   │   ├── rss.xml.ts        #   /rss.xml     Feed of published posts
│   │   ├── reviews/
│   │   │   ├── index.astro   #   /reviews     Reviews list (filterable)
│   │   │   └── [id].astro    #   /reviews/:id Review detail (renders MDX body)
│   │   └── projects/
│   │       ├── index.astro   #   /projects    Projects grid (filterable)
│   │       └── [id].astro    #   /projects/:id Project detail (renders MDX body)
│   ├── layouts/
│   │   └── Layout.astro       # HTML shell + the page metadata contract (title,
│   │                          #   description, canonical, Open Graph), Nav, Footer
│   ├── components/astro/      # Presentational .astro components (no client JS unless noted)
│   │   ├── Nav.astro          #   ⚠ inline JS: sticky header, active link, theme + mascot buttons
│   │   ├── Footer.astro       #   Footer: links from src/lib/site.ts, build date, Ruri sprite
│   │   ├── Pagination.astro   #   Prev/next/numbered links; renders nothing on a 1-page list
│   │   ├── PostList.astro     #   The blog list rows, shared by /blog and /blog/page/:n
│   │   ├── TableOfContents.astro # <details> contents built from render()'s headings
│   │   ├── CodeCopy.astro     #   ⚠ inline JS: injects copy buttons into .mdx-content pre
│   │   ├── Cursor.astro        #   Blinking terminal cursor
│   │   ├── Hatch.astro        #   Hatched placeholder box (stands in for images)
│   │   ├── Tag.astro          #   Small pill/tag (accepts a slot)
│   │   ├── StatusBadge.astro  #   Project status pill (SHIPPED/BUILDING/PLANNED)
│   │   ├── VerdictBadge.astro #   Review verdict pill (RECOMMENDED/MIXED/PASS)
│   │   ├── TerminalSnippet.astro # Renders a code string as terminal lines
│   │   ├── PixelArt.astro     #   Draws a palette+RLE sprite as build-time SVG
│   │   └── Sprite.astro       #   ⚠ has inline JS: cycles walk-cycle frames
│   ├── data/                   # Generated sprite data (see scripts/pixelize.mjs)
│   │   └── ruri-pixels.json    #   170x172 grid, 27-colour palette + RLE runs
│   ├── content/               # CONTENT (the data)
│   │   ├── blog/*.mdx          #   Blog posts: frontmatter + prose body
│   │   ├── projects/*.mdx      #   Project writeups: frontmatter + prose body
│   │   └── reviews/*.mdx       #   Reviews: frontmatter (verdict/type) + prose body
│   ├── content.config.ts       # Collection definitions + zod schemas
│   ├── lib/
│   │   ├── content.ts          # ★ Content access layer + the publication rules
│   │   ├── site.ts             # ★ Identity, origin, nav/footer/profile links, contact
│   │   ├── pagination.ts       #   paginate() + blog page size and paths
│   │   ├── rehype-heading-anchors.mjs # Wraps MDX headings in a link to their own id
│   │   ├── api.ts              # ★ The only place fetch() hits the API
│   │   ├── api-contract.ts     # ★ Types + runtime validators from openapi.yaml
│   │   ├── comments.ts         #   listComments / createComment
│   │   ├── views.ts            #   recordView (split so the beacon stays small)
│   │   ├── stats.ts            #   getPostStats / setPostLiked + local like memory
│   │   └── when-visible.ts     #   shared "load when it scrolls near" trigger
│   ├── features/
│   │   ├── comments/mount.ts   # ⚠ client-only comment UI, dynamically imported
│   └── post-stats/mount.ts # ⚠ client-only totals + like button
│   ├── styles/
│   │   ├── index.css           # Entry: imports the five below
│   │   ├── fonts.css           # IBM Plex Mono @import + @keyframes blink / scan
│   │   ├── tailwind.css        # Tailwind import + @source content globs  ⚠ see gotcha
│   │   ├── theme.css           # CSS variables (light + .dark), focus ring, reduced motion
│   │   ├── content.css          # .mdx-content styles, heading anchors, Shiki dual theme
│   │   ├── print.css            # @media print — hides [data-print="hide"] chrome
│   │   └── globals.css          # empty, unused (Figma leftover — removable)
│   ├── img/                    # Sprite art (darjeeling.png + 25 walk frames)
│   └── vite-env.d.ts           # vite/client types (import.meta.glob)
├── public/
│   └── og-default.png          # Generated social card (scripts/make-og-card.mjs)
├── scripts/
│   ├── pixelize.mjs            # PNG → palette+RLE sprite JSON (run by hand)
│   └── make-og-card.mjs        # → public/og-default.png (run by hand)
└── test/
    ├── build-output.test.mjs   # Assertions over dist/
    ├── accessibility.test.mjs  # Structural a11y checks over dist/
    └── served-site.test.mjs    # HTTP behaviour (mirrors the nginx try_files rule)
```

`★` = the two files that matter most for future backend work.
`⚠` = has a caveat documented below.

---

## Component & module reference

### Routes (`src/pages/`)
Astro uses **file-based routing**: a file's path is its URL. `[param]` files are
dynamic and enumerate their pages with `getStaticPaths()`.

- **`index.astro` (Home)** — Hero, a terminal "whoami" block, a **hardcoded**
  featured item and "recent" feed, and quick-nav cards. The recent/featured
  content is intentionally curated (not queried from collections). Uses
  `Cursor`, `Hatch`, `Tag`, and `Sprite`.
- **`about.astro`** — Static bio, tech-stack tags, "now" block, links.
- **`blog.astro`** — Lists posts from `getBlogPosts()`. Picks the `featured`
  post for the hero card; the rest are a dated list. Pagination buttons are
  **decorative only** (not wired). Links to `/blog/:slug`.
- **`blog/[slug].astro`** — One page per post via `getStaticPaths()`. Renders the
  MDX body with `<Content />` (from `render(post)`), styled by `.mdx-content`.
- **`projects/index.astro`** — Grid from `getProjects()`. Filter buttons
  (all/shipped/in-progress/planned) run a small inline script that toggles the
  `hidden` class on cards by `data-status`. Cards link to `/projects/:id`.
- **`projects/[id].astro`** — One page per project. Renders the MDX writeup +
  the `codeSnippet` frontmatter as a `TerminalSnippet`, and the frontmatter
  `links` in the sidebar. A live demo/status fragment would be a
  [backend integration](#backend-integration-go--postgres) candidate; no
  endpoint exists for it yet.
- **`reviews/index.astro`** — List from `getReviews()`, same filter pattern as
  projects but keyed on `data-type` (hardware/software). Cards link to
  `/reviews/:id`.
- **`reviews/[id].astro`** — One page per review. Renders the MDX body next to a
  sidebar with the verdict badge and meta (type, date).

### Layout (`src/layouts/Layout.astro`)
The single HTML shell. Props: `title`, `description`. Responsibilities:
- `<head>` metadata + global `html,body` reset.
- **No-flash theme init**: an `is:inline` script that adds `.dark` to `<html>`
  *before paint*, and only when `localStorage` holds an explicit `"dark"`.
  It does not look at `prefers-color-scheme` — see
  [Theme](#theme-light-is-the-default-on-purpose).
- Renders `<Nav />`, the page `<slot />`, `<Footer />`.
- **Theme-toggle script**: wires `#theme-toggle` (the button lives in `Nav`) to
  flip `.dark` and persist the choice.

### Presentational components (`src/components/astro/`)
All are pure/stateless and take props or slots. `Nav` and `Footer` are the
shared chrome; the rest are small building blocks reused across pages. Only
`Sprite.astro` carries client JS.

`PixelArt.astro` takes a `{ w, h, pal, rle }` sprite and expands the runs into
one `<path>` per palette colour at build time — static markup, no canvas and no
JS. Regenerate a sprite with `node scripts/pixelize.mjs [src.png] [out.json]
[cols]`, which nearest-neighbour downscales the art, snaps channels to
multiples of 8, and run-length encodes the result. Keep `scale` an integer so
sprite pixels land on device pixels.

Note: these `.astro` primitives were ported from the original React components.
They are the source of truth now; the React versions were deleted.

### Content layer (`src/lib/content.ts`) ★
Every page reads content **through this module**, never by calling
`getCollection` directly:

```ts
getProjects()            // published, by `order` then id
getProject(id)
getBlogPosts()           // published, newest first then id
getBlogPost(id)
getFeaturedPost()        // the featured rule, in one place
getReviews()             // published, newest first then id
getReview(id)
socialImageOf(entry)     // coverArt ?? image, for the social card
```

Every list here already applies the publication rules, so a draft or a
future-dated entry cannot leak into a page, a feed, or the sitemap.

This indirection is the whole point: when a backend arrives, you change the
*bodies* of these functions to fetch from Go and **nothing else changes** —
pages, schemas, and call sites stay identical.

### Content definitions (`src/content.config.ts`)
Three collections with zod schemas:
- `blog` — `glob()` loader over `src/content/blog/*.mdx`
- `projects` — `glob()` loader over `src/content/projects/*.mdx`
- `reviews` — `glob()` loader over `src/content/reviews/*.mdx`

Schemas validate at build time (`npm run check` / `npm run build`). Change a
field here and TypeScript + the build will tell you every place to update.

---

## Content authoring

### Add a blog post
Create `src/content/blog/my-post.mdx`. The filename becomes the URL slug
(`/blog/my-post`).

```mdx
---
title: "Post title"
date: "2026-07-01"        # YYYY-MM-DD, validated. A future date withholds the post.
readTime: "6 min"
category: "homelab"
excerpt: "One-line summary shown in the list and in the feed."
featured: false           # nominates it for the hero card; newest flagged post wins
draft: false              # true → no list entry, no page, no feed, no sitemap
comments: true            # false closes comments on this post; the section vanishes
coverArt: "../../img/blog/thing.png"   # optional, decorative — see Images below
coverArtAlt: "…"          # only if the art carries meaning the headline doesn't
---

Markdown / MDX body. Renders on the detail page inside `.mdx-content`.

## A heading
Every `##` gets a stable id and a permalink anchor. Four or more of them turns
on the collapsible table of contents.

```go
// Fenced code is highlighted at build time, in both light and dark themes.
```
```

Start the body at `##`. A `#` would compete with the page's own `<h1>`, and
`test/accessibility.test.mjs` fails the build for two h1s on a page.

### Add a project
Create `src/content/projects/my-project.mdx`. Filename = `/projects/:id`.

```mdx
---
name: my project
status: BUILDING          # SHIPPED | BUILDING | PLANNED
order: 5                  # controls position in the grid
tags: ["Go", "Postgres"]
meta: "Go · self-host"
description: "Card blurb (also used as the page meta description)."
codeSnippet: |-
  $ some command
  ▸ output line
draft: false
links:                    # optional; the sidebar block is omitted when empty
  - label: "github"
    href: "https://github.com/you/repo"   # must be an absolute http(s) URL
image: "../../img/project/shot.png"       # meaningful screenshot
imageAlt: "Screenshot of …"               # required when `image` is set
---

The writeup body (rendered on the detail page).
```

### Images

Two slots, two different jobs:

| Field | Role | Alt text |
|---|---|---|
| `image` | A **meaningful** preview — screenshot, product photo. Shown on list/grid cards. | `imageAlt`, describe it properly |
| `coverArt` | **Decorative** artwork for the wide feature cards on Home. | `alt=""` by default; set `coverArtAlt` only to override |

Both go through Astro's asset pipeline, so intrinsic `width`/`height` are known
at build time and every image reserves its box before it loads — do not add
manual `width`/`height` props, they were removed because they did not match the
files' real aspect ratios.

The social card prefers `coverArt`, then `image`, then `public/og-default.png`.

`sharp` optimization is **off** (`image.service: noop` in `astro.config.mjs`):
source assets are expected to be pre-sized. Animated or video content is not
used anywhere yet; if it is added it needs a poster frame and must not autoplay
with sound.

### Add a review
Create `src/content/reviews/thing-slug.mdx`. Filename = `/reviews/:id`.

```mdx
---
name: "Product name"
type: HARDWARE            # HARDWARE | SOFTWARE
verdict: RECOMMENDED      # RECOMMENDED | MIXED | PASS
date: "2026-07-01"
excerpt: "One-liner shown in the list."
---

The review body (rendered on the detail page).
```

---

## Styling & theming

- **Tailwind v4** via `@tailwindcss/vite` (no `tailwind.config.js`).
- **Theme tokens** live in `src/styles/theme.css` as CSS custom properties for
  light and `.dark`, mapped to Tailwind color utilities via `@theme`. Change a
  brand color there and it propagates everywhere.
- **Dark mode** is a `.dark` class on `<html>` (see Layout). The custom variant
  `@custom-variant dark (&:is(.dark *))` in `theme.css` powers `dark:` utilities.
- **Fonts / keyframes** in `src/styles/fonts.css` (IBM Plex Mono + `blink`/`scan`).
  The body family is set inline in `Layout.astro`; the nav wordmark keeps
  Press Start 2P.
- **MDX body styling** in `src/styles/content.css` (`.mdx-content`) — deliberately
  hand-rolled to avoid pulling in `@tailwindcss/typography`.

### ⚠ Tailwind content-scan gotcha
`src/styles/tailwind.css` uses `source(none)` + an explicit `@source` glob:

```css
@import 'tailwindcss' source(none);
@source '../**/*.{astro,js,ts,jsx,tsx,md,mdx,html}';
```

Only files matching that glob are scanned for class names. **If you add a new
file type (or classes only inside a `<script>` string) and styles go missing,
this glob is the first place to check.** A past regression came from `.astro`
not being in the list. Also note: classes assigned dynamically in JS (e.g. the
filter scripts) work only because the class strings appear literally in the
`.astro` source that the scanner reads.

---

## Accessibility

### What is checked automatically

`test/accessibility.test.mjs` runs over the built HTML on every `npm test`. It
covers the things that are decidable from markup alone:

- exactly one `<h1>` per page, and no skipped heading levels
- `lang` on `<html>`, and the banner/main/navigation/contentinfo landmarks
- a skip link on every page that points at an element that exists
- unique `id`s
- an accessible name on every `<button>` and `<a>`
- no vague link text ("click here", "read more")
- project status and review verdict present as **text**, not colour alone
- `aria-pressed` on the theme toggle and both filter groups
- a viewport meta that does not block pinch zoom

There is no browser in the test suite, so nothing here proves how the page
actually paints or announces. That is what the checklist below is for.

### Manual checklist

Run this against `npm run preview` when you change navigation, the theme
toggle, the filters, or any layout. It takes about five minutes.

1. **Keyboard only, no mouse.** From a fresh page load press `Tab`. The first
   stop must be "Skip to content" and it must become visible. `Enter` on it
   should jump focus into the page body.
2. **Focus is always visible.** Keep tabbing through nav, filters, cards,
   pagination and the footer. Every stop must show a ring. Nothing should be
   focusable that does not do something.
3. **Filters work from the keyboard.** On `/projects` and `/reviews`, tab to a
   filter and press `Enter`/`Space`. The pressed state should move with it.
4. **Theme toggle.** Activate it from the keyboard; the choice must survive a
   reload and a navigation to another page.
5. **No JavaScript.** Disable JS and reload. Every post must still be
   reachable through `/blog` and `/blog/page/N`, all projects and reviews must
   be visible (unfiltered), and no control should be present that now does
   nothing. On a post, the comment section must show its `<noscript>`
   explanation and **no form**.
6. **Comments, when the backend is reachable.** Tab into the form: both fields
   must be labelled, an empty submit must move focus to the first error, and
   the honeypot must never receive focus. Stop the backend and reload — the
   section must say so and the article must be unchanged.
7. **Narrow and wide.** At 320px and at 1440px, no page may scroll sideways.
8. **Reduced motion.** With the OS "reduce motion" setting on, the nav mascot
   must be parked and nothing should animate.
9. **Zoom.** At 200% browser zoom the layout must stay usable.

### Theme: light is the default, on purpose

A first-time visitor gets the light theme no matter what their OS is set to.
The site does **not** consult `prefers-color-scheme`; only an explicit click on
the toggle turns dark on, and that choice is what persists.

This is a product decision, not an oversight, and
`test/build-output.test.mjs` enforces both halves of it: the pre-paint
bootstrap must read the saved theme, and no `prefers-color-scheme` fallback may
reappear. If you ever want OS-driven theming, change the test in the same
commit — it is there to make the reversal deliberate.

`prefers-reduced-motion` is a different question and **is** honoured, both
site-wide in `src/styles/theme.css` and specifically for the nav mascot.

## Backend integration (Go + Postgres)

The site is static and stays completely useful with the backend down. The API
powers *optional fragments* only — never page content. `openapi.yaml` in the
backend repository is the contract; `src/lib/api-contract.ts` is its
transcription.

### Testing against the API in dev

Set `PUBLIC_API_BASE_URL=/api` and let `astro dev` proxy it. **Do not point it
straight at `https://site.packetcraft.dev/api`** — that is the one setup that
cannot work.

In production the site and API share an origin, so CORS never arises and the Go
backend deliberately sends no CORS headers. `astro dev` breaks that assumption:
the page is on `localhost:4321`, so every call becomes cross-origin, and

- a `GET` returns `200` with data that the browser then **refuses to let
  JavaScript read** — it surfaces only as `TypeError: Failed to fetch`;
- a comment `POST` never leaves the browser at all: its preflight `OPTIONS`
  gets a `405`.

`curl` shows none of this, because curl does not enforce CORS. That mismatch is
what makes it confusing to debug.

The proxy in `astro.config.mjs` restores the production shape: the page calls
`localhost:4321/api/…` (same origin), and Vite forwards it server-side where
CORS does not apply. `changeOrigin` is required — Traefik routes the backend by
`Host`, so a forwarded request still claiming `localhost:4321` would not match.

> **Dev writes are real writes.** The proxy defaults to the deployed backend, so
> a comment or a like posted from `localhost` lands in production, and simply
> reading a post records a real view after the 5s dwell. `astro dev logs` warns
> about this at startup. Set `DEV_API_TARGET=http://localhost:8080` to point at
> a local Go process instead.

The proxy is **dev only**. It does not exist in a build, and it does **not**
apply to `astro preview`, which serves `dist/` from a different server — for
that, point `PUBLIC_API_BASE_URL` at a real origin or run a standalone proxy.

## Content registry (what the backend is allowed to store)

The repository stays the source of truth for content. PostgreSQL holds only the
*identity and policy* the backend needs to authorize comments, views and likes —
never bodies. It learns those from a manifest this build generates.

`npm run build` emits **`dist/content-registry.json`**, generated by
`src/pages/content-registry.json.ts` from the same loaded collections the pages
use. CI publishes it as the `content-registry` artifact; GitOps copies it to
`apps/portfolio/backend/content-registry.json`, where a Kustomize ConfigMap
feeds the backend's content-sync Job.

```json
{ "schema_version": 1, "mode": "full", "source": "portfolio-site",
  "revision": "<commit>", "items": [
    { "slug": "building-a-homelab", "kind": "blog",
      "status": "published", "comments_enabled": true } ] }
```

### ⚠ The manifest is complete, and omission archives

`mode` is always `"full"`. The sync job **archives every registry row it owns
whose slug the manifest does not list** — and it cannot tell a deliberate
removal from a generator bug that dropped an entire collection. Both look the
same from its side.

Archiving never deletes comments, views or likes, and re-listing a slug brings
them back, so a mistake is recoverable. It would still pull every affected
page's interactions out of public view until someone noticed.

So the generator **fails the build** rather than emit a doubtful snapshot:

| Guard | Why |
|---|---|
| A configured collection contributes no entries | The failure mode the backend cannot detect — it would archive that whole collection |
| Two collections share a slug | The API is keyed on `{slug}` alone, so their comments would merge |
| No usable `revision` | A registry nobody can trace to a commit is worse than a failed build |
| The manifest violates the schema | Caught here, cheaply, instead of at deploy time |

All four are verified as real failures, not just written down.
`test/content-registry.test.mjs` re-checks every one against the built file,
including the collection-coverage test the backend contract explicitly requires.

### Rules the generator follows

- **Drafts are included**, as `status: "draft"` — omitting them would archive
  them. `status` reuses the site's own publication predicate, so it can never
  disagree with what actually got built. `"archived"` is the backend's word for
  a slug we stopped listing; the site never declares it.
- **`comments_enabled` needs an explicit `comments: true`.** The frontmatter
  default is `false` on all three collections, because this value opens a public
  write surface — a new entry must never do that by accident.
- **Sorted by slug**, so the GitOps diff shows content changes rather than
  reordering churn.
- **`kind`** is descriptive metadata (`blog`, `project`, `review`); the registry
  row's existence is the allowlist, and nothing authorizes on kind.

### The revision

`GITHUB_SHA` in CI, `CONTENT_REVISION` if set, otherwise `git rev-parse HEAD`
locally. `.dockerignore` excludes `.git`, so **container builds must pass
`--build-arg CONTENT_REVISION=…`** — both workflows do.

### Release ordering

Registry sync must finish *before* the matching frontend image goes public, or a
page can be live while the backend still refuses its comments. Argo CD sync
waves only order resources within one Application, so if frontend and backend
are separate Applications, frontend CI has to: commit the manifest → wait for
the backend content-sync Job to succeed → promote the frontend image. A failed
sync must stop promotion. **That two-stage promotion is not implemented here** —
this repository currently produces and publishes the artifact only.

### The content boundary is not negotiable

Published blog, project and review content is **repository-backed**: MDX files,
validated by content collection schemas, rendered at build time. There is no
content table, no synchronisation job, and no migration. Publishing is "edit a
file, rebuild".

The Go API is only for what cannot be a repository file — comments, views,
likes. `test/content-contract.test.mjs` enforces this: a page may not import an
API module or call `getCollection` directly, every detail route must carry its
body in the emitted HTML, and the build may not fetch. If you find yourself
wanting an endpoint that returns posts, that is the contract telling you no.

### The layers

| Module | Job |
|---|---|
| `src/lib/api-contract.ts` | Types, runtime validators, and the documented limits. No `fetch`, no `import.meta.env` — so it unit-tests under plain `node --test`. |
| `src/lib/api.ts` | `apiRequest()`: base URL, timeout, cancellation, error mapping, response validation. **The only place `fetch` is called.** A test enforces that. |
| `src/lib/comments.ts` | `listComments`, `createComment`. |
| `src/lib/stats.ts` | `getPostStats`, `setPostLiked`, and the local like memory. |
| `src/lib/views.ts` | `recordView`. Separate from comments so the eager view beacon does not pull the comment client into its chunk. |

`apiRequest(path, options)` delegates to `requestFrom(base, path, options)`.
The split exists so the transport can be tested against a local server —
`import.meta.env` has no value outside the Vite build, so a module-level base
cannot be exercised directly.

`apiRequest` always rejects with an `ApiError` carrying a `kind`
(`network` / `timeout` / `http` / `malformed`), so call sites branch on that
rather than on message text. **A 2xx whose body fails its validator is treated
as a failure** — unvalidated network data never reaches a page.

Timeout is `REQUEST_TIMEOUT_MS` (8s). Requests send `credentials: "omit"`:
every endpoint in the spec is public, and sending credentials to a public API
is a way to leak them.

### Deployment prerequisite

`PUBLIC_API_BASE_URL=/api` is **same-origin**, so something must route `/api`
to the Go service. `nginx.conf` in this repository does **not** proxy it — the
k3s ingress is expected to. Until that routing exists, every fragment shows its
unavailable state and the rest of the site is unaffected.

`PUBLIC_API_BASE_URL` is read at **build** time and baked into the output. It
is `PUBLIC_*`, so it ships to the browser and must never hold a secret.

> ⚠ **Windows/Git Bash:** `PUBLIC_API_BASE_URL=/api npm run build` in Git Bash
> silently bakes `C:/Program Files/Git/api` — MSYS rewrites values that look
> like Unix paths. Build from PowerShell, or set `MSYS_NO_PATHCONV=1`.

### Comments (FEAT-204)

Rendered on **every reading — blog posts, projects and reviews** — by
`src/components/astro/Comments.astro`; the UI lives in
`src/features/comments/mount.ts`.

- The static page ships **only a shell** — heading, reserved status and list
  regions, and a `<noscript>` note. No form, no pre-rendered comments, and no
  button.
- Comments **open on request**, not on scroll. A script-injected
  "view comments" control dynamically imports `mount.ts` when pressed, so a
  page makes *zero* API calls until the reader asks. Reaching the end of a long
  article is not the same as asking for a comment thread.
- The opener is injected rather than written into the HTML for the usual
  reason: without JavaScript it would be a button that does nothing.
- The form is built by script because the API takes JSON; a plain HTML form
  could not submit to it, and a form that cannot work is worse than none.
- Set `comments: false` in an entry's frontmatter to close comments on it.
  All three collections have the field.

> **Slugs must stay unique across collections.** The backend's
> `content_items.slug` is a primary key shared by every kind, and the API is
> keyed on slug alone (`/posts/{slug}/comments`). A project and a review with
> the same slug would be one row there and their threads would merge.
> `test/comments.test.mjs` fails if two collections ever collide.

#### Which readings the backend actually accepts

Right now: **blog posts only.** The registry constrains `kind` to
`('post','project')` — there is no `review` kind — it seeds only the four blog
slugs, and every dynamic feature goes through a `PublishedPostExists` check
hard-coded to `kind = 'post'`.

Verified against the live deployment: blog slugs return `200`, project and
review slugs return `404`. Those pages show *"Comments aren't open for this one
yet."* and drop the form, which is the honest rendering of an entry the API
does not know.

To turn them on, the backend needs a forward-only migration that widens the
`content_items_kind` check, seeds the project and review slugs, and relaxes the
`kind = 'post'` predicate. Nothing in this repository can do that.

**The rendering rule:** comment bodies and author names are untrusted input
echoed back to every reader. They are only ever written with `textContent` —
never `innerHTML`. `test/comments.test.mjs` fails the build if any
HTML-writing sink appears in `mount.ts`. Do not relax this.

**Abuse controls.** The backend owns all of them: rate limiting, the
visible-comment cap behind the `409`, and the honeypot. The frontend renders a
`website` field that is hidden from sight, hidden from assistive tech
(`aria-hidden`) and skipped by Tab, so only a script fills it. On a honeypot
submission the server answers `204` and stores nothing, and the UI shows the
**same** "Posted." message as a real success — telling a spammer their comment
was discarded is how a honeypot stops working.

**Client-side validation is a courtesy, not a control.** `validateComment()`
mirrors the server's limits so a mistake lands next to the field instead of
coming back as a 400. The server stays authoritative.

**Privacy.** The frontend sets no cookie, stores nothing in `localStorage` for
comments, and sends no identifier. The only data leaving the browser is what
the reader typed. Anything the server records to deduplicate views (IP, a hash,
a window) is the backend's to define and document.

### Views, likes and totals

Three separate things, deliberately in different modules:

| | Where | Behaviour |
|---|---|---|
| Recording a view | `ViewCounter.astro` → `src/lib/views.ts` | `POST /posts/{slug}/view` once per page load after a **5 second dwell**, paused while the tab is hidden, abandoned on `pagehide` |
| Showing totals | `PostStats.astro` → `src/features/post-stats/mount.ts` | `GET /posts/{slug}/stats`, fetched **once** when the row comes into view |
| Liking | same module | `PUT`/`DELETE /posts/{slug}/like` |

**No polling anywhere.** Totals are a fetch-once-on-view number, not a live
counter; a reader who wants a fresh figure reloads.

**Stats are memoised for 60s in `sessionStorage`** (`readCachedStats` /
`writeCachedStats`). Every navigation on this site is a fresh document, so
without it, browsing four posts and returning to the first would re-query
/stats five times for numbers that barely move. A warm visit paints instantly
and makes no request at all.

Deliberately stats-only — a comment thread that omits the comment you just
posted is worse than a re-fetch. The entry is validated on the way back in
(sessionStorage is user-writable) and rewritten after a like, so navigating
away and back never shows the pre-like total. This is a client-side memo only:
the API still sends `Cache-Control: no-store` and `apiRequest` still uses
`cache: "no-store"`, so a request that *is* made is never served from the HTTP
cache. The server deduplicates
views per visitor per rolling window, so a refresh does not inflate anything.

`views.ts` is split from `stats.ts` because the view beacon runs on every post
while the stats row is lazily loaded — sharing a module would drag the stats
code into the beacon's chunk for every reader.

**The like button's state is local memory.** The API exposes aggregate totals
and two idempotent state assertions (`PUT` = "I like this", `DELETE` = "I
don't"), but nothing that answers *does this visitor already like it?* — the
server identifies the visitor itself and the frontend cannot ask. So the
pressed state comes from `localStorage` and can legitimately disagree with the
server: clear storage, or open the post elsewhere, and the button shows
unliked while your like still counts. That is harmless **because the endpoints
assert a state rather than incrementing** — pressing like again sets the same
state. Do not rewrite this as a `POST /like` counter without a per-visitor read.

Likes update optimistically and roll back if the server refuses, and the row
reserves its height so arriving numbers never push the comments down.

**Privacy.** `like:<slug>` in `localStorage` is the only thing the comment and
stats features store, and it never leaves the browser. No cookie is set and no
identifier is sent. Whatever the server uses to deduplicate views and attribute
likes is the backend's to define and document.

## Administrator surface (Cloudflare Access)

### There is no login, anywhere

Not on the frontend, and not on the backend either — the Go API has no login
endpoint, no password, no session, no refresh token, and issues no admin JWT.
Authentication happens entirely at Cloudflare's edge:

1. The whole `site-admin.packetcraft.dev` hostname is a deny-by-default
   Cloudflare Access application.
2. An unauthenticated browser never reaches the origin; Cloudflare serves its
   own identity flow first.
3. Once authenticated, Cloudflare sets a `CF_Authorization` cookie for that
   hostname and injects a signed `Cf-Access-Jwt-Assertion` header into every
   request it forwards.
4. The Go middleware verifies that assertion — RS256 against Cloudflare's
   JWKS, exact issuer, audience, expiry, and the configured administrator
   email — before any moderation handler runs.

**The frontend's entire job is to make a same-origin request and let the
browser attach the cookie it already has.** It never sees, stores, parses or
forwards a token. There is nothing here to steal, and a test asserts no build
ships a password field, a token store, or code that sets the assertion header
itself.

A `401` therefore means *the Access session expired*, not *you are unknown*.
The UI says so and tells you to reload, which re-enters Cloudflare's flow.
Rendering a login form would be inventing a second, weaker authority.

### Same-origin is a hard requirement

**The backend sets no CORS headers of any kind.** A moderation page served
from the public site calling `site-admin.packetcraft.dev` would have every
response blocked by the browser, and the Access cookie would not be sent
cross-site anyway.

So the admin page must be served *from the admin hostname*, behind the same
Access application as the API. That is why the client uses
`credentials: "same-origin"` rather than `"include"`.

### Building it

```bash
ADMIN_UI=1 PUBLIC_API_BASE_URL=/api npm run build
```

Off by default. A public build contains **no** `/admin` route and no
administrator code at all — verified by test, including the orphan-chunk case
below.

> **Why the page lives in `src/admin/`, not `src/pages/admin/`.**
> A `getStaticPaths` returning `[]` suppresses the *route* but still compiles
> the page's `<script>`, which shipped 4.7 KB of moderation code to the public
> origin as an unreferenced but publicly fetchable chunk. The page is injected
> as a route by `astro.config.mjs` only when `ADMIN_UI` is set, so in a public
> build Rollup never sees it. `test/admin-surface.test.mjs` fails if this
> regresses.

`ADMIN_UI` is a build convenience, **not** a security control. It keeps a
useless page off the public site; what protects moderation is Access and the
Go middleware. Hiding a control is never authorization.

### Deployment prerequisite (not yet in place)

The admin hostname currently routes only `/api/admin` to the backend. Serving
the moderation UI needs the GitOps repository to also route
`site-admin.packetcraft.dev` **non-`/api` paths to an `ADMIN_UI=1` build of
this site**, with Cloudflare Access covering the entire hostname. Until then
the page has nowhere to live, and none of this is exercisable end to end.

### Not built, and why

- **FEAT-203 — backend-powered project integrations.** Nothing selected. Each
  integration is approved and built independently; there is no endpoint for one
  yet.
- **Milestone 3 — authenticated authoring.** Deferred by product decision. No
  admin routes, no auth, no content CRUD.
- **A view-count-only display without likes**, or any endpoint returning post
  content — both would cross the content boundary above.

---

## Build & deploy

- `npm run build` → static site in `dist/` (currently 13 pages).
- Any static host works (the project's intended home is the author's k3s
  cluster behind Traefik). No Node server required for the site as it stands.
- `sharp` image optimization is intentionally disabled (`image.service: noop`
  in `astro.config.mjs`) — we manage the sprite frames ourselves.

---

## Known limitations & cleanup backlog

**Figma-export leftovers (safe to delete):**
- `src/styles/globals.css` — empty, not imported.
- `default_shadcn_theme.css` (root) — not referenced.
- `Packetcraft Wireframes.dc.html` (root) — original wireframe artifact.
- `postcss.config.mjs` — empty config; only needed if you add PostCSS plugins.
- `pnpm-workspace.yaml` — single-package "workspace"; only meaningful if you use pnpm.
- `README.md` — was Figma boilerplate; now points here.

**Functional gaps / rough edges:**
- Nav/Footer logo markup is duplicated between the two components.
- `Hatch` placeholders still stand in wherever an entry declares no imagery.
- No content uses fenced code yet, so syntax highlighting is configured and
  tested but not visible on the live site.
- Category and read-time labels are plain text: there are no category archive
  routes to link them to (Milestone 5).
- Footer uptime is gone rather than live; a real value needs the backend
  (FEAT-204).

**Gotchas worth knowing:**
- **The content store is cached outside the project.** Astro persists it to
  `node_modules/.astro/data-store.json`. Deleting or renaming a content file
  can leave a stale entry that makes the build fail with
  `UnknownContentCollectionError`. Clearing `node_modules/.astro` fixes it —
  `rm -rf .astro dist` alone does not.
- **`.env.example` does not exist** despite older references to it; `.gitignore`
  matches `*.env*`, so it could not be committed anyway. Use the environment
  variable table in [Quick start](#quick-start) instead.
- **Custom rehype plugins run before Astro's**, so heading ids do not exist yet
  when they run. `astro.config.mjs` runs Astro's `rehypeHeadingIds` explicitly
  first — see the comment there before adding another plugin.
- **Astro serialises `alt=""` as a bare `alt`.** Tests matching on `alt="` will
  miss decorative images.

## Iteration ideas

- **Tags/categories** — archive routes per category, which would also let the
  category labels on posts become links.
- **Search** — across published posts and projects (Milestone 5).
- **Real browser tests** — the suite is deliberately browser-free. Playwright
  would add genuine focus-order, contrast and screen-reader-adjacent coverage
  that the structural checks cannot reach, at the cost of a large dependency
  and slower CI.
- **Image optimization** — the `noop` image service is still on. Turning it off
  would let Astro emit resized/modern formats via `sharp`, which is already a
  dependency.
- **The Go backend** — implement the `src/lib/api.ts` endpoints as HTMX fragments.

---

## Migration history

Delivered in phases, each a branch merged into `master` with granular commits:

1. **Clean React** — deleted the Figma export's dead deps (~46) and unused
   shadcn `ui/`; split the monolithic `App.tsx` into modules; added a strict `tsconfig`.
2. **Astro alongside React** — Astro became the build/serve layer, initially
   hosting the React app as a single client island.
3. **Static Home/About + routing** — switched to file-based routing; Home and
   About became React-free `.astro`; chrome + dark mode moved into the Layout.
4. **De-island** — Blog, project detail, Projects, and Reviews converted to
   static `.astro`; filters reimplemented as vanilla scripts. Last island removed.
5. **Remove React** — dropped `@astrojs/react`, `react`, `react-dom`, and all
   React components. The site became pure Astro with zero framework JS.
6. **MDX content collections** — content moved into `src/content/` (MDX + JSON)
   behind the `src/lib/content.ts` access layer, with the Go/DB seam scaffolded.
7. **Reviews as writeups** — reviews moved from a single `reviews.json` to one
   MDX file each and gained detail pages at `/reviews/:id`, matching blog and
   projects. Every collection is now MDX.

## Guiding principles

- **Astro first.** If it can be static HTML, it is. This covers ~everything on
  a portfolio/blog.
- **JavaScript is a last resort**, measured in lines not frameworks, and always
  progressively enhanced (content works without it).
- **URLs over client state** — pages/filters live in routes and markup, not a
  client router.
- **Content is files** (MDX/JSON), typed by a schema — no CMS to run.
- **Adopt the backend per-feature**, only when a real server interaction exists.
  Don't build HTMX/Go ahead of need.
- **Delete aggressively.** The cleanest change is often a removal.
