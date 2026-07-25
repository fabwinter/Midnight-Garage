/* Level generation — shared between tools/generate-levels.mjs (batch content)
   and the in-game daily puzzle (date-seeded, identical worldwide). */

import { N, EXIT_ROW, solve, rate, levelKey, analyzeShape, stateToPieces } from './solver.js';
import { mulberry32, hashStr, rngInt } from './rng.js';

/* One generation attempt from a given RNG. Returns a rated level or null.
   Consumes the RNG deterministically, so a fixed seed always yields the
   same board (or the same failure) — required for the daily puzzle. */
export function tryGenerate(rng, opts = {}){
  const minOptimal = opts.minOptimal ?? 3;
  const extras = opts.pieces ?? rngInt(rng, 6, 12);
  const wallCount = opts.walls ?? 0;

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

  // Immovable roadworks first, so vehicles pack around them. Never in the
  // exit row (a wall there would make the level unwinnable). This loop
  // draws zero RNG values when wallCount is 0, keeping wall-free seeds —
  // including every historical daily puzzle — byte-identical.
  const walls = [];
  let wtries = 0;
  while(walls.length < wallCount && wtries < 60){
    wtries++;
    const r = rngInt(rng, 0, N - 1), c = rngInt(rng, 0, N - 1);
    if(r === EXIT_ROW || grid[r][c]) continue;
    grid[r][c] = true;
    walls.push([r, c]);
  }

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

  const sol = solve(pieces, { maxStates: 250000, walls });
  if(!sol.solvable || sol.optimal < minOptimal) return null;

  const stats = rate(pieces, sol, walls);
  return {
    p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
    ...(walls.length ? { w: walls.map(w => [w[0], w[1]]) } : {}),
    m: sol.optimal,
    d: stats.score,
    stats,
    key: levelKey(pieces, walls),
  };
}

/* ---------- Hitch puzzles ----------
   A dedicated generator rather than a mode of tryGenerate: a hitch needs a
   deliberately-placed tow/trailer pair (matching orientation, trailer
   straddling the exit row like a normal blocker) instead of tryGenerate's
   uniform random piece drop, and every candidate is rejected unless the
   OPTIMAL solution actually exercises the hitch — otherwise the trailer's
   placement wasn't really blocking anything and it's just a normal board
   with cosmetic hitch art bolted on. */
export function tryGenerateHitch(rng, opts = {}){
  const minOptimal = opts.minOptimal ?? 10;
  const extras = opts.pieces ?? rngInt(rng, 4, 9);

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

  // Trailer: vertical, straddles the exit row somewhere ahead of the hero
  // — a normal blocker shape, except it starts coupled/inert, so it can't
  // just be slid clear the way an ordinary piece could. Tow sits directly
  // adjacent to it in the SAME column, touching with no gap on one side
  // or the other — a real physical hitch (bumper to bumper), not two
  // pieces linked by an invisible tether across the board. Both share the
  // same `fixed` coordinate this way, so js/solver.js's auto-couple
  // (which slides both by an identical delta) keeps them touching for
  // every step of every drag, automatically, with no extra bookkeeping.
  const trailerLen = rng() < 0.5 ? 2 : 3;
  // A len-2 trailer renders as a broken-down car (see js/art.js): only a
  // tow truck may pull one of those, so the tow is always forced to len 3
  // (the tow-truck body's own natural size). A len-3 trailer is a genuine
  // trailer/caravan — any car (or truck) may hitch that, so its tow keeps
  // the old mixed-length odds.
  const towLen = trailerLen < 3 ? 3 : (rng() < 0.35 ? 3 : 2);
  let trailer = null, tow = null;
  for(let t = 0; t < 60 && !trailer; t++){
    const c = rngInt(rng, hero.c + hero.len, N - 1);
    const r = rngInt(rng, Math.max(0, EXIT_ROW - trailerLen + 1), Math.min(EXIT_ROW, N - trailerLen));
    const trailerCand = { r, c, len: trailerLen, dir: 'v' };
    if(!fits(trailerCand)) continue;
    const aboveR = r - towLen, belowR = r + trailerLen;
    const towCandidates = [];
    if(aboveR >= 0) towCandidates.push({ r: aboveR, c, len: towLen, dir: 'v' });
    if(belowR + towLen <= N) towCandidates.push({ r: belowR, c, len: towLen, dir: 'v' });
    if(towCandidates.length === 2 && rng() < 0.5) towCandidates.reverse();
    for(const cand of towCandidates){
      if(fits(cand)){ tow = cand; trailer = trailerCand; break; }
    }
  }
  if(!trailer || !tow) return null;
  mark(trailer);
  pieces.push(trailer);
  const trailerIdx = pieces.length - 1;
  mark(tow);
  pieces.push(tow);
  const towIdx = pieces.length - 1;

  const hitches = [{ tow: towIdx, trailer: trailerIdx }];

  // Filler, same style as tryGenerate's random piece drop.
  let placed = 0, tries = 0;
  while(placed < extras && tries < 200){
    tries++;
    const len = rng() < 0.28 ? 3 : 2;
    const dir = rng() < 0.5 ? 'h' : 'v';
    let p;
    if(dir === 'h'){
      const r = rngInt(rng, 0, N - 1);
      if(r === EXIT_ROW) continue;
      p = { r, c: rngInt(rng, 0, N - len), len, dir };
    } else {
      p = { r: rngInt(rng, 0, N - len), c: rngInt(rng, 0, N - 1), len, dir };
    }
    if(!fits(p)) continue;
    mark(p);
    pieces.push(p);
    placed++;
  }

  const sol = solve(pieces, { maxStates: 250000, hitches });
  if(!sol.solvable || sol.optimal < minOptimal) return null;

  const usesHitch = sol.path.some(mv => mv.decouple !== undefined || mv.i2 !== undefined);
  if(!usesHitch) return null;

  const stats = rate(pieces, sol, undefined, undefined, hitches);
  return {
    p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
    h: hitches,
    m: sol.optimal,
    d: stats.score,
    stats,
    key: levelKey(pieces, []) + '|H' + towIdx + '-' + trailerIdx,
  };
}

