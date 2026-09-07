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
const ASSETS_DIR = path.join(process.cwd(), "assets");
const SOURCE = path.join(PUBLIC_DIR, "icon.svg");

/**
 * Android's adaptive-icon geometry, in fractions of the 108dp drawable.
 *
 * A launcher composites a background and a foreground layer, then crops the
 * pair to a mask of its own choosing — circle, squircle, teardrop. Only the
 * centre 72dp survives that crop, and only the centre 66dp survives it in
 * *every* mask shape, which is the figure artwork has to respect.
 */
const SAFE_ZONE = 66 / 108;

/**
 * How much of the canvas the mark's bounding box may occupy, given its shape.
 *
 * Not `SAFE_ZONE` itself, which is the diameter of a *circle*: a box scaled to
 * that width pushes its own corners outside the circle, and on this mark the
 * corner is the arrowhead — the first thing a round mask cuts off. What has to
 * fit is the box's diagonal, so the limit depends on how square the box is.
 *
 * Measuring it rather than assuming a square (`SAFE_ZONE / √2`, the old
 * constant) matters here because the mark is wide and short: assuming the worst
 * case shrank it by another 10% for clearance it never needed, and a mark that
 * small reads as lost inside the launcher's circle.
 */
function markScale(width: number, height: number): number {
  const diagonal = Math.hypot(width, height);
  return (SAFE_ZONE * Math.max(width, height)) / diagonal;
}

/**
 * The two layers the Android launcher icon is built from.
 *
 * These are generated rather than hand-drawn because the previous pair was
 * wrong in a way that is easy to reintroduce: the foreground held the entire
 * blue tile — mark, rounded corners and all — over a flat green background,
 * so the launcher drew a green ring around a small blue square, and removing
 * the padding that hid the seam only clipped the tile's corners against the
 * mask instead.
 *
 * The split the format actually wants is a full-bleed background carrying the
 * colour, and a foreground carrying nothing but the mark on transparency. The
 * mask then cuts the background, which extends past it in every direction, and
 * the mark sits inside the safe zone where no mask can reach it.
 */
async function writeAndroidLayers(svg: string): Promise<void> {
  const CANVAS = 1024;

  // Background: the tile's gradient with its rounded corners removed, so the
  // colour runs past the mask edge instead of stopping short of it.
  const background = svg
    .replace(/<rect width="512" height="512" rx="114"/, '<rect width="512" height="512"')
    .replace(/<g fill="#fff" opacity="\.17">[\s\S]*<\/svg>/, "</svg>");

  await writeFile(
    path.join(ASSETS_DIR, "icon-background.png"),
    await sharp(Buffer.from(background)).resize(CANVAS, CANVAS).png().toBuffer(),
  );

  // Foreground: the mark alone, on transparency.
  const markOnly = svg.replace(/<rect width="512" height="512" rx="114"[^>]*\/>/, "");

  // Trim to the ink, then scale that to the safe zone and re-centre it. Doing
  // it by measurement rather than by a hardcoded transform keeps this correct
  // if the mark is ever redrawn at a different size within its viewBox.
  // Two pipelines, deliberately. sharp applies `trim` before `resize` within a
  // single one, whatever order they are called in — so `.resize(CANVAS, CANVAS)
  // .trim()` trimmed the source and then stretched the ink to a square, which
  // is how the shipped mark ended up 442x442 with its arrowhead distorted.
  // Rendering first and trimming the *rendered* bitmap keeps the aspect ratio.
  const rendered = await sharp(Buffer.from(markOnly)).resize(CANVAS, CANVAS).png().toBuffer();
  const trimmed = await sharp(rendered).trim({ threshold: 1 }).png().toBuffer();

  const ink = await sharp(trimmed).metadata();
  const inkWidth = ink.width ?? CANVAS;
  const inkHeight = ink.height ?? CANVAS;

  // Scale the ink to the largest size its own shape allows inside the safe
  // zone, then centre it by its bounding box. Centring the *box* rather than
  // the canvas is the point: a mark whose ink is off to one side would
  // otherwise sit off-centre under every mask.
  const scale = (CANVAS * markScale(inkWidth, inkHeight)) / Math.max(inkWidth, inkHeight);
  const width = Math.round(inkWidth * scale);
  const height = Math.round(inkHeight * scale);
  const fitted = await sharp(trimmed).resize(width, height).toBuffer();

  await writeFile(
    path.join(ASSETS_DIR, "icon-foreground.png"),
    await sharp({
      create: {
        width: CANVAS,
        height: CANVAS,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: fitted,
          left: Math.round((CANVAS - width) / 2),
          top: Math.round((CANVAS - height) / 2),
        },
      ])
      .png()
      .toBuffer(),
  );

  // Legacy square icon, for launchers and API levels with no adaptive support.
  await writeFile(
    path.join(ASSETS_DIR, "icon.png"),
    await sharp(Buffer.from(svg)).resize(CANVAS, CANVAS).png().toBuffer(),
  );

  console.log("  assets/icon-background.png  1024x1024  full-bleed gradient");
  console.log(
    `  assets/icon-foreground.png  1024x1024  mark ${width}x${height} inside the safe zone`,
  );
  console.log("  assets/icon.png             1024x1024  legacy square");
}

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

  // Scale the drawn content to 80% about the centre, leaving the tile
  // full-bleed. "The content" is everything after the tile rect, found by that
  // rect rather than by naming a layer, so redrawing the mark cannot silently
  // leave half of it unscaled.
  const tile = /<rect width="512" height="512"[^>]*\/>/.exec(squared);
  if (!tile) throw new Error("icon.svg: no full-bleed tile rect to anchor the maskable variant to");

  const openIndex = tile.index + tile[0].length;
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

  await mkdir(ASSETS_DIR, { recursive: true });
  await writeAndroidLayers(svg);
  console.log("\nRun `npx capacitor-assets generate --android` to rebuild the Android mipmaps.");
}

void main();
