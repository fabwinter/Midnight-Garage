#!/usr/bin/env node
/* Hill-climbs the existing hitch/gate pools up into the par range chapters
   4-10 actually need (18-60) — see docs/VARIETY-PLAN.md §4/§10. Native
   generation (tools/gen-hitch-pool.mjs / gen-gate-pool.mjs) tops out around
   par 15-18; this is the separate, slower step the plan always called out
   ("a background run of an hour is fine and normal for this repo's
   tooling").

   Seeds from the highest-par boards already in each pool, runs
   js/generate.js's feature-aware harden() with a `collect` array so every
   improving step along the hill-climb is kept (not just the final board) —
   that's what fills the FULL par range 18-60 in one pass, not just the
   endpoint. Chains multiple independent harden() runs per seed (same
   pattern as tools/gen-500-native.mjs) since a single climb can plateau
   before reaching the target range.

   Merges the result into the existing pool files (union, deduped by key)
   rather than overwriting — a partial/interrupted run still leaves the
   pool strictly better than before it started.

   Usage:
     node tools/harden-variety-pools.mjs [--seeds 40] [--steps 600] [--passes 3]
     node tools/harden-variety-pools.mjs --only hitch
     node tools/harden-variety-pools.mjs --only gate */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashStr } from '../js/rng.js';
import { harden } from '../js/generate.js';
import { solve } from '../js/solver.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const SEEDS = opt('seeds', 40);        // top-N highest-par boards to climb from, per pool
const STEPS = opt('steps', 600);       // harden() steps per pass
const PASSES = opt('passes', 3);       // independent harden chains per seed
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;   // 'hitch' | 'gate' | null (both)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.genwork');
mkdirSync(WORK, { recursive: true });

const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

function loadPool(name){
  try{ return JSON.parse(readFileSync(join(WORK, name), 'utf8')); }
  catch{ return []; }
}

function reverify(lv, featureKey){
  // harden() already re-verifies internally before returning, but a merged
  // pool file is worth trusting independently of that call's internals —
  // cheap insurance against a future harden() refactor silently skipping it.
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const sol = solve(pieces, { walls: lv.w, gates: lv.g, hitches: lv.h, maxStates: 400000 });
  return sol.solvable && sol.optimal === lv.m;
}

function hardenPool(poolFile, featureKey, label){
  const pool = loadPool(poolFile);
  if(!pool.length){
    console.log(`[${label}] no existing pool at .genwork/${poolFile} — run tools/gen-${label}-pool.mjs first.`);
    return;
  }
  console.log(`[${label}] loaded ${pool.length} boards, par ${Math.min(...pool.map(l => l.m))}-${Math.max(...pool.map(l => l.m))}`);

  const seeds = [...pool].sort((a, b) => b.m - a.m).slice(0, SEEDS);
  console.log(`[${label}] climbing from top ${seeds.length} seeds, ${PASSES} passes x ${STEPS} steps each…`);

  const seenKeys = new Set(pool.map(l => l.key));
  const merged = pool.slice();
  let added = 0;

  seeds.forEach((seed, si) => {
    let cur = seed;
    const collected = [];
    for(let pass = 0; pass < PASSES; pass++){
      const rng = mulberry32(hashStr(`mg-variety-harden:${label}:${si}:${pass}`));
      cur = harden(cur, rng, STEPS, collected, 0);   // wallMax=0: don't add roadworks to feature boards
    }
    collected.push(cur);
    collected.forEach(lv => {
      if(seenKeys.has(lv.key)) return;
      if(!reverify(lv, featureKey)) return;
      seenKeys.add(lv.key);
      merged.push(lv);
      added++;
    });
    if((si + 1) % 5 === 0 || si === seeds.length - 1){
      const pars = merged.map(l => l.m);
      console.log(`  [${label}] ${si + 1}/${seeds.length} seeds climbed (${elapsed()}) — pool now ${merged.length} (+${added}), par up to ${Math.max(...pars)}`);
    }
  });

  writeFileSync(join(WORK, poolFile), JSON.stringify(merged));
  const hist = {};
  merged.forEach(l => { const b = Math.floor(l.m / 5) * 5; hist[b] = (hist[b] || 0) + 1; });
  console.log(`[${label}] done: ${merged.length} boards (+${added} new), par histogram:`,
    Object.keys(hist).map(Number).sort((a, b) => a - b).map(b => `${b}-${b + 4}:${hist[b]}`).join('  '));
}

if(!ONLY || ONLY === 'hitch') hardenPool('hitch-pool.json', 'h', 'hitch');
if(!ONLY || ONLY === 'gate') hardenPool('gate-pool.json', 'g', 'gate');

console.log(`\nTotal time: ${elapsed()}`);