/* ---------- Gate puzzles (interlock sensors) ----------
   A dedicated generator like tryGenerateHitch: gates need deliberately-placed
   sensor + gate cells, and every candidate is rejected unless the optimal
   solution actually exercises the gate (solve with vs without, reject if
   gate doesn't increase par). Two polarities: polarity:false = "occupy a
   sensor to open the gate" (pressure plate), polarity:true = "clear all
   sensors to open" (tripwire). Sample both. */
export function tryGenerateGate(rng, opts = {}){
  const minOptimal = opts.minOptimal ?? 10;
  const extras = opts.pieces ?? rngInt(rng, 4, 9);

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

  // Filler pieces, same as tryGenerate
  let placed = 0, tries = 0;
  while(placed < extras && tries < 200){
    tries++;
    const len = rng() < 0.28 ? 3 : 2;
    const dir = rng() < 0.5 ? 'h' : 'v';
    let p;
    if(dir === 'h'){
      const r = rngInt(rng, 0, N - 1);
      if(r === EXIT_ROW) continue;
      p = { r, c: rngInt(rng, 0, N - len), len, dir };
    } else {
      p = { r: rngInt(rng, 0, N - len), c: rngInt(rng, 0, N - 1), len, dir };
    }
    if(!fits(p)) continue;
    mark(p);
    pieces.push(p);
    placed++;
  }

  // Try random gate placements on this board until one exercises the gate.
  // Prefer exit row to hero's right, but accept any empty cell.
  let gate = null, sensors = null;
  for(let gtry = 0; gtry < 30; gtry++){
    let gr, gc;
    if(gtry < 10 && hero.c + hero.len < N){
      // First 10: try exit row to hero's right
      gc = rngInt(rng, hero.c + hero.len, N - 1);
      gr = EXIT_ROW;
    } else {
      // Fallback: random empty cell
      gr = rngInt(rng, 0, N - 1);
      gc = rngInt(rng, 0, N - 1);
    }

    // Gate cell must not be under a starting piece
    if(pieces.some(p => {
      for(let k = 0; k < p.len; k++){
        const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
        if(r === gr && c === gc) return true;
      }
      return false;
    })) continue;

    // Try to place 1-2 sensors
    const sensorCands = [];
    for(let sr = 0; sr < N; sr++){
      for(let sc = 0; sc < N; sc++){
        if(sr === gr && sc === gc) continue;
        if(!grid[sr][sc]) sensorCands.push([sr, sc]);
      }
    }
    if(sensorCands.length < 1) continue;

    const sensorCount = rng() < 0.6 ? 1 : Math.min(2, sensorCands.length);
    const pickedSensors = [];
    for(let i = 0; i < sensorCount; i++){
      const idx = Math.floor(rng() * sensorCands.length);
      pickedSensors.push(sensorCands[idx]);
      sensorCands.splice(idx, 1);
    }

    gate = [gr, gc];
    sensors = pickedSensors;
    break;
  }
  if(!gate || !sensors) return null;

  // Sample polarity
  const polarity = rng() < 0.5 ? false : true;

  const gates = [{ sensors, gate, polarity }];

  // Must exercise the gate: solve with and without, gate must increase par.
  const solWithGate = solve(pieces, { maxStates: 250000, gates });
  if(!solWithGate.solvable || solWithGate.optimal < minOptimal) return null;

  const solWithoutGate = solve(pieces, { maxStates: 250000 });
  if(!solWithoutGate.solvable) return null;

  // Gate must cost moves AND at least one move in optimal path enters gate
  if(solWithGate.optimal <= solWithoutGate.optimal) return null;
  const usesGate = solWithGate.path.some(mv => {
    if(mv.decouple !== undefined || mv.couple !== undefined) return false;
    // Does this move's target include the gate cell?
    const cells = [];
    for(let k = 0; k < pieces[mv.i].len; k++){
      const r = pieces[mv.i].dir === 'h' ? pieces[mv.i].r : mv.o + k;
      const c = pieces[mv.i].dir === 'h' ? mv.o + k : pieces[mv.i].c;
      cells.push([r, c]);
    }
    return cells.some(([r, c]) => r === gate[0] && c === gate[1]);
  });
  if(!usesGate) return null;

  const stats = rate(pieces, solWithGate, undefined, gates);
  const gateKey = sensors.map(s => s[0] + ',' + s[1]).join(';');
  return {
    p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
    g: gates,
    m: solWithGate.optimal,
    d: stats.score,
    stats,
    key: levelKey(pieces, []) + '|G' + gate[0] + ',' + gate[1] + ':' + gateKey + ':' + (polarity ? 1 : 0),
  };
}

