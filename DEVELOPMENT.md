# packetcraft.dev — Developer Documentation

A personal site (blog · reviews · portfolio · project showcase) built to ship
**as little client-side JavaScript as possible**.

- **Framework:** [Astro](https://astro.build) 7 (static output)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`) + CSS custom properties
- **Content:** Astro content collections — MDX for prose, JSON for structured data
- **Client JS:** none from a framework. The only JS is a few hundred bytes of
  hand-written vanilla script, inlined per page (dark-mode toggle, sprite
  animation, list filters).
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
```

Node 18+ recommended. There is no test suite yet (see [Iteration ideas](#iteration-ideas)).

---

## Rendering model (read this first)

Everything is **statically rendered at build time** to plain HTML. There are
**no Astro islands** and **no framework runtime** shipped to the browser —
`dist/_astro/` contains only CSS and the sprite PNGs, no JS bundles.

Interactivity is achieved with small `<script>` blocks that Astro inlines into
the page HTML:

| Feature | Where | What it does |
|---|---|---|
| Dark-mode toggle + no-flash init | `src/layouts/Layout.astro` | Toggles `.dark` on `<html>`, persists to `localStorage`; an inline head script applies the saved theme before first paint |
| Walking sprite loader | `src/components/astro/Sprite.astro` | Cycles 25 PNG frames via `setInterval` |
| Projects / Reviews filters | `src/pages/projects/index.astro`, `src/pages/reviews.astro` | Show/hide cards by toggling the `hidden` class |

That's the complete client-side JS inventory. If you find yourself reaching for
a framework or a heavy dependency, re-read [Guiding principles](#guiding-principles).

---

## Directory structure

```
portfolio-site/
├── astro.config.mjs          # Astro config: MDX + Tailwind vite plugin, @ alias, noop image service
├── tsconfig.json             # extends astro/tsconfigs/strict; @/* path alias
├── package.json              # astro + @astrojs/mdx (deps); tailwind, typescript, checks (dev)
├── src/
│   ├── pages/                # ROUTES (file-based). Each .astro file = one URL.
│   │   ├── index.astro       #   /            Home (static, curated feed)
│   │   ├── about.astro       #   /about       About (static)
│   │   ├── blog.astro        #   /blog        Blog index (from collection)
│   │   ├── blog/[slug].astro #   /blog/:slug  Blog post (renders MDX body)
│   │   ├── reviews.astro     #   /reviews     Reviews (from collection, filterable)
│   │   └── projects/
│   │       ├── index.astro   #   /projects    Projects grid (filterable)
│   │       └── [id].astro    #   /projects/:id Project detail (renders MDX body)
│   ├── layouts/
│   │   └── Layout.astro       # HTML shell: <head>, Nav, <slot/>, Footer, dark-mode scripts
│   ├── components/astro/      # Presentational .astro components (no client JS unless noted)
│   │   ├── Nav.astro          #   Sticky header: logo, nav links (active by URL), theme toggle button
│   │   ├── Footer.astro       #   Footer: links, "slot" placeholder, uptime line (hardcoded)
│   │   ├── Cursor.astro        #   Blinking terminal cursor
│   │   ├── Hatch.astro        #   Hatched placeholder box (stands in for images)
│   │   ├── Tag.astro          #   Small pill/tag (accepts a slot)
│   │   ├── StatusBadge.astro  #   Project status pill (SHIPPED/BUILDING/PLANNED)
│   │   ├── VerdictBadge.astro #   Review verdict pill (RECOMMENDED/MIXED/PASS)
│   │   ├── TerminalSnippet.astro # Renders a code string as terminal lines
│   │   └── Sprite.astro       #   ⚠ has inline JS: cycles walk-cycle frames
│   ├── content/               # CONTENT (the data)
│   │   ├── blog/*.mdx          #   Blog posts: frontmatter + prose body
│   │   ├── projects/*.mdx      #   Project writeups: frontmatter + prose body
│   │   └── reviews.json        #   Reviews: structured records (most DB-like)
│   ├── content.config.ts       # Collection definitions + zod schemas
│   ├── lib/
│   │   ├── content.ts          # ★ Content access layer — the seam to a future backend
│   │   └── api.ts              # ★ Go backend seam (not wired) + PUBLIC_API_BASE_URL
│   ├── styles/
│   │   ├── index.css           # Entry: imports the four below
│   │   ├── fonts.css           # Space Mono @import + @keyframes blink / scan
│   │   ├── tailwind.css        # Tailwind import + @source content globs  ⚠ see gotcha
│   │   ├── theme.css           # CSS variables (light + .dark), Tailwind @theme mapping
│   │   ├── content.css          # .mdx-content styles for rendered MDX bodies
│   │   └── globals.css          # empty, unused (Figma leftover — removable)
│   ├── img/                    # Sprite art (darjeeling.png + 25 walk frames)
│   └── vite-env.d.ts           # vite/client types (import.meta.glob)
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
- **`reviews.astro`** — List from `getReviews()`, same filter pattern as
  projects but keyed on `data-type` (hardware/software).

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

Note: these `.astro` primitives were ported from the original React components.
They are the source of truth now; the React versions were deleted.

### Content layer (`src/lib/content.ts`) ★
Every page reads content **through this module**, never by calling
`getCollection` directly:

```ts
getProjects()            // sorted by frontmatter `order`
getProject(id)
getBlogPosts()           // sorted by date desc
getBlogPost(id)
getReviews()             // sorted by date desc
```

This indirection is the whole point: when a backend arrives, you change the
*bodies* of these functions to fetch from Go and **nothing else changes** —
pages, schemas, and call sites stay identical.

### Content definitions (`src/content.config.ts`)
Three collections with zod schemas:
- `blog` — `glob()` loader over `src/content/blog/*.mdx`
- `projects` — `glob()` loader over `src/content/projects/*.mdx`
- `reviews` — `file()` loader over `src/content/reviews.json`

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
date: "2026-07-01"        # string; drives sort order (desc)
readTime: "6 min"
category: "homelab"
excerpt: "One-line summary shown in the list."
featured: false           # at most one true → becomes the hero card
---

Markdown / MDX body. Renders on the detail page inside `.mdx-content`.

## A heading
Prose, `inline code`, lists, etc.
```

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
---

The writeup body (rendered on the detail page).
```

### Add a review
Append an object to `src/content/reviews.json` (`id` must be unique):

```json
{ "id": "thing-slug", "type": "HARDWARE", "verdict": "RECOMMENDED",
  "name": "Product name", "date": "2026-07-01", "excerpt": "One-liner." }
```
`type` ∈ HARDWARE|SOFTWARE, `verdict` ∈ RECOMMENDED|MIXED|PASS.

---

## Styling & theming

- **Tailwind v4** via `@tailwindcss/vite` (no `tailwind.config.js`).
- **Theme tokens** live in `src/styles/theme.css` as CSS custom properties for
  light and `.dark`, mapped to Tailwind color utilities via `@theme`. Change a
  brand color there and it propagates everywhere.
- **Dark mode** is a `.dark` class on `<html>` (see Layout). The custom variant
  `@custom-variant dark (&:is(.dark *))` in `theme.css` powers `dark:` utilities.
- **Fonts / keyframes** in `src/styles/fonts.css` (Space Mono + `blink`/`scan`).
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

## Backend seam (Go + DB)

The site is fully static and needs no backend. The hooks for adding one later:

- **`src/lib/api.ts`** — `API_BASE` (from `PUBLIC_API_BASE_URL`) and
  `apiConfigured()`. Documents the intended pattern and a commented example.
- **`.env.example`** — copy to `.env` and set `PUBLIC_API_BASE_URL` to enable.
- **UI markers** — `{/* gap: ... */}` comments mark the spots meant to become
  dynamic: footer uptime/build number, blog view counts/comments, project
  demo/status.

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

**Suggested first step:** move `reviews.json` (already the most row-like data)
behind a Go+Postgres endpoint, and change only `getReviews()` in
`src/lib/content.ts` to fetch it. That proves the seam end-to-end.

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
- Blog pagination buttons are decorative (no real paging).
- Home "featured" and "recent" feeds are hardcoded, not derived from collections.
- Footer `uptime … · build #…` is a hardcoded string.
- Nav/Footer logo markup is duplicated between the two components.
- External links (`github ↗`, `email ↗`, `rss ↗`) are placeholder text, not real `href`s.
- Placeholder `Hatch` boxes stand in for all imagery; no real images/OG tags yet.
- `date` fields are plain strings (sortable but not validated as dates).

## Iteration ideas

- **Wire real content into Home** — pull latest posts/featured from the
  collections so the landing page updates itself.
- **RSS + sitemap** — `@astrojs/rss` and `@astrojs/sitemap` are natural, low-JS additions for a blog.
- **Real images** — replace `Hatch` placeholders; reconsider the `noop` image
  service if you want Astro's `<Image>` optimization (adds `sharp`).
- **Reading niceties** — heading anchor links, a table of contents, code-block
  syntax highlighting (Astro/Shiki is built in for fenced code).
- **Tags/categories** — index pages per category using collection queries.
- **Tests** — a couple of Playwright smoke tests (routes return 200, filters
  hide/show, dark toggle persists) would lock in the "zero-JS-but-still-works" guarantee.
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
