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

/* All legal moves from a state. Optional gates: [{ sensors:[[r,c],…],
   gate:[r,c], polarity }]. A move entering a gate cell is legal iff
   (anySensorOccupied) XOR polarity.

   Optional hitches: [{ tow, trailer }, …] plus a parallel `coupled` array
   (1 per hitch: 0 = coupled, 1 = decoupled — matches the runtime's
   one-way decouple). Three move shapes come out of here, matching what
   the board UI can actually do to a hitched pair:
     { i, o }              — plain slide (untethered piece, or a decoupled
                              tow/trailer moving independently)
     { i, o, i2, o2 }      — coupled tow move: tow slides i→o, its trailer
                              slides i2→o2 by the identical delta, both
                              legs checked simultaneously at every step of
                              the slide (mirrors game.js's auto-couple,
                              which translates the trailer by the tow's
                              raw pixel offset with no clearance check of
                              its own — this is the model that makes that
                              safe: the trailer's full path is validated
                              here, before either side of the pair moves)
     { decouple: hitchIdx } — detach a still-coupled hitch; no piece moves,
                              costs one move same as decoupleTow() in
                              game.js (moves++)
   A trailer stays fully inert (no independent slide, not even a wall — it
   simply contributes no moves) for as long as its hitch is coupled; once
   decoupled it's an ordinary piece, same as its tow. */
