#!/usr/bin/env node
/* Brings every shipped gate level onto the boom-barrier rules.

   Gates used to be a cell that traffic could enter from any direction as
   long as the sensors said open. They're now real boom barriers: traffic
   passes THROUGH along the lane the arm guards and can never cross it
   sideways (js/solver.js legalMoves' gateBlocks). That's a rule change,
   and it splits the 27 shipped gate boards two ways:

     - 12 still work as-is. They only ever needed traffic to pass along one
       axis, so they just need that axis recorded (every shipped gate
       predates the field, and verify-levels now rejects a gate without an
       explicit one rather than letting it default to 'h' and be silently
       wrong). Each is re-solved here to prove the recorded axis is really
       the one it holds par under.

     - 15 became unsolvable, every one of them because some car had to
       cross the gate cell perpendicular to the barrier — most often a
       vertical car marooned on the wrong side of an exit-row gate forever.

   For those 15 the board itself is fine; only the gate is in the wrong
   place. So rather than swapping in a different puzzle, this keeps every
   piece and wall exactly where it is and re-places the GATE on it —
   searching cell x axis x polarity x sensors for a configuration that
   still lands inside the slot's chapter par band and difficulty window.
   That preserves each level's identity and its spot on the curve far
   better than substituting a generated board would (these are boards
   whose difficulty comes almost entirely from their gate: several solve
   in 6-8 moves with the gate removed and ~33 with it), and it keeps the
   whole fix reproducible from the repo alone, with no generated pool.

   Everything is replaced in place at the SAME array index, so no player's
   earned stars/best shift around — no save migration needed, unlike a
   reorder (see js/legacy-campaign-keys-v1.js for when one IS needed).

   Run: node tools/fix-gate-levels.mjs [--dry-run] */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, rate, N, EXIT_ROW } from '../js/solver.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS_PATH = join(ROOT, 'js', 'levels.data.js');

const { CHAPTER_SIZE, INTRO, CHAPTERS, LEVELS } = await import(LEVELS_PATH + '?t=' + Date.now());

/* The boards that survive the new rule, with the passage axis each one
   needs (derived by re-solving every shipped gate level under both axes
   and keeping the one that reproduces its stored par). */
const SURVIVOR_AXIS = {
  51: 'h', 85: 'h', 110: 'h', 120: 'h', 130: 'h', 140: 'h',
  151: 'h', 178: 'h', 187: 'h',
  101: 'v', 211: 'v', 221: 'v',
};

/* idx -> [minD, maxD]: the difficulty window a re-placed gate has to land
   in — its chapter's NATURAL score range with these 15 slots excluded
   (measured from the shipped data, not guessed). Targeting an explicit
   window rather than just a par is what stops a swap quietly punching a
   hole in the curve: verify-levels enforces strictly-increasing chapter
   score floors, and par alone doesn't imply score (see rate()). */
const REPAIR_WINDOW = {
  62:  [13.8, 18.2],   // Neon District
  73:  [13.8, 18.2],
  159: [20.3, 25.8],   // Gridlock
  168: [20.3, 25.8],
  201: [26.2, 31.7],   // Overpass
  231: [26.2, 31.7],
  241: [26.2, 31.7],
  251: [31.8, 41.0],   // Freight Yard
  261: [31.8, 41.0],
  271: [31.8, 41.0],
  281: [31.8, 41.0],
  291: [31.8, 41.0],
  301: [41.4, 50.2],   // Customs
  310: [41.4, 50.2],
  320: [41.4, 50.2],
};

const toPieces = p => p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
const allCells = [];
for(let r = 0; r < N; r++) for(let c = 0; c < N; c++) allCells.push([r, c]);

/* Search a single board for a gate placement that fits its slot. Fixed
   iteration order throughout, so the chosen configuration is deterministic
   and this tool re-run on the same input produces the same levels file.
   Sensors may sit under a piece (only the GATE cell may not), so they're
   drawn from every cell — 1-sensor placements first, since they read more
   clearly on the board, falling back to pairs only if nothing single
   works. */
