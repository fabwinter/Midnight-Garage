#!/usr/bin/env node
/* Batch level generation (plan item 0.3): produce 200 verified levels,
   curved by the difficulty model — not raw move count — and split into
   4 chapters × 50. Output: js/levels.data.js (checked in; the game ships
   static content, generation happens offline).

   Pipeline:
     1. Sample thousands of random solvable boards (skews easy).
     2. Hill-climb ("harden") a slice of them to fill the hard end.
     3. Fill per-chapter par bands, ordered by composite difficulty score.
     4. Re-solve every shipped level and assert par == optimal.

   Usage: node tools/generate-levels.mjs [--candidates 5000] [--seed 1] */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashStr } from '../js/rng.js';
import { tryGenerate, harden } from '../js/generate.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const TARGET_CANDIDATES = opt('candidates', 5000);
const HARDEN_SEEDS = opt('harden', 220);
const HARDEN_STEPS = opt('steps', 140);
const BASE_SEED = opt('seed', 1);
const LEVEL_COUNT = 200;
const PER_CHAPTER = 50;

/* Chapter difficulty bands by par (optimal moves). Bands are strict and
   non-overlapping so each chapter is genuinely harder than the last; within
   a band the ordering — and the choice of which 50 ship — comes from the
   model score. Levels 1–3 are the intro ramp (INTRO_PARS) and are the ONLY
   levels allowed below par 5. */
const BANDS = [
  { name: 'Night Shift',    accent: '#ffb454', minM: 5,  maxM: 8 },
  { name: 'Neon District',  accent: '#4fd2f0', minM: 8,  maxM: 13 },
  { name: 'Harbor Freight', accent: '#37c8ab', minM: 13, maxM: 19 },
  { name: 'Gridlock',       accent: '#f26fb1', minM: 19, maxM: 60 },
];
const INTRO_PARS = [3, 4, 4];   // levels 1–3 teach the mechanic, then par ≥ 5 forever

const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

console.log(`Sampling candidates (target ${TARGET_CANDIDATES})…`);
const seen = new Set();
const pool = [];
let attempts = 0;
for(let seed = BASE_SEED; pool.length < TARGET_CANDIDATES && attempts < TARGET_CANDIDATES * 60; seed++){
  attempts++;
  const rng = mulberry32(hashStr('mg-batch:' + seed));
  const lv = tryGenerate(rng, { minOptimal: 2 });
  if(!lv || seen.has(lv.key)) continue;
  seen.add(lv.key);
  pool.push(lv);
  if(pool.length % 1000 === 0) console.log(`  ${pool.length} candidates (${elapsed()})`);
}
console.log(`Sampled ${pool.length} unique boards in ${elapsed()}.`);

console.log(`Hardening ${HARDEN_SEEDS} seeds for the deep end…`);
const hardSeeds = [...pool].sort((a, b) => b.m - a.m || b.d - a.d).slice(0, HARDEN_SEEDS);
hardSeeds.forEach((lv, i) => {
  const trail = [];   // every improvement along the climb — fills the mid bands
  const rng = mulberry32(hashStr('mg-harden:' + i));
  let hard = harden(lv, rng, HARDEN_STEPS, trail);
  if(hard.m < BANDS[3].minM){  // stuck climb — restart with a different mutation stream
    hard = harden(hard, mulberry32(hashStr('mg-harden2:' + i)), HARDEN_STEPS, trail);
  }
  for(const t of trail){
    if(!seen.has(t.key)){
      seen.add(t.key);
      pool.push(t);
    }
  }
  if((i + 1) % 50 === 0) console.log(`  ${i + 1}/${hardSeeds.length} hardened (${elapsed()})`);
});
const maxPar = Math.max(...pool.map(l => l.m));
console.log(`Pool: ${pool.length} boards, par up to ${maxPar}.`);

/* Intro ramp: levels 1–3 at the scripted pars, easiest boards by model
   score so the mechanic is taught before the difficulty curve begins. */
