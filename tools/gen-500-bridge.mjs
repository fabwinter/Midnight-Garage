#!/usr/bin/env node
/* Targeted supplemental generation for the d20-44 gap in the 200->500
   expansion (see docs/LEVELS-500-PLAN.md). Rather than resampling from
   scratch (slow, mostly yields trivial boards that need re-hardening
   from zero), this reharden's the EXISTING campaign's own strongest
   boards further with more wall headroom (wallMax up to 8) — reusing
   already-decent seeds is much more efficient than starting from random
   weak samples. */
import { writeFileSync, readFileSync } from 'node:fs';
import { mulberry32, hashStr } from '../js/rng.js';
import { harden, harvestShape } from '../js/generate.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i+1]) : dflt; };
const HARDEN_STEPS = opt('steps', 400);
const WALL_MAX = opt('wallmax', 8);
const HARVEST_MAX_STATES = opt('harveststates', 500000);
const TAKE = opt('take', 60);

const lvMod = await import('../js/levels.data.js');
const seeds = [...lvMod.LEVELS].sort((a,b) => b.d - a.d).slice(0, TAKE);
console.log(`Rehardening top ${seeds.length} existing boards by score (wallMax=${WALL_MAX}, steps=${HARDEN_STEPS})…`);

const t0 = Date.now();
const out = [];
const seenKeys = new Set();
const pushUnique = lv => { if(!seenKeys.has(lv.key)){ seenKeys.add(lv.key); out.push(lv); } };

seeds.forEach((lv, i) => {
  const seedLv = { m: lv.m, d: lv.d, p: lv.p, w: lv.w || [], key: 'seed:' + i };
  const rng = mulberry32(hashStr(`mg-bridge:${i}`));
  const hard = harden(seedLv, rng, HARDEN_STEPS, null, WALL_MAX);
  pushUnique(hard);
  const harvested = harvestShape(hard, { maxStates: HARVEST_MAX_STATES, harvestCount: 6 });
  harvested.forEach(pushUnique);
  console.log(`  ${i + 1}/${seeds.length} seed par ${lv.m}->${hard.m} (${((Date.now()-t0)/1000).toFixed(1)}s, pool ${out.length})`);
});

writeFileSync('.genwork/bridge-pool.json', JSON.stringify(out));
console.log(`Wrote ${out.length} boards to .genwork/bridge-pool.json (${((Date.now()-t0)/1000).toFixed(1)}s)`);
const byBucket = {};
out.forEach(l => { const b = Math.floor(l.d/5)*5; (byBucket[b] ??= []).push(l); });
Object.keys(byBucket).map(Number).sort((a,b)=>a-b).forEach(b => console.log(`  d ${b}-${b+5}: ${byBucket[b].length}`));
