# packetcraft.dev — Developer Documentation

A personal site (blog · reviews · portfolio · project showcase) built to ship
**as little client-side JavaScript as possible**.

- **Framework:** [Astro](https://astro.build) 7 (static output)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`) + CSS custom properties
- **Content:** Astro content collections — one MDX file per entry (frontmatter + prose)
- **Client JS:** none from a framework. A few hundred bytes of hand-written
  vanilla script per page (theme toggle, list filters, nav mascot, copy-code),
  all progressive enhancement.
- **Backend:** none today. A Go + database backend can be added later through a
  deliberate seam (see [Backend seam](#backend-seam-go--db)).

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
| `PUBLIC_SITE_ORIGIN` | `https://packetcraft.dev` | Origin used for canonical tags, the RSS feed and the sitemap. Validated during build: must be a bare `https` origin (or `localhost`) with no path. |
| `PUBLIC_API_BASE_URL` | `/api` in the container, unset locally | Base for the future Go backend. See [Backend seam](#backend-seam-go--db). |

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

One command, three suites, all asserting on the real `dist/` output:

| Suite | Covers |
|---|---|
| `test/build-output.test.mjs` | Routes emitted, drafts withheld, internal links, external `rel` safety, RSS/sitemap/canonical agreement, social cards, image dimensions, archive paging, heading anchors, print rules, theme persistence, filter/data agreement |
| `test/accessibility.test.mjs` | Heading structure, landmarks, skip link, unique ids, accessible names, colour-independence, control state, zoom — see [Accessibility](#accessibility) |
| `test/served-site.test.mjs` | HTTP behaviour: clean URLs, 404s, MIME types, cache policy |

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
│   │   └── api.ts              # ★ Go backend seam (not wired) + PUBLIC_API_BASE_URL
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
  the `codeSnippet` frontmatter as a `TerminalSnippet`. The "demo" box is a
  placeholder ([backend seam](#backend-seam-go--db) candidate).
- **`reviews/index.astro`** — List from `getReviews()`, same filter pattern as
  projects but keyed on `data-type` (hardware/software). Cards link to
  `/reviews/:id`.
- **`reviews/[id].astro`** — One page per review. Renders the MDX body next to a
  sidebar with the verdict badge and meta (type, date).

### Layout (`src/layouts/Layout.astro`)
The single HTML shell. Props: `title`, `description`. Responsibilities:
- `<head>` metadata + global `html,body` reset.
- **No-flash dark-mode init**: an `is:inline` script that adds `.dark` to
  `<html>` from `localStorage`/`prefers-color-scheme` *before paint*.
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
   nothing.
6. **Narrow and wide.** At 320px and at 1440px, no page may scroll sideways.
7. **Reduced motion.** With the OS "reduce motion" setting on, the nav mascot
   must be parked and nothing should animate.
8. **Zoom.** At 200% browser zoom the layout must stay usable.

### Known deviation

`FEATURES.md` FEAT-107 asks that the theme respect system preferences. It
deliberately does not: light is the default for first-time visitors regardless
of OS setting, and `test/build-output.test.mjs` asserts that no
`prefers-color-scheme` fallback comes back. That was an explicit product
decision (see the commit that made light the default), so it was left alone.
Reverse it only on purpose, and update that test with it.

`prefers-reduced-motion` **is** honoured, both site-wide in
`src/styles/theme.css` and specifically for the nav mascot.

## Backend seam (Go + DB)

The site is fully static and needs no backend. The hooks for adding one later:

- **`src/lib/api.ts`** — `API_BASE` (from `PUBLIC_API_BASE_URL`) and
  `apiConfigured()`. Documents the intended pattern and a commented example.
- **`.env`** — set `PUBLIC_API_BASE_URL` to enable. There is no committed
  `.env.example`: `.gitignore` matches `*.env*`. See the environment variable
  table in [Quick start](#quick-start).
- **UI markers** — `{/* gap: ... */}` comments mark the spots meant to become
  dynamic: blog view counts/comments, project demo/status. Footer uptime is
  one of these too — the fabricated "uptime 99.4% · build #1284" string was
  removed and replaced with a real build date, so there is nothing misleading
  sitting there while the backend does not exist.

**Intended pattern: HTMX.** Go returns HTML *fragments*, swapped into the page —
so most dynamic features stay serverside with little/no client JS, consistent
with the rest of the site. Example flow:

```html
<span hx-get="/api/uptime" hx-trigger="load, every 60s">uptime …</span>
```
```go
// Go returns the fragment text, not JSON
func uptime(w http.ResponseWriter, r *http.Request) { w.Write([]byte(liveUptime())) }
```

**Suggested first step:** move the reviews collection (the most row-like
frontmatter) behind a Go+Postgres endpoint, and change only `getReviews()` /
`getReview()` in `src/lib/content.ts` to fetch it. That proves the seam
end-to-end.

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
