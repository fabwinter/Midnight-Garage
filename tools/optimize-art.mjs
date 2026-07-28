#!/usr/bin/env node
/* Converts the vehicle art in assets/cars/ from PNG to WebP and rewrites
   every path reference to match. Idempotent — safe to re-run any time,
   and the thing to run after `promote-library.mjs` (which writes new
   uploads as PNG, because that's what the browser's canvas.toDataURL
   hands it).

   Why: these are photoreal RGBA renders, which is close to the worst case
   for PNG. The art shipped at ~28 MB across 71 files, ~400 KB each; a
   single board needs 12-14 of them at once, so a cold load pulled ~7 MB
   and took ~19s on a modest 4G connection — the "cars appear one by one"
   symptom. WebP at q82 lands the same art at ~10% of the bytes with no
   visible difference at any size the game actually renders (checked at
   iPad-3x display scale, zoomed 4x further, on the alpha edges where
   artifacts would show first).

   Usage:
     node tools/optimize-art.mjs            # convert + rewrite refs
     node tools/optimize-art.mjs --dry-run  # report only, touch nothing
     node tools/optimize-art.mjs --keep-png # leave the PNG originals on disk
*/

import { readdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARS = join(ROOT, 'assets', 'cars');
const DRY = process.argv.includes('--dry-run');
const KEEP_PNG = process.argv.includes('--keep-png');

// q82/effort6 measured as the knee of the curve on this art: visually
// indistinguishable from source, ~10x smaller. Going lower starts to show
// on the large flat body panels before it shows on the detail.
const QUALITY = 82;
const EFFORT = 6;

/* Every source PNG is authored at 2x the on-board display size at the
   biggest cell the game will ever use (110px, see MAX_CELL in js/game.js
   — a len-3 truck at 3x DPR is 990x330 device px). Anything larger than
   this is wasted bytes no display can resolve; one asset shipped at
   1600x799, double its shoot-mates, and alone accounted for 1.4 MB. */
const MAX_W = 1200, MAX_H = 400;

/* Files referencing car art paths. js/art.js holds the base arrays;
   promote-library.mjs validates and constructs those paths and would
   silently keep writing .png without this.

   js/library.js is deliberately NOT in this list even though it mentions
   .png: its migrateArtPaths() rewrites an admin's persisted OLD .png
   paths forward to .webp, so the extension there is legacy data to match
   against, not a live asset path. Rewriting it turns the migration into a
   `.webp` -> `.webp` no-op — which is exactly what happened the first
   time this ran. */
const REF_FILES = ['js/art.js', 'tools/promote-library.mjs'];

/* The start-screen poster and the two plate backgrounds get the same
   format treatment but are NEVER resized: .intro-sheet/.pro-sheet pin
   their art to the sheet's WIDTH (background-size:100% auto) against a
   .plate-spacer with a hand-tuned aspect-ratio, so changing their pixel
   dimensions silently rescales the artwork against that spacer (see
   CLAUDE.md). Format-only is safe; resizing is not. They're referenced
   from CSS rather than JS, hence the separate ref file. */
const STILLS = { dir: join(ROOT, 'assets', 'start'), exts: ['.jpg', '.jpeg'], refFiles: ['css/game.css'] };

// Each pass below is independent and self-skipping when there's nothing
// left to convert — don't early-exit the process on one being empty, or
// re-running after a partial conversion silently skips the other.
const pngs = readdirSync(CARS).filter(f => f.toLowerCase().endsWith('.png'));

let beforeBytes = 0, afterBytes = 0, resized = 0;
const converted = [];

for(const png of pngs){
  const src = join(CARS, png);
  const outName = png.replace(/\.png$/i, '.webp');
  const out = join(CARS, outName);
  const inBytes = statSync(src).size;
  beforeBytes += inBytes;

  let img = sharp(src);
  const meta = await img.metadata();
  if(meta.width > MAX_W || meta.height > MAX_H){
    img = img.resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true });
    resized++;
  }
  const buf = await img.webp({ quality: QUALITY, effort: EFFORT }).toBuffer();
  afterBytes += buf.length;
  converted.push({ png, webp: outName, inBytes, outBytes: buf.length, was: `${meta.width}x${meta.height}` });

  if(!DRY){
    writeFileSync(out, buf);
    if(!KEEP_PNG) unlinkSync(src);
  }
}

