// Automated accessibility checks over the built HTML.
//
// These are structural checks — the class of problem that is decidable from
// markup alone: heading order, landmarks, labels, link text, form/control
// naming, duplicate ids. They run on the real production output with no
// browser and no new dependency.
//
// What they deliberately do NOT cover, and what the manual checklist in
// DEVELOPMENT.md exists for: colour contrast, focus order and visibility as
// actually painted, screen-reader announcement, and anything that only exists
// after the enhancement scripts run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

if (!existsSync(dist)) {
  throw new Error(`No dist/ at ${dist} — run \`npm run build\` before \`npm test\`.`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));
const routeOf = (file) =>
  "/" +
  file
    .slice(dist.length + 1)
    .split(/[\\/]/)
    .join("/")
    .replace(/(^|\/)index\.html$/, "")
    .replace(/\.html$/, "");

/** Strip tags to get the text a user would read. */
const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const eachPage = (fn) => {
  for (const file of htmlFiles) fn(readFileSync(file, "utf8"), routeOf(file));
};

test("every page has exactly one h1", () => {
  eachPage((html, route) => {
    const count = (html.match(/<h1[\s>]/g) ?? []).length;
    assert.equal(count, 1, `${route} has ${count} <h1> elements, expected exactly 1`);
  });
});

test("heading levels are never skipped", () => {
  eachPage((html, route) => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    let previous = 0;
    for (const level of levels) {
      if (previous !== 0) {
        assert.ok(
          level <= previous + 1,
          `${route} jumps from h${previous} to h${level}; screen-reader users navigate by these`,
        );
      }
      previous = level;
    }
  });
});

test("every page declares a language and the standard landmarks", () => {
  eachPage((html, route) => {
    assert.match(html, /<html[^>]+lang="[a-z]{2}/, `${route} has no lang on <html>`);
    for (const [name, pattern] of [
      ["banner (<header>)", /<header[\s>]/],
      ["main", /<main[\s>]/],
      ["contentinfo (<footer>)", /<footer[\s>]/],
      ["navigation", /<nav[\s>]/],
    ]) {
      assert.match(html, pattern, `${route} is missing the ${name} landmark`);
    }
  });
});

test("every page offers a skip link to the main content", () => {
  eachPage((html, route) => {
    const target = html.match(/<a[^>]+href="#([^"]+)"[^>]*>\s*Skip to content/)?.[1];
    assert.ok(target, `${route} has no skip link`);
    assert.match(
      html,
      new RegExp(`id="${target}"`),
      `${route} skip link points at #${target}, which does not exist`,
    );
  });
});

test("ids are unique", () => {
  eachPage((html, route) => {
    const seen = new Set();
    for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
      assert.ok(!seen.has(id), `${route} reuses id="${id}"; ids must be unique`);
      seen.add(id);
    }
  });
});

test("every interactive control has an accessible name", () => {
  eachPage((html, route) => {
    for (const [tag, attrs, inner] of html.matchAll(/<(button|a)\s([^>]*)>([\s\S]*?)<\/\1>/g)) {
      if (/\saria-hidden="true"/.test(attrs)) continue;
      const named =
        /\saria-label="[^"]+"/.test(attrs) ||
        /\saria-labelledby="[^"]+"/.test(attrs) ||
        /\stitle="[^"]+"/.test(attrs) ||
        textOf(inner).length > 0 ||
        // An image-only control is named by its alt text.
        /<img[^>]+alt="[^"]+"/.test(inner) ||
        /<(svg|img)[^>]*>/.test(inner);
      assert.ok(named, `${route}: <${tag}> has no accessible name — ${attrs.slice(0, 80)}`);
    }
  });
});

test("links do not rely on ambiguous text", () => {
  const vague = new Set(["click here", "here", "read more", "more", "link", "this"]);
  eachPage((html, route) => {
    for (const [, attrs, inner] of html.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/g)) {
      if (/\saria-label="[^"]+"/.test(attrs)) continue;
      const text = textOf(inner).toLowerCase();
      assert.ok(
        !vague.has(text),
        `${route}: link text "${text}" makes no sense out of context`,
      );
    }
  });
});

test("status and verdict are carried by text, not colour alone", () => {
  // A badge whose only signal is its background colour is invisible to anyone
  // who cannot distinguish it. Each badge must spell its value out.
  const statuses = ["SHIPPED", "BUILDING", "PLANNED"];
  const verdicts = ["RECOMMENDED", "MIXED", "PASS"];

  const projects = readFileSync(join(dist, "projects", "index.html"), "utf8");
  const reviews = readFileSync(join(dist, "reviews", "index.html"), "utf8");

  assert.ok(
    statuses.some((s) => projects.includes(s)),
    "/projects shows no status label in text",
  );
  assert.ok(
    verdicts.some((v) => reviews.includes(v)),
    "/reviews shows no verdict label in text",
  );
});

test("toggles expose their state", () => {
  eachPage((html, route) => {
    const toggle = html.match(/<button[^>]*id="theme-toggle"[^>]*>/)?.[0];
    assert.ok(toggle, `${route} has no theme toggle`);
    assert.match(toggle, /aria-pressed="(true|false)"/, `${route} theme toggle has no state`);
    assert.match(toggle, /aria-label="[^"]+"/, `${route} theme toggle has no label`);
  });
});

test("filter controls expose their pressed state", () => {
  for (const page of ["projects", "reviews"]) {
    const html = readFileSync(join(dist, page, "index.html"), "utf8");
    const group = html.match(/<div[^>]*role="group"[^>]*>[\s\S]*?<\/div>/)?.[0];
    assert.ok(group, `/${page} filters are not a labelled group`);
    assert.match(group, /aria-label="[^"]+"/, `/${page} filter group has no label`);

    const buttons = [...group.matchAll(/<button\s([^>]*)>/g)];
    assert.ok(buttons.length > 0, `/${page} has no filter buttons`);
    for (const [, attrs] of buttons) {
      assert.match(attrs, /aria-pressed="(true|false)"/, `/${page} filter button has no state`);
    }
  }
});

test("no viewport meta prevents zooming", () => {
  eachPage((html, route) => {
    const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1];
    assert.ok(viewport, `${route} has no viewport meta`);
    assert.doesNotMatch(viewport, /user-scalable\s*=\s*no/, `${route} blocks pinch zoom`);
    const max = viewport.match(/maximum-scale\s*=\s*([\d.]+)/)?.[1];
    assert.ok(!max || Number(max) >= 2, `${route} caps zoom at ${max}x`);
  });
});
