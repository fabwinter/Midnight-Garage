#!/usr/bin/env node
/* Batch level generation (plan item 0.3): produce 200 verified levels,
   curved by the difficulty model — not raw move count — and split into
   4 chapters × 50. Output: js/levels.data.js (checked in; the game ships
   static content, generation happens offline).

   Pipeline (stages so hardening can run as parallel shards):
     sample  — thousands of random solvable boards (skews easy)
     harden  — hill-climb a slice toward hard "shapes", then map each
               shape's FULL reachable configuration space exactly
               (js/generate.js harvestShape) — one good shape supplies a
               harder capstone than the climb found on its own, plus a
               free spread of verified levels across the whole difficulty
               spectrum below it.
     select  — fill per-chapter par bands ordered by model score, re-verify

   Why harden+harvest instead of just hill-climbing harder: tested both.
   Random dense boards mostly aren't even solvable (the hero gets
   permanently trapped) rather than hard. Uncapped-length hill-climbing
   (2500+ steps) is much slower per step AND finds WORSE boards than a
   few hundred steps — extra pieces past ~16 make boards easier again, not
   harder, so harden() now caps piece count. The real lever for a higher
   ceiling is BREADTH (many seeds), not per-seed depth — see the comment
   on HARDEN_SEEDS below.

   Run everything:            node tools/generate-levels.mjs
   Or stage by stage:         --stage sample|harden|select
   Shard hardening:           --stage harden --shard 0 --of 4               */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashStr } from '../js/rng.js';
import { tryGenerate, harden, harvestShape } from '../js/generate.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const STAGE = opt('stage', 'all');
const TARGET_CANDIDATES = Number(opt('candidates', 6000));
const HARDEN_SEEDS = Number(opt('harden', 900));   // ~40 min sharded across 4 cores — see header
const HARDEN_STEPS = Number(opt('steps', 380));
const HARVEST_MAX_STATES = Number(opt('harveststates', 600000));
const BASE_SEED = Number(opt('seed', 1));
const SHARD = Number(opt('shard', 0));
const OF = Number(opt('of', 1));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = opt('work', join(ROOT, '.genwork'));

const LEVEL_COUNT = 200;
const PER_CHAPTER = 50;

/* Chapter difficulty bands, recalibrated upward (2026-07) against MEASURED
   supply, not a target number. Calibration runs (300 and 1500 test seeds
   through harden+harvestShape) found the ceiling for this generator's
   regime sits around par 40, and — critically — the tail above ~24 is
   thin and barely grows with more seeds (5x the seeds only bought ~1.3x
   more boards past par 30): this generator's mutation-based hill-climb
   plus exact-shape harvesting is not going to reproduce the famous ~93-
   move result some specific hand-studied 16-piece Rush Hour boards reach
   in exhaustive research — that number comes from a fully enumerated
   configuration space for one particular piece set, not a stochastic
   search. Bands below are sized so `select()` doesn't starve: every band
   has a comfortable multiple of the 50 boards it needs, even in the
   scarce top tier. Still a real, evidence-based jump over the old curve
   (9–12 / 13–16 / 17–20 / 22–90-nominally-but-36-actual): every chapter's
   floor moves up, and Gridlock's floor moves from 22 to 23 with a MUCH
   better-populated 23–40 range backing it, instead of an unreachable
   "maxM: 90" that nothing ever actually filled.

   Gridlock's 40 here is still this generator's own honest ceiling — a
   from-scratch regen produces exactly that. The shipped game reaches
   further: tools/add-fogleman-levels.mjs runs afterward and splices in
   par 41–60 boards imported from Michael Fogleman's exhaustively-
   enumerated database (michaelfogleman.com/rush), raising Gridlock's
   *declared* maxM to 60 in the checked-in js/levels.data.js. Same
   after-the-fact-splice shape as add-hitch-levels.mjs for Neon District. */
const BANDS = [
  { name: 'Night Shift',    accent: '#ffb454', minM: 10, maxM: 14 },
  { name: 'Neon District',  accent: '#4fd2f0', minM: 15, maxM: 18 },
  { name: 'Harbor Freight', accent: '#37c8ab', minM: 19, maxM: 22 },
  { name: 'Gridlock',       accent: '#f26fb1', minM: 23, maxM: 40 },
];
const INTRO_PARS = [6, 8, 8];   // levels 1–3 teach the mechanic, then par ≥ 12 forever