function repair(lv, ch, minD, maxD){
  const pieces = toPieces(lv.p);
  const walls = lv.w ?? [];
  const occupied = new Set();
  pieces.forEach(p => {
    for(let k = 0; k < p.len; k++){
      occupied.add((p.r + (p.dir === 'v' ? k : 0)) * N + (p.c + (p.dir === 'h' ? k : 0)));
    }
  });
  walls.forEach(([r, c]) => occupied.add(r * N + c));

  const noGate = solve(pieces, { walls, maxStates: 2000000 });
  const gateCells = allCells.filter(([r, c]) => !occupied.has(r * N + c));
  let best = null;

  const consider = (gate, axis, polarity, sensors) => {
    const gates = [{ gate, sensors, polarity, axis }];
    const sol = solve(pieces, { walls, gates, maxStates: 600000 });
    if(!sol.solvable) return;
    if(sol.optimal < ch.minM || sol.optimal > ch.maxM) return;
    // The gate has to be load-bearing, not a wall the solver routes around.
    if(noGate.solvable && sol.optimal <= noGate.optimal) return;
    const d = rate(pieces, sol, walls, gates).score;
    if(d < minD || d > maxD) return;
    // Prefer the configuration closest to what this slot used to be, so
    // the chapter's curve barely moves; par is weighted below score
    // because score is what the floor invariant is actually checked on.
    const cost = Math.abs(d - lv.d) + Math.abs(sol.optimal - lv.m) * 0.5;
    if(!best || cost < best.cost) best = { cost, gates, m: sol.optimal, d };
  };

  for(const sensorCount of [1, 2]){
    for(const [gr, gc] of gateCells){
      for(const axis of ['h', 'v']){
        // A gate on the exit row that won't pass horizontal traffic walls
        // the hero in permanently — never a legal board.
        if(gr === EXIT_ROW && axis !== 'h') continue;
        for(const polarity of [false, true]){
          const cands = allCells.filter(([r, c]) => !(r === gr && c === gc));
          if(sensorCount === 1){
            for(const s of cands) consider([gr, gc], axis, polarity, [s]);
          } else {
            for(let a = 0; a < cands.length; a++){
              for(let b = a + 1; b < cands.length; b++) consider([gr, gc], axis, polarity, [cands[a], cands[b]]);
            }
          }
        }
      }
    }
    if(best) return best;   // don't pay for the pair search if a single sensor did it
  }
  return best;
}

const newLevels = LEVELS.slice();
const failures = [];

Object.entries(SURVIVOR_AXIS).forEach(([idxStr, axis]) => {
  const idx = Number(idxStr);
  const lv = LEVELS[idx];
  if(!lv.g?.length){ failures.push(`index ${idx}: expected a gate level, found none`); return; }
  const g = lv.g.map(gt => ({ ...gt, axis }));
  const sol = solve(toPieces(lv.p), { walls: lv.w, gates: g, hitches: lv.h, maxStates: 2000000 });
  if(!sol.solvable || sol.optimal !== lv.m){
    failures.push(`index ${idx}: survivor no longer holds par under axis '${axis}' (stored ${lv.m}, solver says ${sol.solvable ? sol.optimal : 'unsolvable'})`);
    return;
  }
  newLevels[idx] = { ...lv, g };
  console.log(`· index ${idx} (L${idx + 1}, ${CHAPTERS[Math.floor(idx / CHAPTER_SIZE)].name}): kept as-is, axis '${axis}', par ${lv.m} holds`);
});

Object.entries(REPAIR_WINDOW).forEach(([idxStr, [minD, maxD]]) => {
  const idx = Number(idxStr);
  const lv = LEVELS[idx];
  const ch = CHAPTERS[Math.floor(idx / CHAPTER_SIZE)];
  const fixed = repair(lv, ch, minD, maxD);
  if(!fixed){
    failures.push(`index ${idx} (${ch.name}): no gate placement lands in par ${ch.minM}-${ch.maxM} and d ${minD}-${maxD}`);
    return;
  }
  const [gt] = fixed.gates;
  newLevels[idx] = { m: fixed.m, d: fixed.d, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}), g: fixed.gates };
  console.log(`✓ index ${idx} (L${idx + 1}, ${ch.name}): gate ${JSON.stringify(lv.g[0].gate)} -> ${JSON.stringify(gt.gate)} axis '${gt.axis}', ` +
    `par ${lv.m} -> ${fixed.m}, d ${lv.d} -> ${fixed.d}`);
});

if(failures.length){
  console.error(`\n✗ ${failures.length} level(s) unfixed:`);
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}

if(DRY_RUN){
  console.log('\n--dry-run: not writing js/levels.data.js.');
  process.exit(0);
}

const levelsJs = `/* AUTO-GENERATED — do not edit by hand. 500 levels, verified optimal
   (m = par), curved by difficulty model v1 score (d), 10 chapters of 50.
   See docs/LEVELS-500-PLAN.md for the 200->500 expansion,
   tools/fix-hitch-levels.mjs for the hitch tow/trailer adjacency fix, and
   tools/fix-gate-levels.mjs for the boom-barrier passage-axis fix (both
   reworked their affected levels in place at the same indices — nothing
   else here changed). */

export const CHAPTER_SIZE = ${CHAPTER_SIZE};

/* Levels 1-INTRO ease in below chapter 1's floor; every later level needs >= chapter 1's floor. */
export const INTRO = ${INTRO};

export const CHAPTERS = ${JSON.stringify(CHAPTERS, null, 2)};

export const LEVELS = [
${newLevels.map(lv => JSON.stringify({ m: lv.m, d: lv.d, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}), ...(lv.h ? { h: lv.h } : {}), ...(lv.g ? { g: lv.g } : {}) })).join(',\n')}
];
`;
writeFileSync(LEVELS_PATH, levelsJs);
console.log(`\nWrote ${LEVELS_PATH}.`);
