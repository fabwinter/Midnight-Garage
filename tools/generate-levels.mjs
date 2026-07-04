#!/usr/bin/env node
/* Batch level generation (plan item 0.3): produce 200 verified levels,
   curved by the difficulty model — not raw move count — and split into
   4 chapters × 50. Output: js/levels.data.js (checked in; the game ships
   static content, generation happens offline).

   Pipeline (stages so hardening can run as parallel shards):
     sample  — thousands of random solvable boards (skews easy) → pool file
     harden  — hill-climb a slice of the pool toward long solutions
     select  — fill per-chapter par bands ordered by model score, re-verify
   Run everything:            node tools/generate-levels.mjs
   Or stage by stage:         --stage sample|harden|select
   Shard hardening:           --stage harden --shard 0 --of 4               */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashStr } from '../js/rng.js';
import { tryGenerate, harden } from '../js/generate.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const STAGE = opt('stage', 'all');
const TARGET_CANDIDATES = Number(opt('candidates', 5000));
const HARDEN_SEEDS = Number(opt('harden', 280));
const HARDEN_STEPS = Number(opt('steps', 100));
const BASE_SEED = Number(opt('seed', 1));
const SHARD = Number(opt('shard', 0));
const OF = Number(opt('of', 1));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = opt('work', join(ROOT, '.genwork'));

const LEVEL_COUNT = 200;
const PER_CHAPTER = 50;

/* Chapter difficulty bands by par (optimal moves). Within a band the
   ordering — and the choice of which 50 ship — comes from the model score. */
const BANDS = [
  { name: 'Night Shift',    accent: '#ffb454', minM: 2,  maxM: 8 },
  { name: 'Neon District',  accent: '#4fd2f0', minM: 7,  maxM: 13 },
  { name: 'Harbor Freight', accent: '#37c8ab', minM: 10, maxM: 17 },
  { name: 'Gridlock',       accent: '#f26fb1', minM: 14, maxM: 60 },
];

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
    const lv = tryGenerate(rng, { minOptimal: 2 });
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
  const seeds = pool.filter(lv => lv.m >= 5).slice(-HARDEN_SEEDS);
  const mine = seeds.filter((_, i) => i % OF === SHARD);
  console.log(`Shard ${SHARD}/${OF}: hardening ${mine.length} seeds…`);
  const out = [];
  mine.forEach((lv, i) => {
    // lower state cap while climbing: boards needing >150k states to solve
    // are too slow to iterate on and rarely fun anyway
    const rng = mulberry32(hashStr(`mg-harden:${SHARD}:${i}`));
    const hard = harden(lv, rng, HARDEN_STEPS, { maxStates: 150000 });
    if(hard !== lv) out.push(hard);
    if((i + 1) % 20 === 0) console.log(`  shard ${SHARD}: ${i + 1}/${mine.length} (${elapsed()})`);
  });
  writeFileSync(join(WORK, `hard-${SHARD}.json`), JSON.stringify(out));
  console.log(`Shard ${SHARD} done: ${out.length} hardened boards (${elapsed()})`);
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

  /* Bands overlap, and later chapters want the deep end — allocate from
     the hardest chapter down so Gridlock isn't starved by Harbor Freight. */
  const used = new Set();
  const chapters = [];
  for(const ci of [3, 2, 1, 0]){
    const band = BANDS[ci];
    // keep the model-score curve monotonic across the chapter boundary:
    // nothing in this chapter may outscore the next chapter's opening level
    const scoreCap = ci < 3 ? chapters[ci + 1][0].d + 2 : Infinity;
    chapters[ci] = pickBand(band, ci, pool, used, scoreCap);
  }

  function pickBand(band, ci, pool, used, scoreCap){
    const inBand = pool
      .filter(lv => !used.has(lv.key) && lv.m >= band.minM && lv.m <= band.maxM && lv.d <= scoreCap)
      .sort((a, b) => a.d - b.d || a.m - b.m);
    if(inBand.length < PER_CHAPTER){
      throw new Error(`Chapter ${ci + 1} (${band.name}): only ${inBand.length} boards in par band ${band.minM}–${band.maxM}. Increase --candidates/--harden.`);
    }
    // Later chapters take the hardest 50 of the band; earlier ones spread evenly.
    const picks = [];
    if(ci >= 2){
      picks.push(...inBand.slice(-PER_CHAPTER));
    } else {
      for(let j = 0; j < PER_CHAPTER; j++){
        picks.push(inBand[Math.min(inBand.length - 1, Math.floor(inBand.length * (j + 0.5) / PER_CHAPTER))]);
      }
    }
    const distinct = [...new Map(picks.map(l => [l.key, l])).values()];
    for(let k = inBand.length - 1; distinct.length < PER_CHAPTER && k >= 0; k--){
      if(!distinct.some(l => l.key === inBand[k].key)) distinct.push(inBand[k]);
    }
    distinct.sort((a, b) => a.d - b.d || a.m - b.m);
    const final = distinct.slice(0, PER_CHAPTER);
    final.forEach(l => used.add(l.key));
    return final;
  }

  const chosen = chapters.flat();
  if(chosen.length !== LEVEL_COUNT) throw new Error(`Selected ${chosen.length} levels, expected ${LEVEL_COUNT}`);

  console.log('Re-verifying 200 shipped levels…');
  chosen.forEach((lv, i) => {
    const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const sol = solve(pieces);
    if(!sol.solvable || sol.optimal !== lv.m){
      throw new Error(`Level ${i + 1} failed verification (par ${lv.m}, solved ${sol.optimal})`);
    }
  });
  console.log('All verified.');

  const levelsJs = `/* AUTO-GENERATED by tools/generate-levels.mjs — do not edit by hand.
   ${LEVEL_COUNT} levels, verified optimal (m = par), curved by difficulty
   model v1 score (d). Chapters are palette-swap themed for now (full
   environments arrive in v1.5 per the sequencing plan). */

export const CHAPTER_SIZE = ${PER_CHAPTER};

export const CHAPTERS = ${JSON.stringify(
    BANDS.map((b, i) => ({ name: b.name, accent: b.accent, from: i * PER_CHAPTER })), null, 2)};

export const LEVELS = [
${chosen.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p })).join(',\n')}
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
