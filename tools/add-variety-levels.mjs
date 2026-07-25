#!/usr/bin/env node
/* Replace plain (feature-free) campaign levels with hitch/gate boards.
   In-place replacement (same array indices) to avoid save-progress migration.
   Pattern: for each chapter, target plain boards spread throughout the chapter,
   replace with feature boards matching the chapter's par band and exceeding
   the chapter's difficulty-score floor.

   Pools must exist: .genwork/hitch-pool.json and .genwork/gate-pool.json
   (create with tools/gen-hitch-pool.mjs and tools/gen-gate-pool.mjs, then
   harden() to reach target pars).

   Run: node tools/add-variety-levels.mjs [--dry-run] */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, levelKey } from '../js/solver.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS_PATH = join(ROOT, 'js', 'levels.data.js');

const existingMod = await import(LEVELS_PATH + '?t=' + Date.now());
const { CHAPTER_SIZE, INTRO, CHAPTERS, LEVELS } = existingMod;

// Load pools (may not exist yet if this is a dry-run or pools haven't been generated)
let hitchPool = [];
let gatePool = [];
try{
  hitchPool = JSON.parse(readFileSync(join(ROOT, '.genwork', 'hitch-pool.json'), 'utf8'));
} catch {}
try{
  gatePool = JSON.parse(readFileSync(join(ROOT, '.genwork', 'gate-pool.json'), 'utf8'));
} catch {}

console.log(`Loaded ${hitchPool.length} hitch + ${gatePool.length} gate boards`);

// Per-chapter distribution targets from docs/VARIETY-PLAN (§2)
const TARGETS = {
  0: { h: 0, g: 0 },   // Night Shift: stays pure
  1: { h: 6, g: 4 },   // Neon District
  2: { h: 6, g: 5 },   // Harbor Freight
  3: { h: 6, g: 5 },   // Gridlock
  4: { h: 5, g: 5 },   // Overpass
  5: { h: 5, g: 5 },   // Freight Yard
  6: { h: 4, g: 5 },   // Customs
  7: { h: 3, g: 4 },   // Rush Hour
  8: { h: 3, g: 4 },   // The Syndicate
  9: { h: 2, g: 3 },   // Vault Row
};

// For each chapter, identify plain (feature-free) boards to replace
// Skip INTRO, spread replacements throughout the chapter
const replacements = {};   // idx -> { par, d, board }
const skipped = [];

// Pre-compute each chapter's current difficulty floor
const chapterFloors = CHAPTERS.map((ch, chIdx) => {
  const start = chIdx * CHAPTER_SIZE;
  const end = start + CHAPTER_SIZE;
  return Math.min(...LEVELS.slice(start, end).map(l => l.d));
});

// Build set of existing campaign board keys to prevent duplicates
const campaignKeys = new Set();
LEVELS.forEach(lv => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const key = levelKey(pieces, lv.w || []);
  campaignKeys.add(key);
});

