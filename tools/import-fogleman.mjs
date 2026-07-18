#!/usr/bin/env node
/* Import puzzles from Michael Fogleman's exhaustively-enumerated Rush Hour
   database (michaelfogleman.com/rush) into our level format.

   His database comes from a genuinely different technique than ours:
   exhaustive state-space enumeration (2.5M distinct configurations,
   ~9.7B total reachable states) rather than hill-climbing from random
   seeds — that's why it reaches 50-60 move puzzles when our generator
   tops out around par 40 (see tools/generate-levels.mjs's BANDS comment).
   Reproducing that search from scratch isn't practical here; importing his
   already-exhaustively-verified hard instances is.

   Format (one puzzle per line): "<moves> <board36> <clusterSize>"
   board36 is a 6x6 grid in row-major order: 'o' empty, 'x' wall, 'A' the
   primary piece (always horizontal, row 2 — same convention as our
   EXIT_ROW), 'B'-'Z' other pieces (2 or 3 repeated cells in a row/column
   = that piece's length/orientation). Move count and cluster size are
   HIS numbers, informational only — we independently re-solve every board
   with our own solver and use ITS answer as the shipped par, since that's
   what the in-game hint/verify pipeline actually runs on.

   Usage:
     node tools/import-fogleman.mjs boards.txt
     node tools/import-fogleman.mjs boards.txt --dry-run
     pbpaste | node tools/import-fogleman.mjs -
     node tools/import-fogleman.mjs boards.txt --min-par 45   # only keep hard ones */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, rate, levelKey, N, EXIT_ROW } from '../js/solver.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run');
const minParOpt = (() => { const i = args.indexOf('--min-par'); return i >= 0 ? Number(args[i + 1]) : 0; })();
const OUT_POOL = (() => { const i = args.indexOf('--out'); return i >= 0 ? args[i + 1] : null; })();

if(!file){
  console.error('Usage: node tools/import-fogleman.mjs <boards.txt|-> [--dry-run] [--min-par N] [--out pool.json]');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseBoard(board36){
  if(board36.length !== 36) throw new Error(`board string is ${board36.length} chars, expected 36`);
  const grid = [];
  for(let r = 0; r < N; r++) grid.push(board36.slice(r * N, r * N + N).split(''));

  const walls = [];
  const cellsByLetter = new Map();
  for(let r = 0; r < N; r++){
    for(let c = 0; c < N; c++){
      const ch = grid[r][c];
      if(ch === 'o') continue;
      if(ch === 'x'){ walls.push([r, c]); continue; }
      if(!cellsByLetter.has(ch)) cellsByLetter.set(ch, []);
      cellsByLetter.get(ch).push([r, c]);
    }
  }
  if(!cellsByLetter.has('A')) throw new Error('no primary piece (A) found');

  // Order pieces A first (hero), then the rest by first-appearance order —
  // arbitrary but deterministic, matches how every other generator here
  // just uses array order with no semantic meaning beyond index 0 = hero.
  const letters = ['A', ...[...cellsByLetter.keys()].filter(l => l !== 'A').sort()];
  const pieces = letters.map(letter => {
    const cells = cellsByLetter.get(letter).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const len = cells.length;
    if(len < 2 || len > 3) throw new Error(`piece ${letter} has ${len} cells (expected 2 or 3)`);
    const rs = cells.map(c => c[0]), cs = cells.map(c => c[1]);
    const dir = new Set(rs).size === 1 ? 'h' : 'v';
    if(dir === 'h' && new Set(cs).size !== len) throw new Error(`piece ${letter} isn't contiguous`);
    if(dir === 'v' && new Set(rs).size !== len) throw new Error(`piece ${letter} isn't contiguous`);
    return { r: rs[0], c: cs[0], len, dir };
  });

  const hero = pieces[0];
  if(hero.dir !== 'h' || hero.r !== EXIT_ROW){
    throw new Error(`primary piece not horizontal on row ${EXIT_ROW} (got row ${hero.r}, dir ${hero.dir})`);
  }
  return { pieces, walls };
}

function readInput(){
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

const lines = readInput().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
console.log(`Parsing ${lines.length} line(s)…`);

const out = [];
const seenKeys = new Set();
let parseFailures = 0, solveMismatches = 0, unsolvable = 0, dupes = 0, tooEasy = 0;

for(const line of lines){
  const parts = line.split(/\s+/);
  if(parts.length < 2) continue;
  const [movesStr, board36] = parts;
  const fogM = Number(movesStr);

  let parsed;
  try{
    parsed = parseBoard(board36);
  }catch(e){
    console.error(`✗ parse failed (${movesStr} moves, ${board36.slice(0, 20)}…): ${e.message}`);
    parseFailures++;
    continue;
  }

  const { pieces, walls } = parsed;
  const sol = solve(pieces, { walls, maxStates: 2000000 });
  if(!sol.solvable){
    console.error(`✗ our solver says unsolvable (Fogleman claimed ${fogM}): ${board36}`);
    unsolvable++;
    continue;
  }
  if(sol.optimal !== fogM){
    console.error(`✗ par mismatch: Fogleman says ${fogM}, we compute ${sol.optimal} (${board36})`);
    solveMismatches++;
    continue;
  }
  if(sol.optimal < minParOpt){ tooEasy++; continue; }

  const key = levelKey(pieces, walls);
  if(seenKeys.has(key)){ dupes++; continue; }
  seenKeys.add(key);

  const stats = rate(pieces, sol, walls);
  out.push({
    p: pieces.map(q => [q.r, q.c, q.len, q.dir]),
    ...(walls.length ? { w: walls } : {}),
    m: sol.optimal,
    d: stats.score,
    stats,
    key,
    src: 'fogleman',
  });
}

console.log(`\n${out.length}/${lines.length} imported and verified.`);
if(parseFailures) console.log(`  ${parseFailures} parse failures`);
if(unsolvable) console.log(`  ${unsolvable} our solver couldn't solve`);
if(solveMismatches) console.log(`  ${solveMismatches} par mismatches (our solver disagreed with the source)`);
if(tooEasy) console.log(`  ${tooEasy} below --min-par ${minParOpt}`);
if(dupes) console.log(`  ${dupes} duplicates`);

if(out.length){
  const pars = out.map(l => l.m).sort((a, b) => a - b);
  console.log(`  par range: ${pars[0]}-${pars[pars.length - 1]}`);
}

if(DRY_RUN){
  console.log('\n--dry-run: not writing anything.');
} else if(OUT_POOL){
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT_POOL, JSON.stringify(out));
  console.log(`\nWrote ${out.length} verified levels to ${OUT_POOL}`);
} else {
  console.log('\nPass --out <path.json> to save the verified pool, or --dry-run just checked parsing.');
}