/* ---------- Hardening (hill-climb) ----------
   Uniform random boards skew easy (p90 ≈ par 7). To reach the deep end of
   the curve we mutate a board — add / remove / relocate a piece or a wall —
   and keep the mutation when it lengthens the optimal solution (composite
   score as tie-break). Deterministic given the RNG, like everything else
   here. wallMax caps how many roadworks the climb may place (0 = never). */

export function harden(level, rng, steps = 120, collect = null, wallMax = 0){
  let best = level;
  const hitches = level.h;
  const gates = level.g;

  for(let s = 0; s < steps; s++){
    const pieces = best.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const walls = (best.w ?? []).map(a => [a[0], a[1]]);
    const grid = Array.from({ length: N }, () => Array(N).fill(-1));
    pieces.forEach((p, i) => {
      for(let k = 0; k < p.len; k++){
        grid[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] = i;
      }
    });
    for(const [wr, wc] of walls) grid[wr][wc] = -2;

    // Mark gate cells as off-limits for piece placement / wall placement
    const gateCells = new Set();
    if(gates){
      gates.forEach(gt => {
        gateCells.add(gt.gate[0] * N + gt.gate[1]);
        (gt.sensors ?? []).forEach(s => gateCells.add(s[0] * N + s[1]));
      });
    }

    let op = rng();
    if(wallMax > 0 && op < 0.2){
      // mutate roadworks: add / remove / relocate one wall cell
      const wop = rng();
      if(wop < 0.5 && walls.length < wallMax){
        const r = rngInt(rng, 0, N - 1), c = rngInt(rng, 0, N - 1);
        if(r === EXIT_ROW || grid[r][c] !== -1 || gateCells.has(r * N + c)) continue;
        walls.push([r, c]);
      } else if(wop < 0.75 && walls.length > 0){
        walls.splice(rngInt(rng, 0, walls.length - 1), 1);
      } else if(walls.length > 0){
        const wi = rngInt(rng, 0, walls.length - 1);
        const r = rngInt(rng, 0, N - 1), c = rngInt(rng, 0, N - 1);
        if(r === EXIT_ROW || grid[r][c] !== -1 || gateCells.has(r * N + c)) continue;
        walls[wi] = [r, c];
      } else continue;
      op = 1;
    } else if(wallMax > 0){
      op = (op - 0.2) / 0.8;
    }
    if(op === 1){
      // fall through to solve
    } else if((op < 0.55 && pieces.length < 16) || pieces.length <= 4){
      // add a piece, never on gate/sensor cells
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
        const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
        if(grid[r][c] !== -1 || gateCells.has(r * N + c)) ok = false;
      }
      if(!ok) continue;
      pieces.push(p);
    } else if(op < 0.8 && pieces.length > 5){
      // remove a random non-hero, non-hitch piece
      let i = rngInt(rng, 1, pieces.length - 1);
      // Skip tow/trailer pieces
      if(hitches && hitches.some(h => h.tow === i || h.trailer === i)){
        continue;
      }
      pieces.splice(i, 1);
    } else {
      // slide a random non-hero, non-hitch piece on its own axis
      if(pieces.length < 2) continue;
      let i = rngInt(rng, 1, pieces.length - 1);
      // Skip tow/trailer pieces
      if(hitches && hitches.some(h => h.tow === i || h.trailer === i)){
        continue;
      }
      const p = pieces[i];
      const off = rngInt(rng, 0, N - p.len);
      const q = p.dir === 'h' ? { ...p, c: off } : { ...p, r: off };
      let ok = true;
      for(let k = 0; k < q.len; k++){
        const r = q.r + (q.dir === 'v' ? k : 0), c = q.c + (q.dir === 'h' ? k : 0);
        const occ = grid[r][c];
        if((occ !== -1 && occ !== i) || gateCells.has(r * N + c)) ok = false;
      }
      if(!ok) continue;
      pieces[i] = q;
    }

    const sol = solve(pieces, { maxStates: 250000, walls, gates, hitches });
    if(!sol.solvable || sol.optimal < 2) continue;
    if(sol.optimal < best.m) continue;
    const stats = rate(pieces, sol, walls, gates, hitches);
    if(sol.optimal > best.m || stats.score > best.d){
      best = {
        p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
        ...(walls.length ? { w: walls.map(w => [w[0], w[1]]) } : {}),
        ...(hitches ? { h: hitches } : {}),
        ...(gates ? { g: gates } : {}),
        m: sol.optimal,
        d: stats.score,
        stats,
        key: levelKey(pieces, walls) + (hitches ? '|H' + hitches.map(h => h.tow + '-' + h.trailer).join(',') : '') + (gates ? '|G' + gates.map(gt => gt.gate[0] + ',' + gt.gate[1]).join(',') : ''),
      };
      if(collect) collect.push(best);
    }
  }

  // Final check: if the level has features, re-verify they're still exercised
  if(hitches){
    const pieces = best.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const solWithHitch = solve(pieces, { walls: best.w, hitches });
    const solWithoutHitch = solve(pieces, { walls: best.w });
    const usesHitch = solWithHitch.path.some(mv => mv.decouple !== undefined || mv.i2 !== undefined);
    if(!usesHitch || solWithHitch.optimal <= solWithoutHitch.optimal) return level;   // reverted
  }
  if(gates){
    const pieces = best.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const solWithGate = solve(pieces, { walls: best.w, gates });
    const solWithoutGate = solve(pieces, { walls: best.w });
    const usesGate = solWithGate.path.some(mv => {
      if(mv.decouple !== undefined || mv.couple !== undefined) return false;
      const cells = [];
      for(let k = 0; k < pieces[mv.i].len; k++){
        const r = pieces[mv.i].dir === 'h' ? pieces[mv.i].r : mv.o + k;
        const c = pieces[mv.i].dir === 'h' ? mv.o + k : pieces[mv.i].c;
        cells.push([r, c]);
      }
      return cells.some(([r, c]) => gates.some(gt => gt.gate[0] === r && gt.gate[1] === c));
    });
    if(!usesGate || solWithGate.optimal <= solWithoutGate.optimal) return level;   // reverted
  }

  return best;
}

