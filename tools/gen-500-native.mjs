#!/usr/bin/env node
/* Supplemental native generation for the 200->500 level expansion
   (docs/LEVELS-500-PLAN.md). The existing 200 campaign levels + the
   unclaimed Fogleman reserve (scored by tools/score-fogleman-reserve.mjs)
   naturally split right around d=44: existing/native content covers
   d 6.5-40.8, Fogleman covers d 41-73. This run fills MORE native
   supply in that d 6-44 range (varied wall density 0-6, not the
   original's 0-3) so chapters 1-6 of the new 500-level curve have real
   variety instead of reusing only the original 200's density. */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { mulberry32, hashStr } from '../js/rng.js';
import { tryGenerate, harden, harvestShape } from '../js/generate.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i+1]) : dflt; };
const TARGET_CANDIDATES = opt('candidates', 4000);
const HARDEN_SEEDS = opt('harden', 500);
const HARDEN_STEPS = opt('steps', 300);
const WALL_MAX = opt('wallmax', 6);
const HARVEST_MAX_STATES = opt('harveststates', 400000);

mkdirSync('.genwork', { recursive: true });
const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

console.log(`Sampling ${TARGET_CANDIDATES} candidates (wall 0-${WALL_MAX % 4 <= 3 ? 3 : WALL_MAX})…`);
const seen = new Set();
const pool = [];
for(let seed = 1, attempts = 0; pool.length < TARGET_CANDIDATES && attempts < TARGET_CANDIDATES * 60; seed++){
  attempts++;
  const rng = mulberry32(hashStr('mg-500-batch:' + seed));
  const lv = tryGenerate(rng, { minOptimal: 2, walls: seed % 5 });   // 0-4 walls at sample time
  if(!lv || seen.has(lv.key)) continue;
  seen.add(lv.key);
  pool.push(lv);
}
console.log(`Sampled ${pool.length} unique boards (${elapsed()}).`);

const seeds = [...pool].sort((a,b) => b.m - a.m || b.d - a.d).slice(0, HARDEN_SEEDS);
console.log(`Hardening + harvesting ${seeds.length} seeds (wallMax=${WALL_MAX})…`);
const out = [];
const seenKeys = new Set(pool.map(l => l.key));
const pushUnique = lv => { if(!seenKeys.has(lv.key)){ seenKeys.add(lv.key); out.push(lv); } };

seeds.forEach((lv, i) => {
  const rng = mulberry32(hashStr(`mg-500-harden:${i}`));
  let hard = harden(lv, rng, HARDEN_STEPS, null, WALL_MAX);
  if(hard.m < 15) hard = harden(hard, mulberry32(hashStr(`mg-500-harden2:${i}`)), HARDEN_STEPS, null, WALL_MAX);
  pushUnique(hard);
  const harvested = harvestShape(hard, { maxStates: HARVEST_MAX_STATES, harvestCount: 6 });
  harvested.forEach(pushUnique);
  if((i + 1) % 50 === 0) console.log(`  ${i + 1}/${seeds.length} (${elapsed()}, harvested pool ${out.length})`);
});

const all = [...pool, ...out];
const uniq = [...new Map(all.map(l => [l.key, l])).values()];
writeFileSync('.genwork/native-500-pool.json', JSON.stringify(uniq));
console.log(`Total unique pool: ${uniq.length} (${elapsed()})`);

const byBucket = {};
uniq.forEach(l => { const b = Math.floor(l.d/5)*5; (byBucket[b] ??= []).push(l); });
Object.keys(byBucket).map(Number).sort((a,b)=>a-b).forEach(b => console.log(`  d ${b}-${b+5}: ${byBucket[b].length}`));
