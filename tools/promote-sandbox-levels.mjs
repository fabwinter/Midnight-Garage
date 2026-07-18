#!/usr/bin/env node
/* Promote sandbox-designed levels (exported from the in-game admin Sandbox
   → Export / Export all, js/game.js: sbExportOne/sbExportAllBtn) into the
   shipped 200-level campaign.

   The live game can't write to its own source — this is the other half of
   that handoff: paste what Export copied into a file, then run this script
   against it. Verifies each level independently of whatever `m` the
   sandbox exported (recomputes true par via the solver, same as every
   other level in this codebase), picks the chapter whose par band the
   level actually falls into, and replaces that chapter's current LOWEST-
   scoring level with it — keeps the campaign at a fixed 200 levels / 50
   per chapter, same reasoning as tools/add-hitch-levels.mjs.

   Usage:
     node tools/promote-sandbox-levels.mjs level.json
     node tools/promote-sandbox-levels.mjs level.json --dry-run
     node tools/promote-sandbox-levels.mjs level.json --chapter "Gridlock"
     pbpaste | node tools/promote-sandbox-levels.mjs -        # read stdin

   Accepts either one exported level object or an array of them (Export all
   produces an array). */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, rate, N, EXIT_ROW } from '../js/solver.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run');
const chapterOpt = (() => {
  const i = args.indexOf('--chapter');
  return i >= 0 ? args[i + 1] : null;
})();

if(!file){
  console.error('Usage: node tools/promote-sandbox-levels.mjs <level.json|-> [--dry-run] [--chapter "Name"]');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'js', 'levels.data.js');

function readInput(){
  if(file === '-'){
    return readFileSync(0, 'utf8');   // stdin
  }
  return readFileSync(file, 'utf8');
}

let raw;
try{
  raw = JSON.parse(readInput());
}catch(e){
  console.error(`Couldn't parse ${file} as JSON: ${e.message}`);
  process.exit(1);
}
const candidates = Array.isArray(raw) ? raw : [raw];
if(!candidates.length){
  console.error('No levels in input.');
  process.exit(1);
}

function checkInvariants(lv, label){
  const problems = [];
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const hero = pieces[0];
  if(!hero || hero.dir !== 'h' || hero.r !== EXIT_ROW){
    problems.push(`hero must be horizontal on row ${EXIT_ROW}`);
  }
  const g = Array.from({ length: N }, () => Array(N).fill(false));
  for(const [r, c] of (lv.w ?? [])){
    if(r < 0 || c < 0 || r >= N || c >= N){ problems.push('roadworks out of bounds'); continue; }
    if(r === EXIT_ROW){ problems.push('roadworks in exit row (unwinnable)'); continue; }
    if(g[r][c]){ problems.push('overlapping roadworks'); continue; }
    g[r][c] = true;
  }
  for(const p of pieces){
    for(let k = 0; k < p.len; k++){
      const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
      if(r >= N || c >= N || r < 0 || c < 0){ problems.push('piece out of bounds'); break; }
      if(g[r][c]){ problems.push('overlapping pieces'); break; }
      g[r][c] = true;
    }
  }
  pieces.slice(1).forEach(p => {
    if(p.dir === 'h' && p.r === EXIT_ROW) problems.push('non-hero horizontal piece in exit row (unwinnable)');
  });
  if(problems.length){
    console.error(`✗ ${label}: ${problems.join('; ')}`);
    return null;
  }
  return pieces;
}