CHAPTERS.forEach((ch, chIdx) => {
  const targets = TARGETS[chIdx] ?? { h: 0, g: 0 };
  const start = chIdx * CHAPTER_SIZE;
  const end = start + CHAPTER_SIZE;
  const plain = [];

  for(let i = start; i < end; i++){
    if(i < INTRO) continue;   // never touch INTRO ramp
    const lv = LEVELS[i];
    if(!lv.h && !lv.g) plain.push(i);   // no feature
  }

  const targetList = [];

  // Spread selections across the chapter, avoiding clusters
  if(targets.h > 0){
    const step = Math.max(1, Math.floor(plain.length / targets.h));
    for(let i = 0; i < plain.length && targetList.length < targets.h; i += step){
      targetList.push({ idx: plain[i], type: 'hitch' });
    }
  }
  if(targets.g > 0){
    const step = Math.max(1, Math.floor((plain.length - targetList.length) / targets.g));
    let step_i = 0;
    for(let i = 0; i < plain.length && targetList.length < targets.h + targets.g; i++){
      if(!targetList.some(t => t.idx === plain[i])){
        if(step_i++ % step === 0){
          targetList.push({ idx: plain[i], type: 'gate' });
        }
      }
    }
  }

  targetList.forEach(t => {
    const lv = LEVELS[t.idx];
    const pool = t.type === 'hitch' ? hitchPool : gatePool;
    if(!pool.length){
      skipped.push(`${ch.name} slot ${t.idx + 1}: no ${t.type} boards in pool`);
      return;
    }
    // Find best par/difficulty match in this chapter's range + above floor, excluding dups
    const floor = chapterFloors[chIdx];
    const candidates = pool.filter(b => {
      if(b.m < ch.minM || b.m > ch.maxM || b.d < floor) return false;
      // Check if this board already exists in the campaign
      const pieces = b.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
      const key = levelKey(pieces, b.w || []);
      return !campaignKeys.has(key);
    });
    if(!candidates.length){
      skipped.push(`${ch.name} slot ${t.idx + 1}: no ${t.type} boards match par ${ch.minM}–${ch.maxM} and d >= ${floor}`);
      return;
    }
    // Pick one close to chapter midpoint
    const mid = (ch.minM + ch.maxM) / 2;
    candidates.sort((a, b) => Math.abs(a.m - mid) - Math.abs(b.m - mid) || a.d - b.d);
    const picked = candidates[0];

    // Re-verify
    const pieces = picked.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const sol = solve(pieces, { walls: picked.w, gates: picked.g, hitches: picked.h, maxStates: 2000000 });
    if(!sol.solvable || sol.optimal !== picked.m){
      skipped.push(`${ch.name} slot ${t.idx + 1}: re-verification failed`);
      return;
    }

    replacements[t.idx] = picked;
    // Mark this board as used in this run to prevent duplicate picks
    const pickedKey = levelKey(pieces, picked.w || []);
    campaignKeys.add(pickedKey);
    console.log(`✓ slot ${t.idx + 1} (${ch.name}): ${t.type} par ${lv.m} → ${picked.m}, d ${lv.d} → ${picked.d}`);
  });
});

if(skipped.length) console.log('Skipped:', skipped.join('; '));

const newLevels = LEVELS.slice();
Object.entries(replacements).forEach(([idxStr, board]) => {
  const idx = Number(idxStr);
  newLevels[idx] = { m: board.m, d: board.d, p: board.p, ...(board.w?.length ? { w: board.w } : {}), ...(board.h ? { h: board.h } : {}), ...(board.g ? { g: board.g } : {}) };
});

if(DRY_RUN){
  console.log(`\n--dry-run: not writing js/levels.data.js. Would replace ${Object.keys(replacements).length} levels.`);
  process.exit(0);
}

if(Object.keys(replacements).length === 0){
  console.log('\nNo replacements made.');
  process.exit(0);
}

const levelsJs = `/* AUTO-GENERATED — do not edit by hand. 500 levels, verified optimal
   (m = par), curved by difficulty model v1 score (d), 10 chapters of 50.
   See docs/LEVELS-500-PLAN.md for the 200->500 expansion,
   tools/fix-hitch-levels.mjs for hitch tow/trailer adjacency,
   tools/fix-hitch-levels-v2.mjs for the unhitched-trailer-immobility fix,
   and tools/add-variety-levels.mjs for gate/hitch variety integration. */

export const CHAPTER_SIZE = ${CHAPTER_SIZE};

/* Levels 1-INTRO ease in below chapter 1's floor; every later level needs >= chapter 1's floor. */
export const INTRO = ${INTRO};

export const CHAPTERS = ${JSON.stringify(CHAPTERS, null, 2)};

export const LEVELS = [
${newLevels.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}), ...(lv.h ? { h: lv.h } : {}), ...(lv.g ? { g: lv.g } : {}) })).join(',\n')}
];
`;
writeFileSync(LEVELS_PATH, levelsJs);
console.log(`\nWrote ${LEVELS_PATH}.`);
