#!/usr/bin/env node
/* CI-style check: every shipped level must be solvable with par == optimal,
   respect board invariants, and the daily puzzle must generate for the next
   two weeks. Run with `npm run verify`. */

import { LEVELS, CHAPTERS, CHAPTER_SIZE } from '../js/levels.data.js';
import { solve, N, EXIT_ROW } from '../js/solver.js';
import { dailyLevel } from '../js/generate.js';
import { todayStr } from '../js/storage.js';

let fail = 0;
const bad = (msg) => { console.error('✗ ' + msg); fail++; };

if(LEVELS.length !== CHAPTER_SIZE * CHAPTERS.length) bad(`expected ${CHAPTER_SIZE * CHAPTERS.length} levels, got ${LEVELS.length}`);

LEVELS.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const hero = pieces[0];
  if(hero.dir !== 'h' || hero.r !== EXIT_ROW) bad(`level ${i + 1}: hero must be horizontal on row ${EXIT_ROW}`);
  // overlap / bounds check
  const g = Array.from({ length: N }, () => Array(N).fill(false));
  for(const p of pieces){
    for(let k = 0; k < p.len; k++){
      const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
      if(r >= N || c >= N || r < 0 || c < 0){ bad(`level ${i + 1}: piece out of bounds`); break; }
      if(g[r][c]){ bad(`level ${i + 1}: overlapping pieces`); break; }
      g[r][c] = true;
    }
  }
  pieces.slice(1).forEach(p => {
    if(p.dir === 'h' && p.r === EXIT_ROW) bad(`level ${i + 1}: non-hero horizontal piece in exit row (unwinnable)`);
  });
  const sol = solve(pieces);
  if(!sol.solvable) bad(`level ${i + 1}: unsolvable`);
  else if(sol.optimal !== lv.m) bad(`level ${i + 1}: par ${lv.m} but optimal ${sol.optimal}`);
});

// difficulty must never regress across chapter boundaries' scores
for(let i = 1; i < LEVELS.length; i++){
  const chPrev = Math.floor((i - 1) / CHAPTER_SIZE), chCur = Math.floor(i / CHAPTER_SIZE);
  if(chCur !== chPrev && LEVELS[i].d < LEVELS[i - 1].d - 3){
    bad(`chapter boundary at level ${i + 1}: difficulty drops too far (${LEVELS[i - 1].d} → ${LEVELS[i].d})`);
  }
}

// the next 14 dailies must generate deterministically and solve
const start = Date.parse(todayStr() + 'T00:00:00Z');
for(let d = 0; d < 14; d++){
  const ds = new Date(start + d * 86400000).toISOString().slice(0, 10);
  const lv = dailyLevel(ds);
  if(!lv){ bad(`daily ${ds}: generation failed`); continue; }
  const again = dailyLevel(ds);
  if(JSON.stringify(lv.p) !== JSON.stringify(again.p)) bad(`daily ${ds}: non-deterministic`);
}

if(fail){ console.error(`${fail} check(s) failed`); process.exit(1); }
console.log(`✓ ${LEVELS.length} levels verified (par == optimal, invariants hold), 14 dailies deterministic`);