async function main(){
  const { LEVELS, CHAPTERS, CHAPTER_SIZE, INTRO } = await import(`${'file://' + OUT}?t=${Date.now()}`);

  const targetChapters = chapterOpt
    ? CHAPTERS.filter(c => c.name.toLowerCase() === chapterOpt.toLowerCase())
    : CHAPTERS;
  if(chapterOpt && !targetChapters.length){
    console.error(`No chapter named "${chapterOpt}". Options: ${CHAPTERS.map(c => c.name).join(', ')}`);
    process.exit(1);
  }

  const accepted = [];   // { chapterIdx, level }
  candidates.forEach((raw, idx) => {
    const label = raw.name || `candidate ${idx + 1}`;
    const pieces = checkInvariants(raw, label);
    if(!pieces) return;

    const sol = solve(pieces, { walls: raw.w, gates: raw.g, hitches: raw.h });
    if(!sol.solvable){
      console.error(`✗ ${label}: not solvable`);
      return;
    }
    const stats = rate(pieces, sol, raw.w, raw.g, raw.h);

    const fits = (chapterOpt ? targetChapters : CHAPTERS)
      .filter(ch => sol.optimal >= ch.minM && sol.optimal <= ch.maxM);
    if(!fits.length){
      const bands = CHAPTERS.map(c => `${c.name} ${c.minM}-${c.maxM}`).join(', ');
      console.error(`✗ ${label}: par ${sol.optimal} doesn't fall in any chapter band (${bands})`);
      return;
    }
    const chapter = fits[0];
    const chapterIdx = CHAPTERS.indexOf(chapter);
    console.log(`✓ ${label}: par ${sol.optimal}, score ${stats.score} → ${chapter.name}`);

    accepted.push({
      chapterIdx,
      level: { m: sol.optimal, d: stats.score, p: raw.p, ...(raw.w?.length ? { w: raw.w } : {}), ...(raw.g?.length ? { g: raw.g } : {}), ...(raw.h?.length ? { h: raw.h } : {}) },
    });
  });

  if(!accepted.length){
    console.log('\nNothing to promote.');
    return;
  }

  console.log(`\n${accepted.length}/${candidates.length} level(s) verified and ready.`);
  if(DRY_RUN){
    console.log('--dry-run: not writing levels.data.js.');
    return;
  }

  // Replace the lowest-scoring level in each affected chapter, one promoted
  // level at a time (so two promotions targeting the same chapter don't
  // both pick the same "lowest" slot), then re-sort that chapter by score.
  const newLevels = LEVELS.slice();
  const touchedChapters = new Set();
  for(const { chapterIdx, level } of accepted){
    const start = chapterIdx * CHAPTER_SIZE;
    const slice = newLevels.slice(start, start + CHAPTER_SIZE);
    let worstLocal = 0;
    for(let i = 1; i < slice.length; i++) if(slice[i].d < slice[worstLocal].d) worstLocal = i;
    // never evict an intro-ramp level (chapter 0's first INTRO slots)
    if(chapterIdx === 0 && worstLocal < INTRO){
      worstLocal = INTRO + [...slice.slice(INTRO)].reduce((bi, l, i) => l.d < slice[INTRO + bi].d ? i : bi, 0);
    }
    slice[worstLocal] = level;
    slice.sort((a, b) => a.d - b.d || a.m - b.m);
    newLevels.splice(start, CHAPTER_SIZE, ...slice);
    touchedChapters.add(chapterIdx);
  }

  console.log('Re-verifying all 200 levels…');
  newLevels.forEach((lv, i) => {
    const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
    const sol = solve(pieces, { walls: lv.w, gates: lv.g, hitches: lv.h });
    if(!sol.solvable || sol.optimal !== lv.m){
      throw new Error(`level ${i + 1} failed verification (par ${lv.m}, solved ${sol.solvable ? sol.optimal : 'unsolvable'})`);
    }
  });
  console.log('All verified.');

  const levelsJs = `/* AUTO-GENERATED by tools/generate-levels.mjs, then tools/add-hitch-levels.mjs
   and tools/promote-sandbox-levels.mjs — do not edit by hand. 200 levels,
   verified optimal (m = par), curved by difficulty model v1 score (d). */

export const CHAPTER_SIZE = ${CHAPTER_SIZE};

/* Levels 1–INTRO ease in below chapter 1's floor; every later level needs ≥ minM moves. */
export const INTRO = ${INTRO};

export const CHAPTERS = ${JSON.stringify(CHAPTERS, null, 2)};

export const LEVELS = [
${newLevels.map(lv => JSON.stringify({
    m: lv.m, d: lv.d, p: lv.p,
    ...(lv.w?.length ? { w: lv.w } : {}),
    ...(lv.g?.length ? { g: lv.g } : {}),
    ...(lv.h?.length ? { h: lv.h } : {}),
  })).join(',\n')}
];
`;

  writeFileSync(OUT, levelsJs);
  console.log(`Wrote ${OUT}`);
  [...touchedChapters].forEach(ci => console.log(`  ${CHAPTERS[ci].name}: 1 slot replaced`));
}

main();
