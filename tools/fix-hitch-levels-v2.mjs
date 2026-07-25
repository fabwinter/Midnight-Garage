#!/usr/bin/env node
/* Replaces the 7 shipped hitch levels whose stored par no longer matches
   the corrected solver (js/solver.js: a hitch trailer can never move on
   its own, coupled or decoupled — only the compound tow move can
   reposition it, and a decoupled hitch can now be explicitly re-coupled
   when its tow/trailer are adjacent again). Removing the trailer's old
   (buggy) post-decouple mobility can only make a board equal-or-harder to
   solve, never easier, so several of these boards' true optimal move
   count went UP. Same in-place-replacement pattern as
   tools/fix-hitch-levels.mjs: same array indices (no save migration
   needed), matching each slot's chapter par band and keeping its
   difficulty score at/above that chapter's floor.

   The one hitch level that DIDN'T fail re-verification (index 138 / level
   139) is left untouched — its original optimal solution never depended
   on the trailer's old illegal post-decouple mobility, so it's still
   correct as shipped.

   Run: node tools/fix-hitch-levels-v2.mjs [--dry-run] */
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve } from '../js/solver.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS_PATH = join(ROOT, 'js', 'levels.data.js');

const existingMod = await import(LEVELS_PATH + '?t=' + Date.now());
const { CHAPTER_SIZE, INTRO, CHAPTERS, LEVELS } = existingMod;
const pool = JSON.parse(readFileSync(join(ROOT, '.genwork', 'hitch-pool.json'), 'utf8'));

// idx -> [par, d] picks a specific board (par + nearest-d match) rather
// than just "lowest d at this par" — the fresh pool from the corrected
// solver is much smaller (81 boards, mostly par 9-12) than the original
// pass, so par>=13 supply is scarce: only 9 boards total across par
// 13-18, and the 4 Gridlock slots specifically need d >= its 20.2 floor,
// which only 4 of those 9 boards clear at all (par 14/15/17/18). Each
// pick below is that scarce-supply allocation worked out by hand: the
// floor-clearing boards go to Gridlock first, then Harbor Freight takes
// from what's left that clears ITS 16.9 floor, then Neon District (whose
// 13.7 floor is easiest to clear) takes whatever's left.
const REPLACEMENTS = {
  92: [13, 15.1],   // Neon District (10-16, floor 13.7), was par 16 -> new-solver optimal 21
  115: [16, 17.6],  // Harbor Freight (11-18, floor 16.9), was par 18 -> 19
  147: [12, 19.7],  // Harbor Freight, was par 14 -> 15
  162: [14, 20.3],  // Gridlock (13-23, floor 20.2), was par 13 -> 14
  169: [15, 21.2],  // Gridlock, was par 13 -> 18
  180: [17, 25.6],  // Gridlock, was par 14 -> 15
  188: [18, 22.7],  // Gridlock, was par 14 -> 15
};

const takeExact = (par, d) => {
  const idx = pool.findIndex(lv => lv.m === par && Math.abs(lv.d - d) < 0.05);
  if(idx === -1) throw new Error(`No pool board at par ${par} d~${d}`);
  return pool.splice(idx, 1)[0];
};

const newLevels = LEVELS.slice();

Object.entries(REPLACEMENTS).forEach(([idxStr, [par, d]]) => {
  const idx = Number(idxStr);
  const ch = CHAPTERS[Math.floor(idx / CHAPTER_SIZE)];
  if(par < ch.minM || par > ch.maxM){
    throw new Error(`Replacement par ${par} for index ${idx} is outside ${ch.name}'s band ${ch.minM}-${ch.maxM}`);
  }
  const picked = takeExact(par, d);

  const pieces = picked.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const sol = solve(pieces, { hitches: picked.h, maxStates: 2000000 });
  if(!sol.solvable || sol.optimal !== picked.m){
    throw new Error(`Replacement for index ${idx} failed re-verification (claimed par ${picked.m}, solver says ${sol.solvable ? sol.optimal : 'unsolvable'})`);
  }
  const tow = pieces[picked.h[0].tow], trailer = pieces[picked.h[0].trailer];
  const adjacent = tow.c === trailer.c && (tow.r + tow.len === trailer.r || trailer.r + trailer.len === tow.r);
  if(!adjacent) throw new Error(`Replacement for index ${idx}: tow/trailer not adjacent`);

  newLevels[idx] = { m: picked.m, d: picked.d, p: picked.p, h: picked.h };
  console.log(`✓ index ${idx} (${ch.name}): par ${LEVELS[idx].m} -> ${picked.m}, d ${LEVELS[idx].d} -> ${picked.d}`);
});

if(DRY_RUN){
  console.log('\n--dry-run: not writing js/levels.data.js.');
  process.exit(0);
}

const levelsJs = `/* AUTO-GENERATED — do not edit by hand. 500 levels, verified optimal
   (m = par), curved by difficulty model v1 score (d), 10 chapters of 50.
   See docs/LEVELS-500-PLAN.md for the 200->500 expansion,
   tools/fix-hitch-levels.mjs for the original hitch tow/trailer adjacency
   fix, and tools/fix-hitch-levels-v2.mjs for the "unhitched trailer can
   never move on its own" solver-rule fix (7 of the 8 hitch levels were
   regenerated in place at their same indices — nothing else here
   changed). */

export const CHAPTER_SIZE = ${CHAPTER_SIZE};

/* Levels 1-INTRO ease in below chapter 1's floor; every later level needs >= chapter 1's floor. */
export const INTRO = ${INTRO};

export const CHAPTERS = ${JSON.stringify(CHAPTERS, null, 2)};

export const LEVELS = [
${newLevels.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}), ...(lv.h ? { h: lv.h } : {}) })).join(',\n')}
];
`;
writeFileSync(LEVELS_PATH, levelsJs);
console.log(`\nWrote ${LEVELS_PATH}.`);
