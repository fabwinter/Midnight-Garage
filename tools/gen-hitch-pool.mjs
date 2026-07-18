#!/usr/bin/env node
/* Sample hitch-puzzle candidates (js/generate.js: tryGenerateHitch) into
   .genwork/hitch-pool.json for tools/add-hitch-levels.mjs to pick from.
   Deterministic given BASE_SEED, same spirit as generate-levels.mjs's
   sample stage — just a dedicated, much smaller pool since hitch levels
   are hand-shaped (tow+trailer placed deliberately) rather than uniform
   random, so they don't need harden()/harvestShape()'s machinery to reach
   a useful difficulty spread. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashStr } from '../js/rng.js';
import { tryGenerateHitch } from '../js/generate.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const ATTEMPTS = opt('attempts', 20000);
const MIN_OPTIMAL = opt('minOptimal', 9);
const BASE_SEED = opt('seed', 1);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.genwork');
mkdirSync(WORK, { recursive: true });

const t0 = Date.now();
const seen = new Set();
const pool = [];
for(let seed = BASE_SEED; seed <= BASE_SEED + ATTEMPTS; seed++){
  const rng = mulberry32(hashStr('mg-hitch:' + seed));
  const pieces = 6 + (seed % 8);   // 6..13 filler pieces
  const lv = tryGenerateHitch(rng, { minOptimal: MIN_OPTIMAL, pieces });
  if(!lv || seen.has(lv.key)) continue;
  seen.add(lv.key);
  pool.push(lv);
  if(pool.length % 50 === 0) console.log(`  ${pool.length} found (${((Date.now() - t0) / 1000).toFixed(0)}s, seed ${seed - BASE_SEED}/${ATTEMPTS})`);
}

writeFileSync(join(WORK, 'hitch-pool.json'), JSON.stringify(pool));
const pars = pool.map(l => l.m).sort((a, b) => a - b);
const hist = {};
for(const p of pars) hist[p] = (hist[p] || 0) + 1;
console.log(`\nDone: ${pool.length} unique hitch levels in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('par histogram:', Object.keys(hist).map(Number).sort((a, b) => a - b).map(p => `${p}:${hist[p]}`).join('  '));
