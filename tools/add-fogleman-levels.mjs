#!/usr/bin/env node
/* Splice verified Michael Fogleman puzzles (michaelfogleman.com/rush) into
   the campaign to raise Gridlock's difficulty ceiling past what our own
   generator reaches. His database comes from exhaustive state-space
   enumeration rather than our hill-climb, so it holds genuinely harder
   boards (par 41-60) than anything harden()/harvestShape() finds — see
   tools/import-fogleman.mjs's header for why we import rather than try to
   reproduce that search.

   Same splicing pattern as tools/add-hitch-levels.mjs: replace a slice of
   one chapter, re-sort by score, re-verify all 200. CHAPTER_SIZE and the
   200-level, 4x50 shape stay fixed — only Gridlock's declared maxM moves,
   from 40 up to 60.

   Run after tools/import-fogleman.mjs has produced a pool:
     node tools/import-fogleman.mjs tools/data/fogleman-boards.txt \
       --min-par 41 --out .genwork/fogleman-pool.json
     node tools/add-fogleman-levels.mjs

   Target chapter: Gridlock (index 3, currently par band 23-40) — the last
   chapter, so the new ceiling caps the whole campaign's endgame. */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve } from '../js/solver.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POOL_FILE = join(ROOT, '.genwork', 'fogleman-pool.json');
const OUT = join(ROOT, 'js', 'levels.data.js');

const TARGET_CHAPTER = 3;      // Gridlock
const REPLACE_COUNT = 20;
const NEW_MAX_M = 60;

if(!existsSync(POOL_FILE)){
  console.error(`No pool at ${POOL_FILE} — run tools/import-fogleman.mjs first (see header).`);
  process.exit(1);
}

const { LEVELS, CHAPTERS, CHAPTER_SIZE, INTRO } = await import(pathToUrl(join(ROOT, 'js', 'levels.data.js')));
function pathToUrl(p){ return 'file://' + p + '?t=' + Date.now(); }   // bust the module cache on re-run

const band = CHAPTERS[TARGET_CHAPTER];
const pool = JSON.parse(readFileSync(POOL_FILE, 'utf8'));

const inBand = pool.filter(lv => lv.m > band.maxM && lv.m <= NEW_MAX_M);
console.log(`Pool: ${pool.length} total, ${inBand.length} above the current ceiling (par ${band.maxM + 1}-${NEW_MAX_M}).`);
if(inBand.length < REPLACE_COUNT){
  console.error(`Need ${REPLACE_COUNT} such levels, only have ${inBand.length}.`);
  process.exit(1);
}

// Always take the single hardest board as a capstone, then spread the rest
// evenly across the pool's own par range (not score, which skews toward the
// far more populous par-41 end) so the replaced slots climb 41 -> 60
// instead of clustering just past the old ceiling.
const byParDesc = inBand.slice().sort((a, b) => b.m - a.m || b.d - a.d);
const seen = new Set([byParDesc[0].key]);
const picks = [byParDesc[0]];

const byParAsc = inBand.slice().sort((a, b) => a.m - b.m || a.d - b.d);
for(let j = 0; j < REPLACE_COUNT - 1; j++){
  let idx = Math.min(byParAsc.length - 1, Math.floor(byParAsc.length * (j + 0.5) / (REPLACE_COUNT - 1)));
  while(seen.has(byParAsc[idx].key) && idx < byParAsc.length - 1) idx++;
  if(seen.has(byParAsc[idx].key)) continue;   // pool exhausted at this end, skip
  seen.add(byParAsc[idx].key);
  picks.push(byParAsc[idx]);
}
console.log(`Picked ${picks.length} boards, pars: ${picks.map(l => l.m).sort((a, b) => a - b).join(', ')}`);

const chStart = TARGET_CHAPTER * CHAPTER_SIZE;
const chapterLevels = LEVELS.slice(chStart, chStart + CHAPTER_SIZE);

// Replace the chapter's current highest-score slots — the imported boards
// all score above anything currently in Gridlock, so this is equivalent to
// "evict whichever originals the re-sort would push out anyway," but doing
// it explicitly means the untouched levels below stay exactly as generated
// instead of losing arbitrary evenly-spaced slots to a chapter that isn't
// short on easier boards.
const byScoreDesc = chapterLevels.map((lv, i) => [i, lv]).sort((a, b) => b[1].d - a[1].d);
const evictIdx = new Set(byScoreDesc.slice(0, picks.length).map(([i]) => i));

const mixed = [];
let p = 0;
chapterLevels.forEach((lv, i) => { mixed.push(evictIdx.has(i) ? picks[p++] : lv); });

// Re-sort the whole chapter by score so both old and new levels land
// wherever their own difficulty places them.
mixed.sort((a, b) => a.d - b.d || a.m - b.m);

const newChapters = CHAPTERS.map((c, i) => i === TARGET_CHAPTER ? { ...c, maxM: NEW_MAX_M } : c);
const newLevels = LEVELS.slice(0, chStart).concat(mixed, LEVELS.slice(chStart + CHAPTER_SIZE));
if(newLevels.length !== LEVELS.length) throw new Error(`level count drifted: ${newLevels.length} vs ${LEVELS.length}`);

console.log(`Re-verifying all ${newLevels.length} levels (including ${picks.length} new Fogleman imports)…`);
newLevels.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const sol = solve(pieces, { walls: lv.w, gates: lv.g, hitches: lv.h });
  if(!sol.solvable || sol.optimal !== lv.m){
    throw new Error(`level ${i + 1} failed verification (par ${lv.m}, solved ${sol.solvable ? sol.optimal : 'unsolvable'})`);
  }
});
console.log('All verified.');

const levelsJs = `/* AUTO-GENERATED by tools/generate-levels.mjs, then tools/add-hitch-levels.mjs
   and tools/add-fogleman-levels.mjs — do not edit by hand. 200 levels,
   verified optimal (m = par), curved by difficulty model v1 score (d).
   Chapters are palette-swap themed for now (full environments arrive in
   v1.5 per the sequencing plan). Neon District (chapter 2) carries hitch
   puzzles — pieces marked in a level's \`h\` array need towing/decoupling
   to clear, per js/solver.js's hitch rules. Gridlock (chapter 4) carries
   ${picks.length} boards imported from Michael Fogleman's exhaustively-
   enumerated Rush Hour database (michaelfogleman.com/rush), independently
   re-solved and verified by our own solver — see tools/import-fogleman.mjs
   — pushing the campaign's ceiling from par 40 to par ${NEW_MAX_M}. */

export const CHAPTER_SIZE = ${CHAPTER_SIZE};

/* Levels 1–INTRO ease in below chapter 1's floor; every later level needs ≥ minM moves. */
export const INTRO = ${INTRO};

export const CHAPTERS = ${JSON.stringify(newChapters, null, 2)};

export const LEVELS = [
${newLevels.map(lv => JSON.stringify({
    m: lv.m, d: lv.d, p: lv.p,
    ...(lv.w?.length ? { w: lv.w } : {}),
    ...(lv.g?.length ? { g: lv.g } : {}),
    ...(lv.h?.length ? { h: lv.h } : {}),
  })).join(',\n')}
];
`;

writeFileSync(OUT, levelsJs);
console.log(`Wrote ${OUT}`);
console.log(`${band.name} now spans levels ${chStart + 1}-${chStart + CHAPTER_SIZE}, par ${band.minM}-${NEW_MAX_M}, ${picks.length} of them Fogleman imports.`);
