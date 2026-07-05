/* Level generation — shared between tools/generate-levels.mjs (batch content)
   and the in-game daily puzzle (date-seeded, identical worldwide). */

import { N, EXIT_ROW, solve, rate, levelKey } from './solver.js';
import { mulberry32, hashStr, rngInt } from './rng.js';

/* One generation attempt from a given RNG. Returns a rated level or null.
   Consumes the RNG deterministically, so a fixed seed always yields the
   same board (or the same failure) — required for the daily puzzle. */
export function tryGenerate(rng, opts = {}){
  const minOptimal = opts.minOptimal ?? 3;
  const extras = opts.pieces ?? rngInt(rng, 6, 12);

  const hero = { r: EXIT_ROW, c: rngInt(rng, 0, 3), len: 2, dir: 'h' };
  const pieces = [hero];
  const grid = Array.from({ length: N }, () => Array(N).fill(false));
  const mark = p => {
    for(let k = 0; k < p.len; k++){
      grid[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] = true;
    }
  };
  const fits = p => {
    for(let k = 0; k < p.len; k++){
      const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
      if(r >= N || c >= N || grid[r][c]) return false;
    }
    return true;
  };
  mark(hero);

  let placed = 0, tries = 0;
  while(placed < extras && tries < 250){
    tries++;
    const len = rng() < 0.28 ? 3 : 2;
    const dir = rng() < 0.5 ? 'h' : 'v';
    let p;
    if(dir === 'h'){
      const r = rngInt(rng, 0, N - 1);
      if(r === EXIT_ROW) continue;               // h-piece in exit row can never be passed
      p = { r, c: rngInt(rng, 0, N - len), len, dir };
    } else {
      p = { r: rngInt(rng, 0, N - len), c: rngInt(rng, 0, N - 1), len, dir };
    }
    if(!fits(p)) continue;
    mark(p);
    pieces.push(p);
    placed++;
  }

  // Must be at least one blocker between the hero and the gate.
  let blocked = false;
  for(let c = hero.c + hero.len; c < N; c++) if(grid[EXIT_ROW][c]) blocked = true;
  if(!blocked) return null;

  const sol = solve(pieces, { maxStates: 250000 });
  if(!sol.solvable || sol.optimal < minOptimal) return null;

  const stats = rate(pieces, sol);
  return {
    p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
    m: sol.optimal,
    d: stats.score,
    stats,
    key: levelKey(pieces),
  };
}

/* ---------- Hardening (hill-climb) ----------
   Uniform random boards skew easy (p90 ≈ par 7). To reach the deep end of
   the curve we mutate a board — add / remove / relocate a piece — and keep
   the mutation when it lengthens the optimal solution (composite score as
   tie-break). Deterministic given the RNG, like everything else here. */

export function harden(level, rng, steps = 120, collect = null){
  let best = level;
  for(let s = 0; s < steps; s++){
    const pieces = best.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const grid = Array.from({ length: N }, () => Array(N).fill(-1));
    pieces.forEach((p, i) => {
      for(let k = 0; k < p.len; k++){
        grid[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] = i;
      }
    });
    const op = rng();
    if(op < 0.55 || pieces.length <= 4){
      // add a piece
      const len = rng() < 0.3 ? 3 : 2;
      const dir = rng() < 0.5 ? 'h' : 'v';
      let p;
      if(dir === 'h'){
        const r = rngInt(rng, 0, N - 1);
        if(r === EXIT_ROW) continue;
        p = { r, c: rngInt(rng, 0, N - len), len, dir };
      } else {
        p = { r: rngInt(rng, 0, N - len), c: rngInt(rng, 0, N - 1), len, dir };
      }
      let ok = true;
      for(let k = 0; k < p.len; k++){
        if(grid[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] !== -1) ok = false;
      }
      if(!ok) continue;
      pieces.push(p);
    } else if(op < 0.8 && pieces.length > 5){
      // remove a random non-hero piece
      pieces.splice(rngInt(rng, 1, pieces.length - 1), 1);
    } else {
      // slide a random non-hero piece to a new offset on its own axis
      if(pieces.length < 2) continue;
      const i = rngInt(rng, 1, pieces.length - 1);
      const p = pieces[i];
      const off = rngInt(rng, 0, N - p.len);
      const q = p.dir === 'h' ? { ...p, c: off } : { ...p, r: off };
      let ok = true;
      for(let k = 0; k < q.len; k++){
        const r = q.r + (q.dir === 'v' ? k : 0), c = q.c + (q.dir === 'h' ? k : 0);
        const occ = grid[r][c];
        if(occ !== -1 && occ !== i) ok = false;
      }
      if(!ok) continue;
      pieces[i] = q;
    }

    const sol = solve(pieces, { maxStates: 250000 });
    if(!sol.solvable || sol.optimal < 2) continue;
    if(sol.optimal < best.m) continue;
    const stats = rate(pieces, sol);
    if(sol.optimal > best.m || stats.score > best.d){
      best = {
        p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
        m: sol.optimal,
        d: stats.score,
        stats,
        key: levelKey(pieces),
      };
      if(collect) collect.push(best);   // intermediates feed the mid-difficulty bands
    }
  }
  return best;
}

/* ---------- Daily puzzle (plan item 1.1) ----------
   Seeded purely by the date string, so every player on Earth gets the same
   board. Deterministic retry ladder: seeds date#0, date#1, … until a board
   lands in the daily difficulty band. Band relaxes gradually so the ladder
   always terminates. */

export const DAILY_EPOCH = '2026-07-01';   // Daily #1

export function dailyNumber(dateStr){
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(DAILY_EPOCH + 'T00:00:00Z');
  return Math.round(ms / 86400000) + 1;
}

export function dailyLevel(dateStr){
  for(let i = 0; i < 400; i++){
    const rng = mulberry32(hashStr('mg-daily:' + dateStr + '#' + i));
    const relax = Math.floor(i / 100);       // widen the band every 100 misses
    const lv = tryGenerate(rng, { minOptimal: Math.max(8, 13 - 2 * relax) });
    if(!lv) continue;
    if(lv.m >= 13 - 2 * relax && lv.m <= 30 + 4 * relax && lv.d >= 19 - 3 * relax){
      return { ...lv, date: dateStr, number: dailyNumber(dateStr) };
    }
  }
  return null; // unreachable in practice
}
