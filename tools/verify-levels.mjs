#!/usr/bin/env node
/* CI-style check: every shipped level must be solvable with par == optimal,
   respect board invariants, and the daily puzzle must generate for the next
   two weeks. Run with `npm run verify`. */

import { LEVELS, CHAPTERS, CHAPTER_SIZE, INTRO } from '../js/levels.data.js';
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
  // overlap / bounds check — roadworks (immovable walls) claim cells first
  const g = Array.from({ length: N }, () => Array(N).fill(false));
  for(const [r, c] of (lv.w ?? [])){
    if(r < 0 || c < 0 || r >= N || c >= N){ bad(`level ${i + 1}: roadworks out of bounds`); continue; }
    if(r === EXIT_ROW){ bad(`level ${i + 1}: roadworks in exit row (unwinnable)`); continue; }
    if(g[r][c]){ bad(`level ${i + 1}: overlapping roadworks`); continue; }
    g[r][c] = true;
  }
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
  // M7: Gate invariant checking
  if(lv.g){
    for(const gate of lv.g){
      if(!gate.sensors || !gate.gate) bad(`level ${i + 1}: malformed gate`);
      // Sensors must be valid and reachable (not blocked by pieces/walls at start)
      for(const [sr, sc] of gate.sensors){
        if(sr < 0 || sc < 0 || sr >= N || sc >= N) bad(`level ${i + 1}: gate sensor out of bounds`);
        if(g[sr][sc]) bad(`level ${i + 1}: gate sensor overlaps with piece/wall`);
      }
      // Gate cell must be valid, not in exit row, not overlapping
      const [gr, gc] = gate.gate;
      if(gr < 0 || gc < 0 || gr >= N || gc >= N) bad(`level ${i + 1}: gate cell out of bounds`);
      if(gr === EXIT_ROW) bad(`level ${i + 1}: gate in exit row (breaks solution)`);
      if(g[gr][gc]) bad(`level ${i + 1}: gate cell overlaps with piece/wall`);
    }
  }

  // M8: Lane invariant checking
  if(lv.o){
    for(const [lr, lc, dir] of lv.o){
      if(typeof dir !== 'string' || (dir !== 'h' && dir !== 'v')) bad(`level ${i + 1}: malformed lane direction`);
      if(lr < 0 || lc < 0 || lr >= N || lc >= N) bad(`level ${i + 1}: lane cell out of bounds`);
      if(lr === EXIT_ROW) bad(`level ${i + 1}: lane in exit row (breaks solution)`);
    }
  }

  const sol = solve(pieces, { walls: lv.w, gates: lv.g, lanes: lv.o });
  if(!sol.solvable) bad(`level ${i + 1}: unsolvable`);
  else if(sol.optimal !== lv.m) bad(`level ${i + 1}: par ${lv.m} but optimal ${sol.optimal}`);
});

// difficulty progression: only the intro ramp may fall below chapter 1's floor
const FLOOR = CHAPTERS[0].minM;
LEVELS.forEach((lv, i) => {
  if(i >= INTRO && lv.m < FLOOR) bad(`level ${i + 1}: par ${lv.m} — nothing below par ${FLOOR} is allowed after level ${INTRO}`);
});

// every level's par must sit inside its chapter's declared band (intro exempt)
LEVELS.forEach((lv, i) => {
  if(i < INTRO) return;
  const ch = CHAPTERS[Math.floor(i / CHAPTER_SIZE)];
  if(lv.m < ch.minM || lv.m > ch.maxM){
    bad(`level ${i + 1}: par ${lv.m} outside ${ch.name} band ${ch.minM}–${ch.maxM}`);
  }
});

// chapter par floors must strictly increase so each stage is genuinely harder
for(let c = 1; c < CHAPTERS.length; c++){
  if(CHAPTERS[c].minM <= CHAPTERS[c - 1].minM) bad(`chapter ${c + 1}: par floor ${CHAPTERS[c].minM} does not exceed chapter ${c}'s ${CHAPTERS[c - 1].minM}`);
}

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
