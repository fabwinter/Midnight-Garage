#!/usr/bin/env node
/* CI-style check: every shipped level must be solvable with par == optimal,
   respect board invariants, and the daily puzzle must generate for the next
   two weeks. Run with `npm run verify`. */

import { LEVELS, CHAPTERS, CHAPTER_SIZE, INTRO } from '../js/levels.data.js';
import { BOUNTY_ROTATION } from '../js/bounty-rotation.data.js';
import { IMPOUND_LOT } from '../js/impound-lot.data.js';
import { solve, N, EXIT_ROW, levelKey } from '../js/solver.js';
import { dailyLevel } from '../js/generate.js';
import { bountyFor, BOUNTY_EPOCH } from '../js/bounty.js';
import { todayStr } from '../js/storage.js';
import { bucketSequence, familyFromTag, familyFromHex, familiesUsedBy, boundedExclude, bucketizeByFamily, combinedPhotos } from '../js/art.js';
import { carIdForLevel, carIdForBountyTier, skinFor } from '../js/collection.js';

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
  const sol = solve(pieces, { walls: lv.w, gates: lv.g, hitches: lv.h });
  if(!sol.solvable) bad(`level ${i + 1}: unsolvable`);
  else if(sol.optimal !== lv.m) bad(`level ${i + 1}: par ${lv.m} but optimal ${sol.optimal}`);
  (lv.h ?? []).forEach((h, hi) => {
    if(!pieces[h.tow]) bad(`level ${i + 1}: hitch ${hi} tow index ${h.tow} out of range`);
    if(!pieces[h.trailer]) bad(`level ${i + 1}: hitch ${hi} trailer index ${h.trailer} out of range`);
    if(h.tow === 0 || h.trailer === 0) bad(`level ${i + 1}: hitch ${hi} involves the hero piece`);
    if(pieces[h.tow] && pieces[h.trailer] && pieces[h.tow].dir !== pieces[h.trailer].dir){
      bad(`level ${i + 1}: hitch ${hi} tow/trailer orientations differ — auto-couple never fires`);
    }
  });
  (lv.g ?? []).forEach((gt, gi) => {
    const [gr, gc] = gt.gate;
    if(gr < 0 || gc < 0 || gr >= N || gc >= N){
      bad(`level ${i + 1}: gate ${gi} cell [${gr},${gc}] out of bounds`);
    }
    // Gate cell must not be under a starting piece (but sensors under a piece are ok)
    for(const p of pieces){
      for(let k = 0; k < p.len; k++){
        const r = p.r + (p.dir === 'v' ? k : 0), c = p.c + (p.dir === 'h' ? k : 0);
        if(r === gr && c === gc){
          bad(`level ${i + 1}: gate ${gi} cell under piece`);
          break;
        }
      }
    }
    // Gate cell must not be on a wall
    for(const [wr, wc] of (lv.w ?? [])){
      if(wr === gr && wc === gc){
        bad(`level ${i + 1}: gate ${gi} cell on roadwork`);
      }
    }
    // Sensors must be in bounds and not coincide with gate cell
    (gt.sensors ?? []).forEach((s, si) => {
      const [sr, sc] = s;
      if(sr < 0 || sc < 0 || sr >= N || sc >= N){
        bad(`level ${i + 1}: gate ${gi} sensor ${si} [${sr},${sc}] out of bounds`);
      }
      if(sr === gr && sc === gc){
        bad(`level ${i + 1}: gate ${gi} sensor ${si} coincides with gate cell`);
      }
    });
    // Passage axis must be explicit ('h'/'v') — it decides which traffic
    // may cross the barrier at all (legalMoves' gateBlocks), so a missing
    // value silently falling back to 'h' could make a shipped board
    // unsolvable in a way par verification alone wouldn't localise.
    if(gt.axis !== 'h' && gt.axis !== 'v'){
      bad(`level ${i + 1}: gate ${gi} has axis ${JSON.stringify(gt.axis)} (want 'h' or 'v')`);
    }
    // An exit-row gate the hero can't drive through is unwinnable by
    // construction — cheap explicit check, rather than inferring it from
    // an unsolvable-board failure further down.
    if(gr === EXIT_ROW && gt.axis === 'v'){
      bad(`level ${i + 1}: gate ${gi} sits on the exit row but only passes traffic vertically`);
    }
  });
  // Gate levels must exercise the gate: solution without gates must be longer
  if(lv.g && lv.g.length > 0){
    const solWithGate = sol;
    const solWithoutGate = solve(pieces, { walls: lv.w });
    if(solWithoutGate.solvable && solWithGate.optimal <= solWithoutGate.optimal){
      bad(`level ${i + 1}: gate is decorative (with gate: ${solWithGate.optimal}, without: ${solWithoutGate.optimal})`);
    }
  }
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

