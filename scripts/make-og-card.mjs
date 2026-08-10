// Generates the default social-share card at public/og-default.png.
//
//   node scripts/make-og-card.mjs
//
// Run by hand and commit the result — same convention as scripts/pixelize.mjs.
// It is not part of `npm run build`, so the site build stays free of image
// generation and the committed PNG is the reproducible artifact.
//
// 1200x630 is the size Open Graph consumers crop from; anything smaller gets
// upscaled by the scraper. Colours are lifted from the dark theme in
// src/styles/theme.css so the card matches the site it links to.

import sharp from "sharp";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/og-default.png", import.meta.url));

const W = 1200;
const H = 630;

const BG = "#12151f"; // --background (dark)
const FG = "#f0eada"; // --foreground (dark)
const PRIMARY = "#3b82f6"; // --primary (dark)
const MUTED = "#6e7588"; // --muted-foreground (dark)

// font-family="monospace" resolves through the rasteriser's default font, so
// the exact face depends on the machine that ran this script. That is fine for
// a one-off committed asset; it is the reason this is not generated in CI.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="12" height="${H}" fill="${PRIMARY}"/>
  <text x="88" y="300" font-family="monospace" font-size="96" font-weight="bold" fill="${PRIMARY}">&gt;</text>
  <text x="160" y="300" font-family="monospace" font-size="96" font-weight="bold" fill="${FG}">packetcraft</text>
  <!-- Terminal cursor, parked on the wordmark's baseline just after the "t". -->
  <rect x="800" y="242" width="30" height="62" fill="${PRIMARY}"/>
  <text x="88" y="430" font-family="monospace" font-size="34" fill="${PRIMARY}">networks · graphics · gaming · systems</text>
  <text x="88" y="530" font-family="monospace" font-size="28" fill="${MUTED}">packetcraft.dev · served by k3s @ home</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);

const { width, height, size } = await sharp(OUT).metadata();
console.log(`wrote ${OUT} — ${width}x${height}, ${(size / 1024).toFixed(1)} kB`);
