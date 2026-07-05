/* Midnight Garage — shared solver + difficulty model v1 (plan item 0.2).
   One codebase for generation, verification, hinting and rating; runs in
   Node (tools/generate-levels.mjs) and in the browser (hints, daily puzzle,
   future editor auto-rating).

   Board: 6×6. pieces[0] is the hero (red car), horizontal on EXIT_ROW.
   A "move" is one slide of one piece by any distance (standard Rush Hour
   move counting; par = optimal move count from BFS). */

export const N = 6;
export const EXIT_ROW = 2;

/* ---------- geometry helpers ---------- */

export function piecesToState(pieces){
  return {
    len:   pieces.map(p => p.len),
    dir:   pieces.map(p => p.dir),
    fixed: pieces.map(p => p.dir === 'h' ? p.r : p.c),
    offs:  pieces.map(p => p.dir === 'h' ? p.c : p.r),
  };
}

/* Immovable roadworks: walls = [[r,c],…] occupy cells but never move, so
   they live outside the BFS state entirely — just a static occupancy mask.
   WALL is the sentinel they carry in the occupancy grid (≠ -1 empty). */
export const WALL = -2;

export function wallMask(walls){
  if(!walls || !walls.length) return null;
  const m = new Int8Array(N * N);
  for(const [r, c] of walls) m[r * N + c] = 1;
  return m;
}

function occupy(len, dir, fixed, offs, wm){
  const g = new Int8Array(N * N).fill(-1);
  if(wm) for(let i = 0; i < N * N; i++) if(wm[i]) g[i] = WALL;
  for(let i = 0; i < offs.length; i++){
    for(let k = 0; k < len[i]; k++){
      const r = dir[i] === 'h' ? fixed[i] : offs[i] + k;
      const c = dir[i] === 'h' ? offs[i] + k : fixed[i];
      g[r * N + c] = i;
    }
  }
  return g;
}

/* All legal moves from a state: [pieceIdx, newOffset] per slide target. */
export function legalMoves(len, dir, fixed, offs, wm){
  const g = occupy(len, dir, fixed, offs, wm);
  const out = [];
  for(let i = 0; i < offs.length; i++){
    for(const step of [-1, 1]){
      let o = offs[i] + step;
      while(o >= 0 && o + len[i] <= N){
        const er = dir[i] === 'h' ? fixed[i] : (step > 0 ? o + len[i] - 1 : o);
        const ec = dir[i] === 'h' ? (step > 0 ? o + len[i] - 1 : o) : fixed[i];
        if(g[er * N + ec] !== -1) break;
        out.push([i, o]);
        o += step;
      }
    }
  }
  return out;
}

/* Heuristic distance-to-freedom for the hero: cells left to reach the exit
   plus vehicles parked in its path. Used to flag "counterintuitive" moves. */
function heroDistance(len, dir, fixed, offs, wm){
  const winOff = N - len[0];
  let d = winOff - offs[0];
  const g = occupy(len, dir, fixed, offs, wm);
  for(let c = offs[0] + len[0]; c < N; c++){
    if(g[EXIT_ROW * N + c] !== -1) d++;
  }
  return d;
}

/* ---------- BFS solve ----------
   Returns { solvable, optimal, path, statesExplored, optimalPaths }.
   path: [{i, from, to}] — one optimal solution.
   optimalPaths: number of distinct shortest solutions (capped at PATH_CAP);
   near-unique solutions are a strong "hard" signal in the difficulty model. */

const PATH_CAP = 1e9;

