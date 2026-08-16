/**
 * Rasterise the app mark into the PNGs the manifest promises.
 *
 * `src/app/manifest.ts` has always referenced icon-192.png, icon-512.png and
 * icon-maskable-512.png, but only SVGs existed in `public/`. Android's install
 * prompt and the Bubblewrap/TWA packaging path both read those PNG entries, so
 * the install icon fell back to a default.
 *
 * Kept as a script rather than committed binaries with no provenance: when the
 * mark changes, this regenerates every size from the one source of truth.
 *
 * Run with: npm run icons
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SOURCE = path.join(PUBLIC_DIR, "icon.svg");

/**
 * Build the maskable variant.
 *
 * A maskable icon is cropped to whatever shape the launcher likes — circle,
 * squircle, rounded square — so two things have to change from the normal mark:
 *
 *  1. The background must bleed to the edges. The source has `rx="114"`, and a
 *     rounded tile inside a circular mask shows the corners cut twice.
 *  2. The artwork must sit inside the safe zone, the centre 80% of the canvas.
 *     The source line runs from x=80 to x=424 and would lose its arrowhead in a
 *     circular crop.
 */
function toMaskable(svg: string): string {
  const squared = svg.replace(
    /<rect width="512" height="512" rx="114"/,
    '<rect width="512" height="512"',
  );

  // Scale the drawn content to 80% about the centre, leaving the tile full-bleed.
  const openIndex = squared.indexOf('<g fill="#fff" opacity=".17">');
  const closeIndex = squared.lastIndexOf("</svg>");
  const content = squared.slice(openIndex, closeIndex);

  return (
    squared.slice(0, openIndex) +
    `<g transform="translate(51.2 51.2) scale(0.8)">${content}</g>` +
    "</svg>"
  );
}

async function main() {
  const svg = await readFile(SOURCE, "utf8");
  await mkdir(PUBLIC_DIR, { recursive: true });

  /** `any` purpose icons, rendered straight from the source mark. */
  const plain: [string, number][] = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    // iOS ignores the manifest and reads <link rel="apple-touch-icon">, which
    // does not accept SVG — so this size is not optional either.
    ["apple-icon-180.png", 180],
  ];

  for (const [name, size] of plain) {
    const out = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    await writeFile(path.join(PUBLIC_DIR, name), out);
    console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(out.length / 1024).toFixed(1)} kB`);
  }

  const maskable = await sharp(Buffer.from(toMaskable(svg))).resize(512, 512).png().toBuffer();
  await writeFile(path.join(PUBLIC_DIR, "icon-maskable-512.png"), maskable);
  console.log(
    `  ${"icon-maskable-512.png".padEnd(24)} 512x512  ${(maskable.length / 1024).toFixed(1)} kB`,
  );
}

void main();
