// Turns a pixel-art PNG into a palette + RLE sprite that PixelArt.astro can
// render as plain SVG. Run it by hand when the source art changes:
//
//   node scripts/pixelize.mjs [source.png] [out.json] [cols]
//
// The default source is already upscaled pixel art (each art pixel is a 7x7
// block), so downscaling with nearest-neighbour sampling recovers the grid
// instead of inventing new colours the way a smoothing resize would.

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SRC = process.argv[2] ?? "src/img/sprites/ruri_transparent.png";
const OUT = process.argv[3] ?? "src/data/ruri-pixels.json";
const COLS = Number(process.argv[4] ?? 101);

// The source carries an artist watermark in the top-left corner. It is a
// single flat colour that appears nowhere else, so clearing that exact colour
// inside the corner removes it without touching the artwork.
const WATERMARK = [241, 184, 70];
const WATERMARK_BOX = { w: 300, h: 80 };

const image = sharp(SRC).ensureAlpha();
const { width, height } = await image.metadata();
const px = await image.raw().toBuffer();

let cleared = 0;
for (let y = 0; y < Math.min(WATERMARK_BOX.h, height); y++) {
  for (let x = 0; x < Math.min(WATERMARK_BOX.w, width); x++) {
    const i = (y * width + x) * 4;
    if (
      px[i] === WATERMARK[0] &&
      px[i + 1] === WATERMARK[1] &&
      px[i + 2] === WATERMARK[2]
    ) {
      px[i + 3] = 0;
      cleared++;
    }
  }
}

const rows = Math.round((COLS * height) / width);

// Nearest-neighbour downscale: sample the centre of each destination cell.
// Channels snap to multiples of 8 so near-identical shades collapse into one
// palette entry. Index 0 is reserved for transparent.
const snap = (v) => Math.round(v / 8) * 8;
const palette = ["transparent"];
const paletteIndex = new Map();
const cells = [];

for (let y = 0; y < rows; y++) {
  const sy = Math.min(height - 1, Math.floor((y + 0.5) * (height / rows)));
  for (let x = 0; x < COLS; x++) {
    const sx = Math.min(width - 1, Math.floor((x + 0.5) * (width / COLS)));
    const i = (sy * width + sx) * 4;
    if (px[i + 3] < 100) {
      cells.push(0);
      continue;
    }
    const key = `${snap(px[i])},${snap(px[i + 1])},${snap(px[i + 2])}`;
    let index = paletteIndex.get(key);
    if (index === undefined) {
      index = palette.length;
      palette.push(`rgb(${key})`);
      paletteIndex.set(key, index);
    }
    cells.push(index);
  }
}

// Run-length encode as flat [colourIndex, runLength, ...] pairs.
const rle = [];
for (let i = 0; i < cells.length; ) {
  const value = cells[i];
  let run = 1;
  while (i + run < cells.length && cells[i + run] === value) run++;
  rle.push(value, run);
  i += run;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ w: COLS, h: rows, pal: palette, rle }));

console.log(`source      ${width}x${height}  (${SRC})`);
console.log(`watermark   ${cleared} px cleared`);
console.log(`grid        ${COLS}x${rows}  (${COLS * rows} cells)`);
console.log(`palette     ${palette.length} entries`);
console.log(`runs        ${rle.length / 2}`);
console.log(`wrote       ${OUT}`);