// Rewrite references. Only touches assets/cars/<name>.png — leaves the
// start-screen JPGs, icon.svg and audio alone.
let refEdits = 0;
for(const rel of REF_FILES){
  const p = join(ROOT, rel);
  let srcTxt;
  try { srcTxt = readFileSync(p, 'utf8'); } catch { continue; }
  const updated = srcTxt.replace(/(assets\/cars\/[^'"`\s)]+)\.png/g, '$1.webp');
  // promote-library.mjs also builds NEW filenames + validates an editOf
  // path; both must stop assuming .png or the next promotion writes a
  // file art.js will never look for.
  const updated2 = updated
    .replace(/\.png`;/g, '.webp`;')
    .replace(/\\\.png\$/g, '\\.webp$')
    .replace(/\*\\?\.png path/g, '*.webp path');
  if(updated2 !== srcTxt){
    refEdits++;
    if(!DRY) writeFileSync(p, updated2);
  }
}

// --- Start-screen stills (format only, never resized — see STILLS) -----
let stillBefore = 0, stillAfter = 0;
const stills = readdirSync(STILLS.dir).filter(f => STILLS.exts.some(e => f.toLowerCase().endsWith(e)));
for(const f of stills){
  const src = join(STILLS.dir, f);
  const outName = f.replace(/\.jpe?g$/i, '.webp');
  stillBefore += statSync(src).size;
  const buf = await sharp(src).webp({ quality: QUALITY, effort: EFFORT }).toBuffer();
  stillAfter += buf.length;
  if(!DRY){
    writeFileSync(join(STILLS.dir, outName), buf);
    if(!KEEP_PNG) unlinkSync(src);
  }
}
for(const rel of STILLS.refFiles){
  const p = join(ROOT, rel);
  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch { continue; }
  const out = txt.replace(/(assets\/start\/[^'"`\s)]+)\.jpe?g/g, '$1.webp');
  if(out !== txt){ refEdits++; if(!DRY) writeFileSync(p, out); }
}

const mb = b => (b / 1048576).toFixed(2) + ' MB';
if(!converted.length && !stills.length){
  console.log('Nothing left to convert — assets/cars/ and assets/start/ are already optimized.');
  process.exit(0);
}
if(converted.length){
  console.log(`${DRY ? '[dry-run] ' : ''}${converted.length} vehicle files: ${mb(beforeBytes)} -> ${mb(afterBytes)} ` +
              `(${(100 - 100 * afterBytes / beforeBytes).toFixed(1)}% smaller)`);
}
if(stills.length){
  console.log(`${DRY ? '[dry-run] ' : ''}${stills.length} start-screen stills: ${mb(stillBefore)} -> ${mb(stillAfter)} ` +
              `(${(100 - 100 * stillAfter / stillBefore).toFixed(1)}% smaller, not resized)`);
}
if(resized) console.log(`  ${resized} oversized source(s) capped to ${MAX_W}x${MAX_H}`);
console.log(`  ${refEdits} source file(s) had path references rewritten`);
if(converted.length){
  console.log('\nLargest remaining vehicle art:');
  converted.sort((a, b) => b.outBytes - a.outBytes).slice(0, 6)
    .forEach(c => console.log(`  ${String(Math.round(c.outBytes / 1024)).padStart(5)} KB  ${c.webp}`));
}
if(!DRY && !KEEP_PNG) console.log('\nOriginals removed (recoverable from git history).');
