#!/usr/bin/env node
/* Normalizes vehicle art to the layout the rest of the codebase assumes:
   content cropped to the vehicle, scaled to 97% of the canvas length with
   the true aspect ratio preserved (boxy vehicles cap at 97% HEIGHT
   instead, so nothing is ever stretched), centred on a transparent canvas
   of the file's original dimensions.

   That rule was documented in js/art.js and in the art spec, but was never
   enforced, and the shipped assets drifted from it — measured nose
   positions ran 87.9%–99.9% of canvas width. js/art.js's hero light
   overlay is anchored to the vehicle's nose, so that spread is what made
   the headlight/taillight glows sit correctly on classic.webp and drift
   onto the bonnet (or off the body) on everything else. Normalizing makes
   one geometry serve every car.

   Usage:
     node tools/normalize-car-art.mjs --check   # report only, writes nothing
     node tools/normalize-car-art.mjs           # rewrite off-spec files

   Only files actually outside tolerance are rewritten — WebP re-encoding
   is lossy, so a file already on spec is left byte-identical rather than
   churned for nothing. After running, regenerate the measured geometry:
     node tools/measure-car-art.mjs

   Needs sharp (already a devDep via @capacitor/assets, same as
   tools/build-icons.mjs). Originals are recoverable from git. */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DIR = 'assets/cars';
const FILL = 0.97;       // of canvas length (or height, whichever binds first)
// Leave alone if within 0.6% of target. Deliberately loose enough to spare
// classic.webp, which sits 0.5% off: it's the reference the hero light
// overlay was originally tuned to and the most-seen asset in the game, so
// re-encoding it for a half-percent nudge is pure quality loss.
const TOL = 0.006;
const ALPHA_MIN = 40;    // same opacity threshold tools/measure-car-art.mjs uses
const CHECK = process.argv.includes('--check');

// alphaQuality 100 keeps the cutout edge crisp — a soft alpha edge shows up
// as a shadow fringe against the dark board, which has already cost two
// assets their place in rotation.
//
// quality 85 was picked by measurement, not feel: against a q95 reference
// it differs by a mean of 1.0/255 per channel (invisible at the ~130px the
// board actually renders a car at) while landing within a kilobyte of the
// original files' size, so normalizing the whole set doesn't grow the app
// bundle. q92 looked tempting but cost +25% total size for a difference
// that measures 0.4/255. Always re-run against pristine sources rather
// than already-normalized files — re-encoding a re-encode compounds
// generation loss for nothing.
const ENCODE = { quality: 85, alphaQuality: 100, effort: 6 };

async function bbox(buf, W, H, C){
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    if(buf[(y * W + x) * C + 3] > ALPHA_MIN){
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.webp')).sort();
let rewritten = 0, skipped = 0;
const report = [];

for(const f of files){
  const p = path.join(DIR, f);
  const src = sharp(p).ensureAlpha();
  const meta = await src.metadata();
  const CW = meta.width, CH = meta.height;
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const bb = await bbox(data, info.width, info.height, info.channels);
  if(!bb){ report.push([f, 'empty — skipped']); skipped++; continue; }

  const carW = bb.maxX - bb.minX + 1, carH = bb.maxY - bb.minY + 1;
  // Whichever axis hits 97% first decides the scale, so aspect is preserved
  // and a boxy vehicle caps on height rather than overflowing it.
  const scale = Math.min(FILL * CW / carW, FILL * CH / carH);
  const before = +(carW / CW * 100).toFixed(1);

  if(Math.abs(scale - 1) <= TOL){
    report.push([f, `on spec (${before}% wide) — left untouched`]);
    skipped++;
    continue;
  }

  const sw = Math.max(1, Math.round(carW * scale));
  const sh = Math.max(1, Math.round(carH * scale));
  report.push([f, `${before}% -> ${(sw / CW * 100).toFixed(1)}% wide (scale ${scale.toFixed(3)})`]);
  if(CHECK){ rewritten++; continue; }

  const cropped = await sharp(p).ensureAlpha()
    .extract({ left: bb.minX, top: bb.minY, width: carW, height: carH })
    .resize(sw, sh, { kernel: 'lanczos3', fit: 'fill' })
    .toBuffer();

  const out = await sharp({
    create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cropped, left: Math.round((CW - sw) / 2), top: Math.round((CH - sh) / 2) }])
    .webp(ENCODE)
    .toBuffer();

  fs.writeFileSync(p, out);
  rewritten++;
}

for(const [f, msg] of report) console.log('  ' + f.padEnd(52) + msg);
console.log(CHECK
  ? `\n${rewritten} file(s) off spec, ${skipped} already correct (nothing written)`
  : `\nrewrote ${rewritten} file(s), left ${skipped} already-correct file(s) untouched`);
if(!CHECK && rewritten) console.log('now run: node tools/measure-car-art.mjs');