const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
mkdirSync(WORK, { recursive: true });
const poolFile = join(WORK, 'pool.json');

function sample(){
  console.log(`Sampling candidates (target ${TARGET_CANDIDATES})…`);
  const seen = new Set();
  const pool = [];
  let attempts = 0;
  for(let seed = BASE_SEED; pool.length < TARGET_CANDIDATES && attempts < TARGET_CANDIDATES * 60; seed++){
    attempts++;
    const rng = mulberry32(hashStr('mg-batch:' + seed));
    const lv = tryGenerate(rng, { minOptimal: 2, walls: seed % 4 });
    if(!lv || seen.has(lv.key)) continue;
    seen.add(lv.key);
    pool.push(lv);
    if(pool.length % 1000 === 0) console.log(`  ${pool.length} candidates (${elapsed()})`);
  }
  writeFileSync(poolFile, JSON.stringify(pool));
  console.log(`Sampled ${pool.length} unique boards in ${elapsed()}.`);
  return pool;
}

function hardenShard(pool){
  const seeds = [...pool].sort((a, b) => b.m - a.m || b.d - a.d).slice(0, HARDEN_SEEDS);
  const mine = seeds.filter((_, i) => i % OF === SHARD);
  console.log(`Shard ${SHARD}/${OF}: hardening + harvesting ${mine.length} seeds…`);
  const out = [];
  const seenKeys = new Set();
  const pushUnique = lv => { if(!seenKeys.has(lv.key)){ seenKeys.add(lv.key); out.push(lv); } };

  mine.forEach((lv, i) => {
    const rng = mulberry32(hashStr(`mg-harden:${SHARD}:${i}`));
    let hard = harden(lv, rng, HARDEN_STEPS, null, 3);
    if(hard.m < 15){   // genuinely stuck — retry once with a different mutation stream
      hard = harden(hard, mulberry32(hashStr(`mg-harden2:${SHARD}:${i}`)), HARDEN_STEPS, null, 3);
    }
    pushUnique(hard);
    const harvested = harvestShape(hard, { maxStates: HARVEST_MAX_STATES, harvestCount: 5 });
    harvested.forEach(pushUnique);
    if((i + 1) % 25 === 0) console.log(`  shard ${SHARD}: ${i + 1}/${mine.length} (${elapsed()}, pool ${out.length})`);
  });
  writeFileSync(join(WORK, `hard-${SHARD}.json`), JSON.stringify(out));
  const maxPar = out.length ? Math.max(...out.map(l => l.m)) : 0;
  console.log(`Shard ${SHARD} done: ${out.length} boards harvested, max par ${maxPar} (${elapsed()})`);
}

