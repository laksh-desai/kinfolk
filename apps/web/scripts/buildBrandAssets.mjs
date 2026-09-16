/**
 * Turns the two logo files ATS supplied into the web assets the app ships.
 *
 *   node apps/web/scripts/buildBrandAssets.mjs <source dir>
 *
 * The supplied files are a transparent PNG of the tree and a full lockup on solid white, both
 * far too large to serve. For each one this trims the empty margin, keys the white background
 * out into an alpha mask, and writes the brand navy artwork the app and its exports use.
 * Re-run it only if ATS sends new artwork.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'apps/api/package.json'));
const sharp = require('sharp');

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../public/brand');
const sourceDir = process.argv[2] ?? path.resolve(here, '../brand-source');

/** The brand navy, sampled from the artwork. */
export const BRAND_NAVY = [16, 42, 94];


/**
 * Alpha from how far each pixel is from white, so anti-aliased edges stay smooth, then paints
 * every pixel one flat colour. Works because the artwork is a single ink on white.
 */
async function colourway(source, rgb, width, outFile) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  // Luminance of the darkest ink: the point at which a pixel becomes fully opaque.
  const inkLuma = 40;
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const fromWhite = Math.max(0, Math.min(1, (255 - luma) / (255 - inkLuma)));
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
    out[i + 3] = Math.round(fromWhite * (data[i + 3] / 255) * 255);
  }
  const info2 = { width: info.width, height: info.height, channels: 4 };
  await sharp(out, { raw: info2 }).trim({ threshold: 1 }).resize({ width, fit: 'inside' }).png({ compressionLevel: 9, palette: true }).toFile(outFile);
  const { size } = await sharp(outFile).metadata().then(async (m) => ({ ...m, size: (await import('node:fs')).statSync(outFile).size }));
  console.warn(`${path.basename(outFile)} — ${(await sharp(outFile).metadata()).width}px wide, ${Math.round(size / 1024)} KB`);
}

const tree = path.join(sourceDir, 'ats-tree.png');
const full = path.join(sourceDir, 'ats-full.png');

// One file each, in the brand navy. Exports use them as they are; the app paints them through
// a CSS mask, so they take the navy in daylight and a pale ink at night from one asset.
// The mark: small in the app chrome, large and faint behind an export.
await colourway(tree, BRAND_NAVY, 512, path.join(outDir, 'ats-mark.png'));
// The full lockup: sign-in, the public pages a family sees, and the corner of an export.
await colourway(full, BRAND_NAVY, 900, path.join(outDir, 'ats-lockup.png'));
