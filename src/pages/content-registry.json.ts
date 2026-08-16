import { execSync } from "node:child_process";

// Imported rather than read from disk: `import.meta.url` in the built
// prerender chunk points at dist/.prerender/chunks/, not at this source file,
// so a relative readFileSync resolves to the wrong place. The import inlines
// the schema at build time and cannot drift from the vendored copy.
import schemaJson from "../../schema/content-registry.schema.json";

import { buildManifest, resolveRevision } from "../lib/registry";
import type { JsonSchema } from "../lib/json-schema";

// Emits dist/content-registry.json — the complete content snapshot the Go
// backend synchronises into `content_items`. CI copies it into the GitOps
// repository, where a Kustomize ConfigMap feeds it to the sync Job.
//
// Generated as a prerendered endpoint (the approach the backend contract
// suggests) so it runs inside Astro's content environment and reads the same
// loaded collections the pages do. Deriving it any other way — re-parsing MDX,
// or crawling built HTML — would risk disagreeing with what the site published.
//
// It is a normal public file. That is fine: it contains slugs, publication
// state and a comment flag, all of which are already visible on the site.
//
// This endpoint deliberately has the power to fail the build. See the warning
// at the top of src/lib/registry.ts: an incomplete snapshot archives content.

const schema = schemaJson as JsonSchema;

/**
 * The commit id for this manifest.
 *
 * CI sets GITHUB_SHA. Locally there is usually no such variable, so fall back
 * to asking git — a local build should not need ceremony. If every source
 * fails, buildManifest throws: a registry nobody can trace back to a commit is
 * worse than a failed build.
 */
function revision(): string {
  const fromEnv = resolveRevision(process.env);
  if (fromEnv) return fromEnv;

  try {
    // Build-time only, in Node, on the developer's own checkout.
    const head = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return resolveRevision({ CONTENT_REVISION: head });
  } catch {
    return "";
  }
}

export async function GET(): Promise<Response> {
  const manifest = await buildManifest({
    revision: revision(),
    schema,
  });

  // Trailing newline so the file is a well-formed text file in Git, and
  // two-space indentation so a content change is a readable diff rather than
  // one enormous line.
  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