// Chapter score floors must strictly increase so each stage is genuinely
// harder — checked on the difficulty MODEL score (d), not raw par (m).
// The two aren't interchangeable: d also folds in branching/uniqueness/
// counterintuitive-move factors (see js/solver.js rate()), so a lower-par
// board can legitimately outscore a higher-par one, and a curve selected
// by score (the 200->500 expansion's tools/extend-to-500.mjs) can have
// chapters with overlapping par ranges while still strictly escalating in
// real difficulty. Requiring par itself to be strictly increasing here
// would reject correct, harder-by-the-model-that-actually-matters output.
for(let c = 1; c < CHAPTERS.length; c++){
  const prevMin = Math.min(...LEVELS.slice((c - 1) * CHAPTER_SIZE, c * CHAPTER_SIZE).map(l => l.d));
  const curMin = Math.min(...LEVELS.slice(c * CHAPTER_SIZE, (c + 1) * CHAPTER_SIZE).map(l => l.d));
  if(curMin <= prevMin) bad(`chapter ${c + 1}: score floor ${curMin} does not exceed chapter ${c}'s ${prevMin}`);
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

// every curated bounty board (H4 "Tonight's Mark") must independently
// re-solve to the par baked in at curation time (tools/gen-bounty-pool.mjs)
BOUNTY_ROTATION.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const hero = pieces[0];
  if(hero.dir !== 'h' || hero.r !== EXIT_ROW) bad(`bounty rotation slot ${i}: hero must be horizontal on row ${EXIT_ROW}`);
  const sol = solve(pieces, { walls: lv.w });
  if(!sol.solvable) bad(`bounty rotation slot ${i}: unsolvable`);
  else if(sol.optimal !== lv.m) bad(`bounty rotation slot ${i}: par ${lv.m} but optimal ${sol.optimal}`);
  if(!['common', 'uncommon', 'rare', 'legendary'].includes(lv.tier)) bad(`bounty rotation slot ${i}: unknown tier "${lv.tier}"`);
});

// the next 14 nights' bounty picks must resolve deterministically
for(let d = 0; d < 14; d++){
  const ds = new Date(Math.max(start, Date.parse(BOUNTY_EPOCH + 'T00:00:00Z')) + d * 86400000).toISOString().slice(0, 10);
  const lv = bountyFor(ds);
  if(!lv){ bad(`bounty ${ds}: no pick returned`); continue; }
  const again = bountyFor(ds);
  if(JSON.stringify(lv.p) !== JSON.stringify(again.p) || lv.condition !== again.condition) bad(`bounty ${ds}: non-deterministic`);
}

// every Impound Lot board (N2) must independently re-solve, and its
// stored `key` — what save.impound.stars/best are keyed by — must match
// what the solver actually computes for it, or a player's saved progress
// on that board could silently stop resolving to the right entry
const impoundKeys = new Set();
IMPOUND_LOT.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const hero = pieces[0];
  if(hero.dir !== 'h' || hero.r !== EXIT_ROW) bad(`impound slot ${i}: hero must be horizontal on row ${EXIT_ROW}`);
  const sol = solve(pieces, { walls: lv.w });
  if(!sol.solvable) bad(`impound slot ${i}: unsolvable`);
  else if(sol.optimal !== lv.m) bad(`impound slot ${i}: par ${lv.m} but optimal ${sol.optimal}`);
  const actualKey = levelKey(pieces, lv.w);
  if(lv.key !== actualKey) bad(`impound slot ${i}: stored key doesn't match the board (stored "${lv.key}", computed "${actualKey}")`);
  if(impoundKeys.has(lv.key)) bad(`impound slot ${i}: duplicate key "${lv.key}"`);
  impoundKeys.add(lv.key);
});

// No board may appear in more than one of campaign/bounty/impound — the
// same puzzle showing up in two different contexts would be a curation
// bug (tools/gen-bounty-pool.mjs, tools/gen-impound-pool.mjs, and the
// 200->500 expansion's tools/extend-to-500.mjs all draw from the same
// Fogleman reserve and must stay mutually exclusive).
const campaignKeys = new Set();
LEVELS.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const key = levelKey(pieces, lv.w);
  if(campaignKeys.has(key)) bad(`level ${i + 1}: duplicate board within the campaign (key "${key}")`);
  campaignKeys.add(key);
});
const bountyKeys = new Set();
BOUNTY_ROTATION.forEach((lv, i) => {
  const pieces = lv.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  const key = levelKey(pieces, lv.w);
  if(bountyKeys.has(key)) bad(`bounty rotation slot ${i}: duplicate board within bounty (key "${key}")`);
  bountyKeys.add(key);
  if(campaignKeys.has(key)) bad(`bounty rotation slot ${i}: board also appears in the campaign (key "${key}")`);
});
impoundKeys.forEach(key => {
  if(campaignKeys.has(key)) bad(`impound board also appears in the campaign (key "${key}")`);
  if(bountyKeys.has(key)) bad(`impound board also appears in bounty rotation (key "${key}")`);
});

