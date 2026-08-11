import type { APIContext } from "astro";

import { absoluteUrl, FEED_PATH } from "../lib/site";

// robots.txt, generated so the sitemap URL stays tied to the configured
// origin rather than being hardcoded in a static file.
//
// The /admin disallow is a courtesy to well-behaved crawlers and nothing
// more. The administrator surface is normally absent from the build entirely,
// and where it does exist it sits behind a deny-by-default Cloudflare Access
// application — a robots rule has never stopped anyone who was not going to
// stop anyway.

export function GET(context: APIContext): Response {
  const sitemap = context.site
    ? new URL("/sitemap-index.xml", context.site).href
    : absoluteUrl("/sitemap-index.xml");

  const body = [
    "User-agent: *",
    "Disallow: /admin",
    "Allow: /",
    "",
    `Sitemap: ${sitemap}`,
    `# Feed: ${absoluteUrl(FEED_PATH)}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
