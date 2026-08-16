// ── Site identity and destinations ───────────────────────────────────────
// One place for everything that says "who this site is" or "where a link
// goes". Nav, Footer, About and the page metadata all read from here, so a
// changed handle or a new profile is a one-line edit rather than a grep.
//
// Rules of the road:
//   - Internal hrefs are absolute-from-root, no trailing slash ("/blog", not
//     "blog/" or "/blog/"). The nginx `try_files` rule and the build-output
//     link test both assume that shape.
//   - Anything starting with http(s):// is external and must go through
//     externalLinkAttrs() so it cannot reach back through window.opener.
//   - Nothing here is a secret. This module is compiled into public HTML.

/** Production origin, no trailing slash — the base for canonical tags, the RSS
    feed and the sitemap. Owned and validated by `site` in astro.config.mjs
    (override with PUBLIC_SITE_ORIGIN); Astro injects it here, so there is
    exactly one definition and nothing to keep in sync. */
export const SITE_ORIGIN: string = import.meta.env.SITE;

export const SITE = {
  /** Wordmark / feed title. */
  name: "packetcraft",
  /** Shown as the bare domain in the footer lockup. */
  domain: "site.packetcraft.dev",
  author: "Leifsen",
  /** Default <meta name="description">, and the feed description. */
  description:
    "tinkerer documenting homelab builds, networking experiments, and gaming-adjacent projects.",
} as const;

/** Public contact address. Deliberate product choice: this is a work-only
    address, not a personal one, so publishing it in plain HTML is acceptable.
    Swap to a contact form only if a backend ever makes that worthwhile. */
export const CONTACT_EMAIL = "leifsen.work@gmail.com";

/** RSS feed of published blog posts, emitted by src/pages/rss.xml.ts. */
export const FEED_PATH = "/rss.xml";

/**
 * Site-wide social card, used by any page that has no image of its own.
 * Regenerate with `node scripts/make-og-card.mjs`.
 *
 * It lives in public/ rather than src/img/ so its URL stays stable: a
 * fingerprinted path would change on every rebuild and invalidate the card on
 * every link already shared. Being un-fingerprinted, it must also stay
 * revalidatable — nginx only marks /_astro/ immutable, so this is fine.
 *
 * 1200x630 is the Open Graph reference size.
 */
export const DEFAULT_SOCIAL_IMAGE: { src: string; width: number; height: number } = {
  src: "/og-default.png",
  width: 1200,
  height: 630,
};

export interface SiteLink {
  label: string;
  href: string;
}

/** Primary navigation. Nav renders these in order and marks the active one. */
export const NAV_LINKS: readonly SiteLink[] = [
  { label: "Projects", href: "/projects" },
  { label: "Blogs", href: "/blog" },
  { label: "Reviews", href: "/reviews" },
  { label: "About", href: "/about" },
] as const;

/** Footer "/site" column — the nav plus Home. */
export const FOOTER_SITE_LINKS: readonly SiteLink[] = [
  { label: "Home", href: "/" },
  ...NAV_LINKS,
] as const;

/** Off-site profiles. Verified to resolve; keep it that way — no external
    link checker runs in CI, so these are checked by hand when edited. */
export const ELSEWHERE_LINKS: readonly SiteLink[] = [
  { label: "github", href: "https://github.com/BarneyLaw" },
  { label: "linkedin", href: "https://www.linkedin.com/in/leifsenlaw/" },
  { label: "email", href: `mailto:${CONTACT_EMAIL}` },
  { label: "rss", href: FEED_PATH },
] as const;

/** True for links that leave the site in a new browsing context. `mailto:`
    is not included: it hands off to a mail client rather than opening a tab. */
export function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * Attributes for any href that might leave the site. External links open in a
 * new context, and `rel="noopener noreferrer"` keeps the opened page from
 * reaching back via `window.opener` or reading the referrer.
 *
 * Spread it: `<a href={href} {...externalLinkAttrs(href)}>`.
 */
export function externalLinkAttrs(
  href: string,
): { target: "_blank"; rel: string } | Record<string, never> {
  return isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

/** Absolute URL for a site-relative path — canonical tags, feeds, OG tags. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}