// July '26 "no double-ups of colour" pass: every level's traffic must
// steer clear of the hero's own colour family, and of each other's,
// within the limits of the 12-colour-family ceiling (see js/art.js's
// COLOR_FAMILIES) — this mirrors vehicleSVG's exact allocation (truck
// pool first, unconstrained but for the hero; sedan's much roomier pool
// then bounded-excludes whatever families truck claimed) so any future
// change to that ordering that regresses back toward the "sedan claims
// everything before truck gets a turn" failure mode gets caught here
// instead of by a player noticing two blue cars on one board. A level
// needing more concurrent vehicles than there are non-hero families (11)
// is only forced into `total - 11` repeats — the least a scheme has ever
// been shown able to do here — not the raw drawn value.
const CLASSIC_RED = '#ff4d5e'; // PALETTE[0][0] — DEFAULT_CAR has no skin entry
const sedanFamilyList = Object.keys(bucketizeByFamily(combinedPhotos('sedans')));
const truckFamilyList = Object.keys(bucketizeByFamily(combinedPhotos('trucks')));

function countConcurrent(lv){
  const hitchTrailerIdxs = new Set((lv.h ?? []).map(h => h.trailer));
  let sedan = 0, truck = 0;
  lv.p.forEach((piece, i) => {
    if(i === 0 || hitchTrailerIdxs.has(i)) return;
    if(piece[2] >= 3) truck++; else sedan++;
  });
  return { sedan, truck };
}

function checkColourPlan(label, i, heroBase, sedanNeeded, truckNeeded){
  const heroFamily = familyFromHex(heroBase);
  const heroExclude = [heroFamily];
  const truckSeq = bucketSequence('truck', i, heroExclude);
  const truckFamiliesUsed = familiesUsedBy(truckSeq, truckNeeded);
  const sedanExclude = boundedExclude(heroExclude, truckFamiliesUsed, sedanFamilyList, sedanNeeded);
  const sedanSeq = bucketSequence('sedan', i, sedanExclude);
  const sedanFamilies = sedanSeq.slice(0, sedanNeeded).map(e => familyFromTag(e.color));
  const truckFamilies = truckSeq.slice(0, truckNeeded).map(e => familyFromTag(e.color));
  const seen = new Map();
  let repeats = 0;
  for(const f of [...sedanFamilies, ...truckFamilies]){
    seen.set(f, (seen.get(f) || 0) + 1);
    if(f === heroFamily) repeats++; // must never happen — hero's family is excluded outright
  }
  for(const c of seen.values()) if(c > 1) repeats += c - 1;
  const floor = Math.max(0, sedanNeeded + truckNeeded - 11); // 12 families minus the hero's own
  if(repeats > floor) bad(`${label} ${i}: ${repeats} colour-family repeat(s) among ${sedanNeeded + truckNeeded} concurrent vehicles — expected at most ${floor} (the 12-family ceiling minus the hero's own)`);
}

LEVELS.forEach((lv, i) => {
  const { sedan, truck } = countConcurrent(lv);
  const heroBase = skinFor(carIdForLevel(i))?.base ?? CLASSIC_RED;
  checkColourPlan('level', i + 1, heroBase, sedan, truck);
});
BOUNTY_ROTATION.forEach((lv, i) => {
  const { sedan, truck } = countConcurrent(lv);
  const heroBase = skinFor(carIdForBountyTier(lv.tier))?.base ?? CLASSIC_RED;
  checkColourPlan('bounty rotation slot', i, heroBase, sedan, truck);
});
// Impound has no fixed job-car hero (the player's own equipped car shows
// up instead, decided at runtime) — checked against the default red as a
// stand-in so this still exercises the mechanism itself.
IMPOUND_LOT.forEach((lv, i) => {
  const { sedan, truck } = countConcurrent(lv);
  checkColourPlan('impound slot', i, CLASSIC_RED, sedan, truck);
});

if(fail){ console.error(`${fail} check(s) failed`); process.exit(1); }
console.log(`✓ ${LEVELS.length} levels verified (par == optimal, invariants hold), 14 dailies deterministic, ${BOUNTY_ROTATION.length} bounty boards verified, ${IMPOUND_LOT.length} impound boards verified`);
