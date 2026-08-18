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
import { bucketSequence, familyFromTag, familyFromHex, familiesUsedBy, boundedExclude, bucketizeByFamily, combinedPhotos, basePhotos, FAMILY_HEX } from '../js/art.js';
import { carIdForLevel, carIdForBountyTier, skinFor, CARS, POOL_SIZE } from '../js/collection.js';

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

// Job-car reward cadence (docs/HEIST-PLAN.md §3b): every job car must
// actually be the hero of some level, or its unlock condition can never
// fire. This is exactly what a stale chapter clamp broke silently before
// (Math.min(3, ...) left over from a 4-chapter campaign, orphaning every
// car past chapter 4 once the campaign grew to 10) — a car can exist in
// the roster, look correctly tiered, and still be unreachable forever.
const JOB_CARS_CHECK = CARS.filter(c => c.chapter !== undefined);
{
  const reachable = new Set();
  for(let i = 0; i < LEVELS.length; i++) reachable.add(carIdForLevel(i));
  JOB_CARS_CHECK.forEach(c => {
    if(!reachable.has(c.id)) bad(`job car "${c.id}" (${c.name}) is never the hero of any of the ${LEVELS.length} campaign levels — its unlock can never fire`);
  });
}

// Every job car should unlock exactly CHAPTER_SIZE/POOL_SIZE levels after
// the previous one, across the whole campaign — the flat cadence that
// lets rarity (not spacing) carry the escalation from common to
// legendary. Simulated by walking a synthetic save through a full
// sequential clear rather than re-deriving the block arithmetic here,
// same reasoning as jobUnlockCheck() itself: this proves the ACTUAL
// unlock behaviour, not just that the intended formula was typed
// correctly somewhere.
{
  const save = { jobClears: {} };
  const unlockLevel = {};
  for(let i = 0; i < LEVELS.length; i++){
    save.jobClears[i] = true;
    JOB_CARS_CHECK.forEach(c => { if(unlockLevel[c.id] === undefined && c.unlock(save)) unlockLevel[c.id] = i + 1; });
  }
  const levels = JOB_CARS_CHECK.map(c => unlockLevel[c.id]).filter(l => l !== undefined).sort((a, b) => a - b);
  if(levels.length !== JOB_CARS_CHECK.length) bad(`only ${levels.length}/${JOB_CARS_CHECK.length} job cars ever unlock across a full sequential playthrough of all ${LEVELS.length} levels`);
  const expectedGap = CHAPTER_SIZE / POOL_SIZE;
  for(let i = 1; i < levels.length; i++){
    const gap = levels[i] - levels[i - 1];
    if(gap !== expectedGap) bad(`unlock milestone gap between level ${levels[i - 1]} and ${levels[i]} is ${gap}, expected ${expectedGap}`);
  }
}

// Relaxed must never earn cars ("no job, no reward" — see
// heroCarIdForAttempt/jobUnlockCheck's comments). A Relaxed clear writes
// save.stars but never save.jobClears, so a synthetic save with every
// level 3-starred but jobClears empty must unlock nothing. This is the
// most likely way to break the cadence rework above: reaching for the
// obvious cleared-set when rewriting the unlock condition means reaching
// for save.stars, and swapping it in silently lets Relaxed earn cars
// again — it did once, which is why jobClears exists at all (see the
// grandfather clause in js/game.js's save loader).
{
  const relaxedOnlySave = { jobClears: {}, stars: Object.fromEntries(LEVELS.map((_, i) => [i, 3])) };
  JOB_CARS_CHECK.forEach(c => {
    if(c.unlock(relaxedOnlySave)) bad(`job car "${c.id}" unlocks from Relaxed-only progress (stars populated, jobClears empty) — Relaxed must never earn cars`);
  });
}

