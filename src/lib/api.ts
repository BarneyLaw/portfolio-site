// ── Go backend integration seam (not yet wired) ──────────────────────────
// The site is fully static and needs no backend. When a Go API + database
// land, *dynamic* reads/writes route through here, while static content stays
// in content collections (see src/lib/content.ts). Set PUBLIC_API_BASE_URL to
// enable. The intended pattern is HTMX: Go returns HTML fragments that get
// swapped into the page, so most of these stay server-side with no client JS.
//
// Candidate dynamic features (each a future Go endpoint / HTMX fragment):
//   - live cluster uptime + build number in the footer (currently hardcoded)
//   - per-post view counts and comments on blog detail pages
//   - the contact form
//   - live project "demo"/status on project detail pages
//
// Example, left commented until the backend exists:
//
//   export async function getLiveUptime(): Promise<string | null> {
//     if (!apiConfigured()) return null;
//     const res = await fetch(`${API_BASE}/api/uptime`);
//     return res.ok ? await res.text() : null;
//   }

export const API_BASE = import.meta.env.PUBLIC_API_BASE_URL ?? "";

/** Whether a Go backend is configured. Pages fall back to static content when false. */
export function apiConfigured(): boolean {
  return API_BASE.length > 0;
}