export function legalMoves(len, dir, fixed, offs, wm, gates, hitches, coupled){
  const g = occupy(len, dir, fixed, offs, wm);
  const out = [];

  const isCoupled = hi => !coupled || coupled[hi] !== 1;
  const hitchByTow = new Map();      // towIdx -> hitchIdx, only while coupled
  const hitchByTrailer = new Map();  // trailerIdx -> hitchIdx, always
  if(hitches){
    hitches.forEach((h, hi) => {
      hitchByTrailer.set(h.trailer, hi);
      if(isCoupled(hi)) hitchByTow.set(h.tow, hi);
    });
  }

  const cellsFor = (i, o) => {
    const cells = [];
    for(let k = 0; k < len[i]; k++){
      const r = dir[i] === 'h' ? fixed[i] : o + k;
      const c = dir[i] === 'h' ? o + k : fixed[i];
      cells.push(r * N + c);
    }
    return cells;
  };
  const clearFor = (cells, selfSet) => cells.every(cell => g[cell] === -1 || selfSet.has(g[cell]));
  const gateBlocks = (er, ec) => {
    if(!gates) return false;
    const gate = gates.find(gt => gt.gate[0] === er && gt.gate[1] === ec);
    if(!gate) return false;
    const anySensorOccupied = gate.sensors.some(([sr, sc]) => g[sr * N + sc] !== -1);
    return anySensorOccupied === gate.polarity;   // blocked iff NOT open
  };

  for(let i = 0; i < offs.length; i++){
    if(hitchByTrailer.has(i) && isCoupled(hitchByTrailer.get(i))) continue;   // inert while coupled

    if(hitchByTow.has(i)){
      const h = hitches[hitchByTow.get(i)];
      const trailerI = h.trailer;
      if(dir[trailerI] !== dir[i]) continue;   // auto-couple only fires on matching orientation (game.js parity)
      const selfSet = new Set([i, trailerI]);
      for(const step of [-1, 1]){
        let o = offs[i] + step;
        let to = offs[trailerI] + step;
        while(o >= 0 && o + len[i] <= N && to >= 0 && to + len[trailerI] <= N){
          const towCells = cellsFor(i, o);
          const trailCells = cellsFor(trailerI, to);
          if(!clearFor(towCells, selfSet) || !clearFor(trailCells, selfSet)) break;
          const er = dir[i] === 'h' ? fixed[i] : (step > 0 ? o + len[i] - 1 : o);
          const ec = dir[i] === 'h' ? (step > 0 ? o + len[i] - 1 : o) : fixed[i];
          if(gateBlocks(er, ec)) break;
          out.push({ i, o, i2: trailerI, o2: to });
          o += step; to += step;
        }
      }
      continue;   // no solo move for a coupled tow — dragging is the only option, matches the runtime
    }

    for(const step of [-1, 1]){
      let o = offs[i] + step;
      while(o >= 0 && o + len[i] <= N){
        const er = dir[i] === 'h' ? fixed[i] : (step > 0 ? o + len[i] - 1 : o);
        const ec = dir[i] === 'h' ? (step > 0 ? o + len[i] - 1 : o) : fixed[i];
        if(g[er * N + ec] !== -1) break;
        if(gateBlocks(er, ec)) break;
        out.push({ i, o });
        o += step;
      }
    }
  }

  if(hitches) hitches.forEach((h, hi) => { if(isCoupled(hi)) out.push({ decouple: hi }); });

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

/* Extended BFS state: piece offsets, plus one trailing slot per hitch
   (0 = coupled, 1 = decoupled — a one-way flag, same as the runtime's
   decoupleTow). Splitting a state array back into its two halves is just
   slicing at numPieces; kept as tiny local helpers rather than a class
   since every consumer already treats state as a plain number array. */
function splitState(s, numPieces){
  return numPieces === s.length ? [s, null] : [s.slice(0, numPieces), s.slice(numPieces)];
}
function applyMove(s, numPieces, mv){
  const ns = s.slice();
  if(mv.decouple !== undefined){ ns[numPieces + mv.decouple] = 1; return ns; }
  ns[mv.i] = mv.o;
  if(mv.i2 !== undefined) ns[mv.i2] = mv.o2;
  return ns;
}

/* ---------- BFS solve ----------
   Returns { solvable, optimal, path, statesExplored, optimalPaths }.
   path: one entry per move, in the { i, o } / { i, o, i2, o2 } /
   { decouple } shapes documented on legalMoves, each also carrying a
   `from`/`from2` (pre-move offset) for consumers that want to animate or
   describe the move.
   optimalPaths: number of distinct shortest solutions (capped at PATH_CAP);
   near-unique solutions are a strong "hard" signal in the difficulty model. */

const PATH_CAP = 1e9;

export function solve(pieces, opts = {}){
  const maxStates = opts.maxStates ?? 400000;
  const wm = wallMask(opts.walls);
  const gates = opts.gates;
  const hitches = opts.hitches;
  const { len, dir, fixed, offs: startOffs } = piecesToState(pieces);
  const winOff = N - len[0];
  const numPieces = startOffs.length;
  const numHitches = hitches ? hitches.length : 0;
  const start = numHitches ? [...startOffs, ...Array(numHitches).fill(0)] : startOffs;
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
    const [offs, coupled] = splitState(s, numPieces);
    for(const mv of legalMoves(len, dir, fixed, offs, wm, gates, hitches, coupled)){
      const ns = applyMove(s, numPieces, mv);
      const nKey = key(ns);
      const isWin = mv.decouple === undefined && mv.i === 0 && mv.o === winOff;
      if(!dist.has(nKey)){
        dist.set(nKey, d + 1);
        ways.set(nKey, ways.get(sKey));
        parent.set(nKey, { from: s, mv });
        if(isWin){
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
    path.unshift({ ...p.mv });
    curKey = key(p.from);
  }
  // annotate pre-move offsets by replaying
  let s = start.slice();
  for(const mv of path){
    if(mv.decouple === undefined){
      mv.from = s[mv.i];
      if(mv.i2 !== undefined) mv.from2 = s[mv.i2];
    }
    s = applyMove(s, numPieces, mv);
  }

  return { solvable: true, optimal, path, statesExplored: dist.size, optimalPaths };
}

/* First move of an optimal solution — the hint. Null if unsolvable.
   Returns either { idx, r, c } (drag piece `idx` to row/col r,c — for a
   coupled tow move this is the TOW's target; the board auto-drags its
   trailer along, same as a real drag) or { decouple: idx } (the hint is
   to unhitch piece `idx`, which has no destination to point at). */
export function firstOptimalMove(pieces, opts){
  const sol = solve(pieces, opts);
  if(!sol.solvable || sol.optimal === 0) return null;
  const mv = sol.path[0];
  if(mv.decouple !== undefined){
    const hitches = opts?.hitches;
    return { decouple: hitches[mv.decouple].tow };
  }
  const p = pieces[mv.i];
  return {
    idx: mv.i,
    r: p.dir === 'h' ? p.r : mv.o,
    c: p.dir === 'h' ? mv.o : p.c,
  };
}

/* ---------- exact hardest-configuration analysis ----------
   The real "how hard can a Rush Hour board possibly get" numbers (the
   Wikipedia-cited 93-move result) don't come from mutate-and-hillclimb —
   they come from mapping the FULL configuration graph for a fixed set of
   pieces (lengths/directions/lanes fixed, only offsets vary) and finding
   the state furthest from any exit. Because every slide is reversible,
   that graph is undirected, so "distance from the hardest state to its
   nearest exit" equals "distance from every exit state outward" — one
   multi-source BFS seeded from ALL goal states at once, instead of one
   solve() per candidate. This is exact (a true BFS distance, not a
   heuristic score) and — as a side effect — hands back the optimal-move
   count for EVERY reachable configuration of that shape in one pass, not
   just the hardest one, which is what makes it cheap to harvest whole
   difficulty tiers from a single good shape (see generate.js's
   harvestShape). Hill-climbing still matters upstream: most random shapes
   have goal states scattered everywhere and a tiny true maximum — it's
   how a shape with real "traffic jam" entanglement gets found at all. */

export function analyzeShape(pieces, opts = {}){
  const maxStates = opts.maxStates ?? 400000;
  const wm = wallMask(opts.walls);
  const gates = opts.gates;
  const hitches = opts.hitches;
  const { len, dir, fixed, offs: startOffs } = piecesToState(pieces);
  const winOff = N - len[0];
  const numPieces = startOffs.length;
  const numHitches = hitches ? hitches.length : 0;
  const start = numHitches ? [...startOffs, ...Array(numHitches).fill(0)] : startOffs;
  const key = s => s.join(',');

  // Map the full component reachable from `start` (ignoring win condition —
  // pure connectivity) so every legal configuration of this shape is known.
  const seen = new Set([key(start)]);
  const queue = [start];
  let head = 0;
  while(head < queue.length){
    const s = queue[head++];
    const [offs, coupled] = splitState(s, numPieces);
    for(const mv of legalMoves(len, dir, fixed, offs, wm, gates, hitches, coupled)){
      const ns = applyMove(s, numPieces, mv);
      const k = key(ns);
      if(!seen.has(k)){ seen.add(k); queue.push(ns); }
    }
    if(seen.size > maxStates) return { aborted: true, size: seen.size };
  }

  // Multi-source BFS from every state in that component where the hero has
  // already escaped: distGoal[state] = true optimal move count from state.
  const distGoal = new Map();
  const frontier = [];
  for(const k of seen){
    const s = k.split(',').map(Number);
    if(s[0] === winOff){ distGoal.set(k, 0); frontier.push(s); }
  }
  if(!frontier.length) return { noGoal: true, size: seen.size };
  let h2 = 0;
  while(h2 < frontier.length){
    const s = frontier[h2++];
    const d = distGoal.get(key(s));
    const [offs, coupled] = splitState(s, numPieces);
    for(const mv of legalMoves(len, dir, fixed, offs, wm, gates, hitches, coupled)){
      const ns = applyMove(s, numPieces, mv);
      const k = key(ns);
      if(!distGoal.has(k)){ distGoal.set(k, d + 1); frontier.push(ns); }
    }
  }

  let maxD = 0, maxKey = key(start);
  for(const [k, d] of distGoal) if(d > maxD){ maxD = d; maxKey = k; }
  return { size: seen.size, goals: frontier.length, maxD, maxKey, distGoal, len, dir, fixed };
}

/* Rebuild a pieces array from an analyzeShape() state key + its shape.
   The key may carry trailing per-hitch coupled flags past `len.length`
   offsets (see splitState) — harmless to ignore here since this only
   rebuilds piece geometry, not hitch state. */
export function stateToPieces(stateKey, len, dir, fixed){
  return stateKey.split(',').map(Number).slice(0, len.length).map((o, i) => ({
    r: dir[i] === 'h' ? fixed[i] : o,
    c: dir[i] === 'h' ? o : fixed[i],
    len: len[i],
    dir: dir[i],
  }));
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

export function rate(pieces, solved, walls, gates, hitches){
  const sol = solved ?? solve(pieces, { walls, gates, hitches });
  if(!sol.solvable) return null;
  const wm = wallMask(walls);
  const { len, dir, fixed, offs: startOffs } = piecesToState(pieces);
  const numPieces = startOffs.length;
  const numHitches = hitches ? hitches.length : 0;

  let s = numHitches ? [...startOffs, ...Array(numHitches).fill(0)] : startOffs;
  let branchSum = 0, counter = 0;
  let hPrev = heroDistance(len, dir, fixed, startOffs, wm);
  for(const mv of sol.path){
    const [offs, coupled] = splitState(s, numPieces);
    branchSum += legalMoves(len, dir, fixed, offs, wm, gates, hitches, coupled).length;
    s = applyMove(s, numPieces, mv);
    const [offsAfter] = splitState(s, numPieces);
    const h = heroDistance(len, dir, fixed, offsAfter, wm);
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