const used = new Set();
const intro = INTRO_PARS.map(par => {
  const cand = pool
    .filter(lv => !used.has(lv.key) && lv.m === par)
    .sort((a, b) => a.d - b.d)[0];
  if(!cand) throw new Error(`No intro board with par ${par}. Increase --candidates.`);
  used.add(cand.key);
  return cand;
});

/* Band fill: prefer the top of each band's score range for later chapters,
   an even spread for earlier ones, and never reuse a board. */
const chapters = BANDS.map((band, ci) => {
  const slots = PER_CHAPTER - (ci === 0 ? intro.length : 0);
  const inBand = pool
    .filter(lv => !used.has(lv.key) && lv.m >= band.minM && lv.m <= band.maxM)
    .sort((a, b) => a.d - b.d || a.m - b.m);
  if(inBand.length < slots){
    throw new Error(`Chapter ${ci + 1} (${band.name}): only ${inBand.length} boards in par band ${band.minM}–${band.maxM}. Increase --candidates/--harden.`);
  }
  // Later chapters take the hardest of the band; earlier ones spread evenly.
  const picks = [];
  if(ci >= 2){
    picks.push(...inBand.slice(-slots));
  } else {
    for(let j = 0; j < slots; j++){
      picks.push(inBand[Math.min(inBand.length - 1, Math.floor(inBand.length * (j + 0.5) / slots))]);
    }
  }
  const distinct = [...new Map(picks.map(l => [l.key, l])).values()];
  // top up with unused neighbours if even-spacing collided
  for(let k = inBand.length - 1; distinct.length < slots && k >= 0; k--){
    if(!distinct.some(l => l.key === inBand[k].key)) distinct.push(inBand[k]);
  }
  distinct.sort((a, b) => a.d - b.d || a.m - b.m);
  const final = (ci === 0 ? [...intro, ...distinct.slice(0, slots)] : distinct.slice(0, slots));
  final.forEach(l => used.add(l.key));
  return final;
});

const chosen = chapters.flat();
if(chosen.length !== LEVEL_COUNT) throw new Error(`Selected ${chosen.length} levels, expected ${LEVEL_COUNT}`);

console.log('Re-verifying 200 shipped levels…');
chosen.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const sol = solve(pieces);
  if(!sol.solvable || sol.optimal !== lv.m){
    throw new Error(`Level ${i + 1} failed verification (par ${lv.m}, solved ${sol.optimal})`);
  }
  if(i >= INTRO_PARS.length && lv.m < 5){
    throw new Error(`Level ${i + 1} has par ${lv.m}; nothing below par 5 is allowed after the intro ramp`);
  }
});
console.log('All verified.');

const levelsJs = `/* AUTO-GENERATED by tools/generate-levels.mjs — do not edit by hand.
   ${LEVEL_COUNT} levels, verified optimal (m = par), curved by difficulty
   model v1 score (d). Chapters are palette-swap themed for now (full
   environments arrive in v1.5 per the sequencing plan). */

export const CHAPTER_SIZE = ${PER_CHAPTER};

/* Levels 1–INTRO levels ease in below par 5; every later level needs ≥ minM moves. */
export const INTRO = ${INTRO_PARS.length};

export const CHAPTERS = ${JSON.stringify(
  BANDS.map((b, i) => ({ name: b.name, accent: b.accent, from: i * PER_CHAPTER, minM: b.minM, maxM: b.maxM })), null, 2)};

export const LEVELS = [
${chosen.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p })).join(',\n')}
];
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'levels.data.js');
writeFileSync(out, levelsJs);

BANDS.forEach((b, i) => {
  const s = chapters[i];
  const ms = s.map(l => l.m), ds = s.map(l => l.d);
  console.log(`  Ch${i + 1} ${b.name}: par ${Math.min(...ms)}–${Math.max(...ms)}, score ${Math.min(...ds)}–${Math.max(...ds)}`);
});
console.log(`Wrote ${out} (${elapsed()})`);