function select(){
  const pool = JSON.parse(readFileSync(poolFile, 'utf8'));
  const seen = new Set(pool.map(l => l.key));
  for(let s = 0; s < 16; s++){
    const f = join(WORK, `hard-${s}.json`);
    if(!existsSync(f)) continue;
    for(const lv of JSON.parse(readFileSync(f, 'utf8'))){
      if(!seen.has(lv.key)){ seen.add(lv.key); pool.push(lv); }
    }
  }
  const maxPar = Math.max(...pool.map(l => l.m));
  console.log(`Pool: ${pool.length} boards, par up to ${maxPar}.`);

  /* Intro ramp: levels 1–3 at the scripted pars, easiest boards by model
     score so the mechanic is taught before the difficulty curve begins. */
  const used = new Set();
  const intro = INTRO_PARS.map(par => {
    const cand = pool
      .filter(lv => !used.has(lv.key) && lv.m === par && !(lv.w && lv.w.length))
      .sort((a, b) => a.d - b.d)[0];
    if(!cand) throw new Error(`No intro board with par ${par}. Increase --candidates.`);
    used.add(cand.key);
    return cand;
  });

  /* Band fill: prefer the top of each band's score range for later chapters,
     an even spread for earlier ones, and never reuse a board. Chapters fill
     LAST-first so each earlier chapter can cap its scores just below where
     the next chapter starts — no "level 51 feels easier than level 50". */
  const BOUNDARY_SLACK = 3;   // must match the verify-levels.mjs boundary check
  const chapters = [];
  let nextStartScore = Infinity;
  for(let ci = BANDS.length - 1; ci >= 0; ci--){
    const band = BANDS[ci];
    const slots = PER_CHAPTER - (ci === 0 ? intro.length : 0);
    const inBand = pool
      .filter(lv => !used.has(lv.key) && lv.m >= band.minM && lv.m <= band.maxM
                    && lv.d <= nextStartScore + BOUNDARY_SLACK)
      .sort((a, b) => a.d - b.d || a.m - b.m);
    if(inBand.length < slots){
      throw new Error(`Chapter ${ci + 1} (${band.name}): only ${inBand.length} boards in par band ${band.minM}–${band.maxM} under score ${nextStartScore + BOUNDARY_SLACK}. Increase --candidates/--harden.`);
    }
    const picks = [];
    if(ci >= 2){
      picks.push(...inBand.slice(-slots));
    } else {
      for(let j = 0; j < slots; j++){
        picks.push(inBand[Math.min(inBand.length - 1, Math.floor(inBand.length * (j + 0.5) / slots))]);
      }
    }
    const distinct = [...new Map(picks.map(l => [l.key, l])).values()];
    for(let k = inBand.length - 1; distinct.length < slots && k >= 0; k--){
      if(!distinct.some(l => l.key === inBand[k].key)) distinct.push(inBand[k]);
    }
    distinct.sort((a, b) => a.d - b.d || a.m - b.m);
    const final = (ci === 0 ? [...intro, ...distinct.slice(0, slots)] : distinct.slice(0, slots));
    final.forEach(l => used.add(l.key));
    nextStartScore = final[ci === 0 ? intro.length : 0].d;
    chapters[ci] = final;
  }

  const chosen = chapters.flat();
  if(chosen.length !== LEVEL_COUNT) throw new Error(`Selected ${chosen.length} levels, expected ${LEVEL_COUNT}`);

  console.log('Re-verifying 200 shipped levels…');
  chosen.forEach((lv, i) => {
    const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const sol = solve(pieces, { walls: lv.w });
    if(!sol.solvable || sol.optimal !== lv.m){
      throw new Error(`Level ${i + 1} failed verification (par ${lv.m}, solved ${sol.optimal})`);
    }
    if(i >= INTRO_PARS.length && lv.m < BANDS[0].minM){
      throw new Error(`Level ${i + 1} has par ${lv.m}; nothing below par ${BANDS[0].minM} is allowed after the intro ramp`);
    }
  });
  console.log('All verified.');

  const levelsJs = `/* AUTO-GENERATED by tools/generate-levels.mjs — do not edit by hand.
   ${LEVEL_COUNT} levels, verified optimal (m = par), curved by difficulty
   model v1 score (d). Chapters are palette-swap themed for now (full
   environments arrive in v1.5 per the sequencing plan). */

export const CHAPTER_SIZE = ${PER_CHAPTER};

/* Levels 1–INTRO ease in below chapter 1's floor; every later level needs ≥ minM moves. */
export const INTRO = ${INTRO_PARS.length};

export const CHAPTERS = ${JSON.stringify(
    BANDS.map((b, i) => ({ name: b.name, accent: b.accent, from: i * PER_CHAPTER, minM: b.minM, maxM: b.maxM })), null, 2)};

export const LEVELS = [
${chosen.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}) })).join(',\n')}
];
`;

  const out = join(ROOT, 'js', 'levels.data.js');
  writeFileSync(out, levelsJs);

  BANDS.forEach((b, i) => {
    const s = chapters[i];
    const ms = s.map(l => l.m), ds = s.map(l => l.d);
    console.log(`  Ch${i + 1} ${b.name}: par ${Math.min(...ms)}–${Math.max(...ms)}, score ${Math.min(...ds)}–${Math.max(...ds)}`);
  });
  console.log(`Wrote ${out} (${elapsed()})`);
}

if(STAGE === 'sample') sample();
else if(STAGE === 'harden') hardenShard(JSON.parse(readFileSync(poolFile, 'utf8')));
else if(STAGE === 'select') select();
else { sample(); hardenShard(JSON.parse(readFileSync(poolFile, 'utf8'))); select(); }
