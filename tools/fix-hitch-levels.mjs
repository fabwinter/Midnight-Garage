#!/usr/bin/env node
/* Replaces the 8 shipped hitch levels with freshly-generated ones from
   the FIXED tryGenerateHitch (js/generate.js) — the original 8 all had
   their tow and trailer in different, non-adjacent lanes (a generator
   bug: tow was placed "elsewhere on the board" with no adjacency
   constraint), so a coupled pair could look like two unrelated cars
   linked by an invisible tether. The fix requires tow/trailer to be
   directly touching in the same lane; this replaces the old (buggy)
   boards in place, at their SAME array indices, so no player's earned
   stars/best on any OTHER level shift around — only these 8 slots'
   board content changes, matching the newly-generated board's chapter
   par band as closely as supply allows.

   Run: node tools/fix-hitch-levels.mjs [--dry-run] */
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

const byPar = new Map();
pool.forEach(lv => { if(!byPar.has(lv.m)) byPar.set(lv.m, []); byPar.get(lv.m).push(lv); });
// Picks the lowest-d board at `par` that's still >= minD, so each slot's
// difficulty score lands close to (not wildly above) its chapter's
// natural range rather than just clearing the bare minimum invariant —
// see the chapter d-range audit in the commit message for the numbers
// this was chosen against (Harbor Freight 16.9-24.9, Gridlock's natural
// floor ~20.2 once the 4 buggy replacements are excluded).
const takeByPar = (par, minD = 0) => {
  const list = byPar.get(par);
  if(!list) throw new Error(`No pool board left at par ${par}`);
  list.sort((a, b) => a.d - b.d);
  const idx = list.findIndex(lv => lv.d >= minD);
  if(idx === -1) throw new Error(`No pool board at par ${par} with d >= ${minD}`);
  return list.splice(idx, 1)[0];
};

// idx -> [par, minD]. par chosen to stay inside that index's current
// chapter band; minD chosen so the replacement's difficulty score lands
// inside (not below) its chapter's natural d-range, so swapping the
// board doesn't quietly punch a hole in the difficulty curve the same
// way the original bug did visually.
const REPLACEMENTS = {
  92: [16, 20],    // Neon District (10-16, d 13.7-23.5), was par 15
  115: [18, 20],   // Harbor Freight (11-18, d 16.9-24.9), was par 17
  138: [14, 17],   // Harbor Freight, was par 15
  147: [14, 19],   // Harbor Freight, was par 17
  162: [13, 20],   // Gridlock (13-23, natural floor ~20.2), was par 16
  169: [13, 20],   // Gridlock, was par 16
  180: [14, 20],   // Gridlock, was par 17
  188: [14, 20],   // Gridlock, was par 17
};

const newLevels = LEVELS.slice();

Object.entries(REPLACEMENTS).forEach(([idxStr, [par, minD]]) => {
  const idx = Number(idxStr);
  const ch = CHAPTERS[Math.floor(idx / CHAPTER_SIZE)];
  if(par < ch.minM || par > ch.maxM){
    throw new Error(`Replacement par ${par} for index ${idx} is outside ${ch.name}'s band ${ch.minM}-${ch.maxM}`);
  }
  let picked = null;
  try{ picked = takeByPar(par, minD); }
  catch{ picked = takeByPar(par, 0); }   // fall back to any board at this par if none clears minD
  if(!picked) throw new Error(`Couldn't find a usable replacement board for index ${idx} (wanted par ${par})`);

  const pieces = picked.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const sol = solve(pieces, { hitches: picked.h, maxStates: 2000000 });
  if(!sol.solvable || sol.optimal !== picked.m){
    throw new Error(`Replacement for index ${idx} failed re-verification (claimed par ${picked.m}, solver says ${sol.solvable ? sol.optimal : 'unsolvable'})`);
  }
  const tow = pieces[picked.h[0].tow], trailer = pieces[picked.h[0].trailer];
  const adjacent = tow.c === trailer.c && (tow.r + tow.len === trailer.r || trailer.r + trailer.len === tow.r);
  if(!adjacent) throw new Error(`Replacement for index ${idx}: tow/trailer still not adjacent — generator fix didn't take`);

  newLevels[idx] = { m: picked.m, d: picked.d, p: picked.p, h: picked.h };
  console.log(`✓ index ${idx} (${CHAPTERS[Math.floor(idx / CHAPTER_SIZE)].name}): par ${LEVELS[idx].m} -> ${picked.m}, tow/trailer now adjacent`);
});

if(DRY_RUN){
  console.log('\n--dry-run: not writing js/levels.data.js.');
  process.exit(0);
}

const levelsJs = `/* AUTO-GENERATED — do not edit by hand. 500 levels, verified optimal
   (m = par), curved by difficulty model v1 score (d), 10 chapters of 50.
   See docs/LEVELS-500-PLAN.md for the 200->500 expansion and
   tools/fix-hitch-levels.mjs for the hitch tow/trailer adjacency fix
   (the 8 hitch levels were regenerated in place at their same indices —
   nothing else here changed). */

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