export function solve(pieces, opts = {}){
  const maxStates = opts.maxStates ?? 400000;
  const wm = wallMask(opts.walls);
  const { len, dir, fixed, offs: start } = piecesToState(pieces);
  const winOff = N - len[0];
  const key = s => s.join(',');

  if(start[0] === winOff){
    return { solvable: true, optimal: 0, path: [], statesExplored: 1, optimalPaths: 1 };
  }

  const startKey = key(start);
  const dist = new Map([[startKey, 0]]);
  const ways = new Map([[startKey, 1]]);
  const parent = new Map([[startKey, null]]);
  const queue = [start];
  let head = 0;
  let optimal = -1;
  let firstGoalKey = null;
  const goalKeys = new Set();

  while(head < queue.length){
    const s = queue[head++];
    const sKey = key(s);
    const d = dist.get(sKey);
    if(optimal !== -1 && d >= optimal) break;   // finished the last useful layer
    for(const [i, o] of legalMoves(len, dir, fixed, s, wm)){
      const ns = s.slice(); ns[i] = o;
      const nKey = key(ns);
      if(!dist.has(nKey)){
        dist.set(nKey, d + 1);
        ways.set(nKey, ways.get(sKey));
        parent.set(nKey, { from: s, i, o });
        if(i === 0 && o === winOff){
          if(optimal === -1){ optimal = d + 1; firstGoalKey = nKey; }
          goalKeys.add(nKey);
        } else {
          queue.push(ns);
        }
      } else if(dist.get(nKey) === d + 1){
        ways.set(nKey, Math.min(PATH_CAP, ways.get(nKey) + ways.get(sKey)));
      }
    }
    if(dist.size > maxStates) return { solvable: false, optimal: -1, path: null, statesExplored: dist.size, optimalPaths: 0, aborted: true };
  }

  if(optimal === -1){
    return { solvable: false, optimal: -1, path: null, statesExplored: dist.size, optimalPaths: 0 };
  }

  let optimalPaths = 0;
  for(const gk of goalKeys) optimalPaths = Math.min(PATH_CAP, optimalPaths + ways.get(gk));

  // Reconstruct one optimal solution.
  const path = [];
  let curKey = firstGoalKey;
  while(true){
    const p = parent.get(curKey);
    if(!p) break;
    path.unshift({ i: p.i, to: p.o });
    curKey = key(p.from);
  }
  // annotate 'from' offsets by replaying
  let s = start.slice();
  for(const mv of path){ mv.from = s[mv.i]; s[mv.i] = mv.to; }

  return { solvable: true, optimal, path, statesExplored: dist.size, optimalPaths };
}

/* First move of an optimal solution — the hint. Null if unsolvable. */
export function firstOptimalMove(pieces, opts){
  const sol = solve(pieces, opts);
  if(!sol.solvable || sol.optimal === 0) return null;
  const mv = sol.path[0];
  const p = pieces[mv.i];
  return {
    idx: mv.i,
    r: p.dir === 'h' ? p.r : mv.to,
    c: p.dir === 'h' ? mv.to : p.c,
  };
}

/* ---------- difficulty model v1 (plan item 0.2) ----------
   Signals per level:
     • optimal      — solution length
     • avgBranch    — mean count of legal moves along the solution (search noise)
     • counter      — moves after which the hero's distance-to-freedom GROWS
                      (the "you must go backwards to go forwards" signal)
     • optimalPaths — distinct shortest solutions; unique ⇒ harder
   Composite score is the sort key for the 200-level curve and the editor's
   future auto-rating. Weights are v1; re-fit in v1.1 from live funnel data. */

export function rate(pieces, solved, walls){
  const sol = solved ?? solve(pieces, { walls });
  if(!sol.solvable) return null;
  const wm = wallMask(walls);
  const { len, dir, fixed, offs: start } = piecesToState(pieces);

  let s = start.slice();
  let branchSum = 0, counter = 0;
  let hPrev = heroDistance(len, dir, fixed, s, wm);
  for(const mv of sol.path){
    branchSum += legalMoves(len, dir, fixed, s, wm).length;
    s = s.slice(); s[mv.i] = mv.to;
    const h = heroDistance(len, dir, fixed, s, wm);
    if(h > hPrev) counter++;
    hPrev = h;
  }
  const avgBranch = sol.path.length ? branchSum / sol.path.length : 0;

  const uniqueness =
    sol.optimalPaths === 1 ? 4 :
    sol.optimalPaths <= 3  ? 2 :
    sol.optimalPaths >= 20 ? -2 : 0;

  const score = Math.round((
    sol.optimal +
    1.6 * counter +
    0.35 * avgBranch +
    uniqueness
  ) * 10) / 10;

  return {
    optimal: sol.optimal,
    avgBranch: Math.round(avgBranch * 100) / 100,
    counter,
    optimalPaths: sol.optimalPaths,
    score,
  };
}

/* Canonical key for de-duplicating generated boards. */
export function levelKey(pieces, walls){
  const base = pieces
    .map(p => `${p.r},${p.c},${p.len},${p.dir}`)
    .slice(0, 1)
    .concat(pieces.slice(1).map(p => `${p.r},${p.c},${p.len},${p.dir}`).sort())
    .join('|');
  const w = walls && walls.length
    ? '|W:' + walls.map(([r, c]) => r + ',' + c).sort().join(';')
    : '';
  return base + w;
}