/* ---------- Exact-shape harvesting ----------
   harden() finds a promising SHAPE (piece lengths/dirs/lanes + walls) by
   hill-climbing one greedy trajectory through position-space — it rarely
   settles on that shape's true hardest arrangement. analyzeShape() maps
   the shape's ENTIRE reachable configuration space in one multi-source
   BFS from every "hero escaped" state, which both (a) usually finds a
   harder capstone than the climb's own endpoint, and (b) hands back the
   exact optimal-move count for every other reachable configuration for
   free — so one expensive shape analysis can seed many difficulty tiers
   at once instead of needing a separate board per tier. */
export function harvestShape(level, opts = {}){
  const maxStates = opts.maxStates ?? 500000;
  const harvestCount = opts.harvestCount ?? 6;
  const pieces = level.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const walls = level.w ?? [];

  const shape = analyzeShape(pieces, { walls, maxStates });
  if(shape.aborted || shape.noGoal) return [level];   // couldn't map it — keep the climbed level as-is

  const targets = new Set([shape.maxD]);
  for(let i = 1; i < harvestCount; i++) targets.add(Math.round(shape.maxD * i / harvestCount));

  const keyAtDist = new Map();
  for(const [k, d] of shape.distGoal){
    if(targets.has(d) && !keyAtDist.has(d)) keyAtDist.set(d, k);
  }

  const out = [];
  const seenKeys = new Set();
  for(const d of targets){
    const stateKey = keyAtDist.get(d);
    if(!stateKey) continue;
    const hPieces = stateToPieces(stateKey, shape.len, shape.dir, shape.fixed);
    const lk = levelKey(hPieces, walls);
    if(seenKeys.has(lk)) continue;
    seenKeys.add(lk);
    const sol = solve(hPieces, { walls, maxStates });
    if(!sol.solvable || sol.optimal !== d) continue;   // BFS distance must agree with solve()
    const stats = rate(hPieces, sol, walls);
    out.push({
      p: hPieces.map(q => [q.r, q.c, q.len, q.dir]),
      ...(walls.length ? { w: walls.map(w => [w[0], w[1]]) } : {}),
      m: sol.optimal,
      d: stats.score,
      stats,
      key: lk,
    });
  }
  return out.length ? out : [level];
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
