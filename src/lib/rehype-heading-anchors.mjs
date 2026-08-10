// Turns each MDX heading into a link to its own id, so a reader can grab a
// permalink to a section with the keyboard as well as the mouse.
//
// Written locally rather than pulling in rehype-slug + rehype-autolink-headings:
// Astro already generates the heading ids (github-slugger, built in), so all
// that is left is wrapping the children in an <a>. That is a dozen lines of
// plain object walking, which the dependency policy prefers over two packages.
//
// Input:   <h2 id="the-case">The case</h2>
// Output:  <h2 id="the-case"><a class="heading-anchor" href="#the-case">The case</a></h2>
//
// The link wraps the heading text rather than sitting beside it as a "¶", so
// there is no extra tab stop and no icon that screen readers have to skip.
// The visible marker is added by CSS in src/styles/content.css.

const HEADINGS = new Set(["h2", "h3", "h4", "h5", "h6"]);

/** Depth-first walk over a hast tree, applying `fn` to every element node. */
function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (node.type === "element") fn(node);
  for (const child of node.children ?? []) walk(child, fn);
}

export function rehypeHeadingAnchors() {
  return (tree) => {
    walk(tree, (node) => {
      const id = node.properties?.id;
      // No id means Astro did not slug it (e.g. a heading built from an
      // expression); leave it alone rather than inventing a broken target.
      if (!HEADINGS.has(node.tagName) || !id) return;
      // Idempotent: never double-wrap if the pipeline runs twice.
      if (node.children?.length === 1 && node.children[0].tagName === "a") return;

      node.children = [
        {
          type: "element",
          tagName: "a",
          properties: { className: ["heading-anchor"], href: `#${id}` },
          children: node.children,
        },
      ];
    });
  };
}

export default rehypeHeadingAnchors;
