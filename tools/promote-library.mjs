#!/usr/bin/env node
/* Promote the Admin asset library (js/library.js, exported from the
   in-game Sandbox → Library panel → "Export library") into the actual
   codebase.

   The library lives in the browser's localStorage — per-origin, not in
   git, gone the moment the tab's site data is cleared, invisible on any
   other device or deploy. This is the other half of that: paste what
   Export copied into a file, run this script, and it becomes real —
   uploaded images get written to assets/cars/, and the corresponding
   entries land in js/art.js's SEDAN_PHOTOS/TRUCK_PHOTOS/TRAILER_PHOTOS (or
   js/collection.js's per-car skin.photo, for hero art). Same "the live
   game can't write to its own source" handoff as
   tools/promote-sandbox-levels.mjs uses for sandbox-designed levels.

   Usage:
     node tools/promote-library.mjs library.json
     node tools/promote-library.mjs library.json --dry-run
     pbpaste | node tools/promote-library.mjs -        # read stdin

   After this runs and you've committed + deployed the result, use the
   in-game Library panel's "Clear library" — otherwise every asset just
   promoted still sits in that browser's local override layer too, and
   would show up twice once the new code ships. */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run');

if(!file){
  console.error('Usage: node tools/promote-library.mjs <library.json|-> [--dry-run]');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_PATH = join(ROOT, 'js', 'art.js');
const COLLECTION_PATH = join(ROOT, 'js', 'collection.js');
const ASSETS_DIR = join(ROOT, 'assets', 'cars');

function readInput(){
  return readFileSync(file === '-' ? 0 : file, 'utf8');
}

let lib;
try{
  lib = JSON.parse(readInput());
}catch(e){
  console.error(`Couldn't parse ${file} as JSON: ${e.message}`);
  process.exit(1);
}

function slugify(s){
  return (s || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The colour tag is free-typed admin text (no character restriction in the
// add-form) but gets spliced into a single-quoted JS string literal below —
// escape it so e.g. a stray apostrophe can't produce invalid source.
function jsStringLiteral(s){
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/* Uploads land in the library as data: URLs (see js/library.js's
   renderToCanvas + toDataURL) — decode one back into a real PNG file. If
   an entry's img is already a plain path (e.g. re-exporting a library that
   already went through a previous promotion, before Clear library was
   pressed), there's nothing to write; it's presumably already committed. */
function decodeDataUrlToFile(dataUrl, filename){
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if(!m) return null;
  if(!DRY_RUN) writeFileSync(join(ASSETS_DIR, filename), Buffer.from(m[1], 'base64'));
  return 'assets/cars/' + filename;
}

let artSrc = readFileSync(ART_PATH, 'utf8');
let collectionSrc = readFileSync(COLLECTION_PATH, 'utf8');
const written = [];
const stamp = Date.now();

function promoteCategory(category, arrayName){
  const entries = lib[category] || [];
  if(!entries.length) return;
  const re = new RegExp(`(const ${arrayName} = \\[)([\\s\\S]*?)(\\n\\];)`);
  if(!re.test(artSrc)){
    console.error(`✗ couldn't find ${arrayName} in art.js — nothing added for ${category}`);
    return;
  }
  let additions = '';
  entries.forEach((entry, i) => {
    const filename = `library-${category}-${stamp}-${i}-${slugify(entry.color)}.png`;
    const path = decodeDataUrlToFile(entry.img, filename);
    if(!path){
      console.error(`✗ ${category}[${i}] (${entry.color}): img isn't a data URL — skipped (already promoted?)`);
      return;
    }
    const color = jsStringLiteral(entry.color);
    const fields = entry.fixed
      ? `{ img: '${path}', fixed: true, color: '${color}' }`
      : `{ img: '${path}', hue: ${Number(entry.hue) || 0}, color: '${color}' }`;
    additions += `  ${fields},\n`;
    written.push(path);
    console.log(`✓ ${arrayName}: ${path} (${entry.color})`);
  });
  if(additions) artSrc = artSrc.replace(re, (_, open, body, close) => `${open}${body}\n${additions.trimEnd()}${close}`);
}

promoteCategory('sedans', 'SEDAN_PHOTOS');
promoteCategory('trucks', 'TRUCK_PHOTOS');
promoteCategory('trailers', 'TRAILER_PHOTOS');

(lib.disabledBase || []).forEach(imgPath => {
  const lineRe = new RegExp(`^.*img: '${escapeRegExp(imgPath)}'.*$\\n`, 'm');
  if(lineRe.test(artSrc)){
    artSrc = artSrc.replace(lineRe, '');
    console.log(`✓ removed disabled base entry: ${imgPath}`);
  } else {
    console.error(`✗ couldn't find disabled base entry to remove: ${imgPath} (already removed?)`);
  }
});

let heroCount = 0;
Object.entries(lib.heroPhotos || {}).forEach(([carId, dataUrl]) => {
  const filename = `hero-library-${carId}-${stamp}.png`;
  const path = decodeDataUrlToFile(dataUrl, filename);
  if(!path){
    console.error(`✗ hero photo for '${carId}': img isn't a data URL — skipped (already promoted?)`);
    return;
  }
  const re = new RegExp(`(id: '${escapeRegExp(carId)}'[^\\n]*?photo: )(null|'[^']*')(,)`);
  if(re.test(collectionSrc)){
    collectionSrc = collectionSrc.replace(re, `$1'${path}'$3`);
    written.push(path);
    heroCount++;
    console.log(`✓ hero photo: '${carId}' → ${path}`);
  } else {
    console.error(`✗ couldn't find car '${carId}' in collection.js — nothing written for its photo`);
  }
});

if(!written.length){
  console.log('\nNothing to promote.');
  process.exit(0);
}

console.log(`\n${written.length} file(s) ${DRY_RUN ? 'would be' : ''} written.`);
if(DRY_RUN){
  console.log('--dry-run: not touching art.js or collection.js.');
  process.exit(0);
}

writeFileSync(ART_PATH, artSrc);
if(heroCount) writeFileSync(COLLECTION_PATH, collectionSrc);
console.log(`Wrote ${ART_PATH}${heroCount ? ` and ${COLLECTION_PATH}` : ''}.`);
console.log('\nNext: review the diff, run `node tools/verify-levels.mjs`, then commit.');
console.log('Once deployed, use the in-game Library panel\'s "Clear library" so these assets don\'t show up twice.');
