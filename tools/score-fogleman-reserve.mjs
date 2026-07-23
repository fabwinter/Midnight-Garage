#!/usr/bin/env node
// One-off: score every unclaimed Fogleman board (not already used in
// campaign/bounty/impound) with our own solver+rate, so the new 500-level
// curve's bands are based on measured d-scores, not guesses.
import { readFileSync, writeFileSync } from 'node:fs';
import { solve, rate, levelKey, N } from '../js/solver.js';

function parseBoard(board36){
  const grid = [];
  for(let r = 0; r < N; r++) grid.push(board36.slice(r*N, r*N+N).split(''));
  const pieceCells = {};
  for(let r=0;r<N;r++) for(let c=0;c<N;c++){
    const ch = grid[r][c];
    if(ch === 'o' || ch === 'x') continue;
    (pieceCells[ch] ??= []).push([r,c]);
  }
  const walls = [];
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(grid[r][c]==='x') walls.push([r,c]);
  const pieces = [];
  for(const id of Object.keys(pieceCells).sort()){
    const cells = pieceCells[id];
    const len = cells.length;
    const horiz = cells.every(c => c[0] === cells[0][0]);
    const dir = horiz ? 'h' : 'v';
    const minR = Math.min(...cells.map(c=>c[0])), minC = Math.min(...cells.map(c=>c[1]));
    pieces.push({ r: minR, c: minC, len, dir });
  }
  return { pieces, walls };
}

const lines = readFileSync('tools/data/fogleman-boards.txt','utf8').split('\n').map(l=>l.trim()).filter(Boolean);
const allBoards = [];
for(const line of lines){
  const parts = line.split(/\s+/);
  if(parts.length < 2) continue;
  const board36 = parts[1];
  if(board36.length !== 36) continue;
  const { pieces, walls } = parseBoard(board36);
  allBoards.push({ par: Number(parts[0]), pieces, walls, key: levelKey(pieces, walls) });
}

const usedKeys = new Set();
const [lvMod, bMod, iMod] = await Promise.all([
  import('../js/levels.data.js'), import('../js/bounty-rotation.data.js'), import('../js/impound-lot.data.js'),
]);
const addUsed = arr => arr.forEach(lv => {
  const pieces = lv.p.map(a=>({r:a[0],c:a[1],len:a[2],dir:a[3]}));
  usedKeys.add(levelKey(pieces, lv.w||[]));
});
addUsed(lvMod.LEVELS); addUsed(bMod.BOUNTY_ROTATION); addUsed(iMod.IMPOUND_LOT);

const unclaimed = allBoards.filter(b => !usedKeys.has(b.key));
console.log(`Scoring ${unclaimed.length} unclaimed boards…`);
const scored = [];
const t0 = Date.now();
unclaimed.forEach((b, i) => {
  const sol = solve(b.pieces, { walls: b.walls, maxStates: 2000000 });
  if(!sol.solvable || sol.optimal !== b.par){
    console.error(`  skip (resolve mismatch): claimed par ${b.par}, solver says ${sol.solvable ? sol.optimal : 'unsolvable'}`);
    return;
  }
  const stats = rate(b.pieces, sol, b.walls);
  scored.push({ m: b.par, d: stats.score, p: b.pieces.map(p => [p.r, p.c, p.len, p.dir]), w: b.walls, key: b.key });
  if((i+1) % 100 === 0) console.log(`  ${i+1}/${unclaimed.length} (${((Date.now()-t0)/1000).toFixed(1)}s)`);
});
writeFileSync('.genwork/fogleman-reserve-scored.json', JSON.stringify(scored));
console.log(`Scored ${scored.length} boards in ${((Date.now()-t0)/1000).toFixed(1)}s -> .genwork/fogleman-reserve-scored.json`);

const byPar = {};
scored.forEach(l => { (byPar[l.m] ??= []).push(l.d); });
Object.keys(byPar).map(Number).sort((a,b)=>a-b).forEach(p => {
  const ds = byPar[p];
  console.log(`par ${p}: d ${Math.min(...ds).toFixed(1)}-${Math.max(...ds).toFixed(1)} (n=${ds.length})`);
});