// Hero art is sports cars only — these bodies exist in assets/cars/ for
// traffic and must never become a player car. Matched on filename
// fragments because that's what a human reviewing an assignment sees.
// This exists because traffic-sedan-25 IS a police livery despite its
// neutral filename, so it slipped in as a chapter-1 reward and a grep for
// "police" didn't catch it — a game whose fail state is "the police
// arrive" must not hand the player a squad car. The rust-weathered body
// is the broken-down car, and the plain sedans/hatch/SUV read as a
// demotion from the red sports car level 1 opens with.
const NEVER_A_HERO = [
  ['police', 'police livery'],
  ['traffic-sedan-25', 'police livery (neutral filename)'],
  ['rust-weathered', 'the broken-down-car body'],
  ['traffic-sedan-28', 'rust-weathered body'],
  ['orange-suv', 'an SUV, not a sports car'],
  ['red-hatch', 'an economy hatchback'],
  ['green-hatch', 'an economy hatchback'],
  ['traffic-sedan-13', 'a plain sedan'],
  ['new-lightblue', 'a plain sedan'],
  ['hero-sedan-bronze', 'a four-door sedan'],
  ['hero-sedan-green', 'a four-door sedan'],
];
CARS.forEach(car => {
  if(!car.photo) return;
  const hit = NEVER_A_HERO.find(([frag]) => car.photo.includes(frag));
  if(hit) bad(`car "${car.id}" uses ${car.photo.split('/').pop()} as hero art — ${hit[1]}; hero art is sports cars only (see js/collection.js)`);
});

// Every FAMILY_HEX value must round-trip through familyFromHex() as its
// own key — this table is handed straight back out as a hero's
// skin.base (js/collection.js), which then gets re-classified via
// familyFromHex() for traffic exclusion. A value that doesn't round-trip
// silently excludes the wrong family — caught once already (brown's
// original '#8a5a34' classified as orange under familyFromHex's own
// hue/saturation split despite looking like a plausible brown).
for(const [fam, hex] of Object.entries(FAMILY_HEX)){
  const back = familyFromHex(hex);
  if(back !== fam) bad(`FAMILY_HEX.${fam} (${hex}) round-trips through familyFromHex() as "${back}", not "${fam}"`);
}

// Every car with bespoke art (skin.photo) whose photo is ALSO in ordinary
// traffic rotation must have a skin.base that classifies into the SAME
// family as that photo's own traffic `color` tag — otherwise the wrong
// family gets excluded when this car is the hero, and its own photo can
// appear as both the hero and background traffic on one level. The two
// classifiers (familyFromTag for traffic's tag, familyFromHex for a
// hero's base hex) are independent code paths over independent data, so
// nothing else guarantees they agree for a given photo.
{
  const sedanTagOf = new Map(basePhotos('sedans').map(e => [e.img, e.color]));
  const truckTagOf = new Map(basePhotos('trucks').map(e => [e.img, e.color]));
  CARS.forEach(car => {
    if(!car.photo) return;
    const tag = sedanTagOf.get(car.photo) ?? truckTagOf.get(car.photo);
    if(tag === undefined) return; // this photo isn't also in traffic rotation — nothing to cross-check
    const tagFamily = familyFromTag(tag);
    const baseFamily = familyFromHex(car.skin.base);
    if(tagFamily !== baseFamily){
      bad(`car "${car.id}" skin.base (${car.skin.base}, family "${baseFamily}") doesn't match its own photo's traffic family ("${tagFamily}") — the same photo could show up as both this car's hero art and ordinary traffic on one level`);
    }
  });
}

if(fail){ console.error(`${fail} check(s) failed`); process.exit(1); }
console.log(`✓ ${LEVELS.length} levels verified (par == optimal, invariants hold), 14 dailies deterministic, ${BOUNTY_ROTATION.length} bounty boards verified, ${IMPOUND_LOT.length} impound boards verified, ${JOB_CARS_CHECK.length} job cars reachable with a flat 10-level cadence`);
