# packetcraft.dev

Personal site: blogs · reviews · portfolio · project showcase 
minimal dependencies

**Stack:** Astro (static) · Tailwind CSS v4 · MDX/JSON content collections.
No framework runtime is shipped to the browser.

## Quick start

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output to ./dist
npm run preview    # serve ./dist
npm run check      # type-check + validate content
npm test           # smoke + accessibility tests (run a build first)
```

Full gate, same as CI:

```bash
npm run check && npm run build && npm test
```

## Documentation

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the full developer guide:
architecture, a component-by-component reference, how to author content, the
styling/theming model, the accessibility checklist, the Go+DB backend seam, and
the cleanup/iteration backlog.

Two things worth knowing before your first change:

- **Publication rules live in [`src/lib/content.ts`](./src/lib/content.ts)** —
  drafts, future dates, ordering, and how the featured post is picked.
- **Site identity and every link live in [`src/lib/site.ts`](./src/lib/site.ts)** —
  origin, nav, footer, profiles, contact address.
