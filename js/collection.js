/* Collection system (HEIST-PLAN.md §3). Cars are cosmetic hero skins —
   zero gameplay effect, no RNG, no purchase gates a specific car (the
   distinction that keeps this out of gacha-adjacent territory, see
   HEIST-PLAN.md §1). Tier is a flavor label describing how many players
   will realistically earn a car, never a purchase weighting.

   Direction (per HEIST-PLAN.md §2's original "the mark, not always red"
   fiction, now implemented): campaign and bounty levels don't let you pick
   your car — "the job" decides it, same as a real heist crew doesn't get
   to choose what's in the truck. Clear a level and the mark you drove
   becomes yours to keep. Only Relaxed and Daily (no "job" framing, just
   your own driving) let you equip any car you've already earned — see
   `heroCarIdFor()` in js/game.js for where that split is enforced.

   Two pools:
   - Job cars (20): five per campaign chapter, round-robin assigned across
     that chapter's 50 levels by `carIdForLevel()`, so each car is the hero
     in ~10 missions. Unlocked the first time you clear one of its
     missions — see `jobUnlockCheck()`. Chapter-gating (Pro paywall on
     chapters 3-4, `save.unlocked` progress within a chapter) already does
     the rarity work for higher tiers; no extra meta-condition needed.
   - Bounty marks (4): one per rarity tier, shown as the hero on every
     "Tonight's Mark" of that tier (`carIdForBountyTier()`). Unlocked by
     clearing a bounty under its nightly reward condition — unchanged from
     H4's original design. */

import { CHAPTER_SIZE } from './levels.data.js';

export const DEFAULT_CAR = 'classic';
export const POOL_SIZE = 5;

/* skin.photo: seam for bespoke per-car art (top-down, front-right, own
   headlights — see classic.png's conventions). Until a car has one, its
   hero render falls back to the recolored-sedan-photo treatment every
   other car already used (see js/art.js) — nothing breaks while art
   lands car by car. */
function jobUnlockCheck(chapter, slot){
  const from = chapter * CHAPTER_SIZE;
  return save => {
    for(let i = slot; i < CHAPTER_SIZE; i += POOL_SIZE){
      if((save.stars[from + i] || 0) > 0) return true;
    }
    return false;
  };
}

/* Job cars, five per chapter, in chapter order — chapter/slot are derived
   from array position below (see the assignment loop), not hand-typed, so
   reordering a chapter's five entries can't drift out of sync with it. */
const JOB_CARS = [
  // --- Night Shift (ch. 1) — everyday metal, all common/uncommon -------
  {
    id: 'first-job', name: 'First Job', tier: 'common', photo: null,
    skin: { base: '#ffb454', dark: '#c47a10', glass: '#3c2a0c', trim: 'none' },
  },
  {
    id: 'understudy', name: 'The Understudy', tier: 'common', photo: null,
    skin: { base: '#37c8ab', dark: '#177a67', glass: '#0e2f2b', trim: 'none' },
  },
  {
    id: 'night-regular', name: 'Night Regular', tier: 'common', photo: null,
    skin: { base: '#ff8a5c', dark: '#c9502a', glass: '#3d1c10', trim: 'none' },
  },
  {
    id: 'paid-in-full', name: 'Paid in Full', tier: 'common', photo: null,
    skin: { base: '#ffd84d', dark: '#d1a213', glass: '#3b3106', trim: 'chrome' },
  },
  {
    id: 'under-radar', name: 'Under the Radar', tier: 'uncommon', photo: null,
    skin: { base: '#8fa2bd', dark: '#57687f', glass: '#1e2530', trim: 'none' },
  },
  // --- Neon District (ch. 2) — tuner scene, uncommon leaning rare ------
  {
    id: 'neon-ghost', name: 'Neon Ghost', tier: 'uncommon', photo: null,
    skin: { base: '#4fd2f0', dark: '#1f8fb0', glass: '#0f2c37', trim: 'none' },
  },
  {
    id: 'steady-hand', name: 'The Steady Hand', tier: 'uncommon', photo: null,
    skin: { base: '#b07cff', dark: '#6f3ad0', glass: '#291743', trim: 'none' },
  },
  {
    id: 'street-tuner', name: 'Street Tuner', tier: 'uncommon', photo: null,
    skin: { base: '#9be03f', dark: '#5f8f1e', glass: '#1c2b0c', trim: 'none' },
  },
  {
    id: 'lowrider', name: 'The Low Rider', tier: 'uncommon', photo: null,
    skin: { base: '#c23a5e', dark: '#701f36', glass: '#2b0f18', trim: 'chrome' },
  },
  {
    id: 'clean-sweep', name: 'Clean Sweep', tier: 'rare', photo: null,
    skin: { base: '#f26fb1', dark: '#bb3679', glass: '#3a1229', trim: 'chrome' },
  },
  // --- Harbor Freight (ch. 3) — classics and muscle, mostly rare -------
  {
    id: 'harbor-queen', name: 'Harbor Queen', tier: 'rare', photo: null,
    skin: { base: '#1f9c82', dark: '#0d4a3e', glass: '#062420', trim: 'chrome' },
  },
  {
    id: 'insomniac', name: 'The Insomniac', tier: 'rare', photo: null,
    skin: { base: '#6f3ad0', dark: '#3d1c80', glass: '#1f0f40', trim: 'chrome' },
  },
  {
    id: 'dockside-classic', name: 'Dockside Classic', tier: 'rare', photo: null,
    skin: { base: '#3a5a8f', dark: '#1e3357', glass: '#0e1a2b', trim: 'chrome' },
  },
  {
    id: 'crate-fresh', name: 'Crate Fresh', tier: 'uncommon', photo: null,
    skin: { base: '#e7ebf0', dark: '#a6adba', glass: '#232a33', trim: 'chrome' },
  },
  {
    id: 'american-steel', name: 'American Steel', tier: 'rare', photo: null,
    skin: { base: '#d1502a', dark: '#873217', glass: '#2b140a', trim: 'none' },
  },
  // --- Gridlock (ch. 4) — endgame exotics, rare leaning legendary ------
  {
    id: 'midnight-phantom', name: 'Midnight Phantom', tier: 'legendary', photo: null,
    skin: { base: '#2a2f3a', dark: '#101319', glass: '#0e2f2b', trim: 'plaque' },
  },
  {
    id: 'vintage-icon', name: 'The Vintage Icon', tier: 'rare', photo: null,
    skin: { base: '#3b2270', dark: '#1f1140', glass: '#150b2b', trim: 'plaque' },
  },
  {
    id: 'grand-tourer', name: 'Grand Tourer', tier: 'legendary', photo: null,
    skin: { base: '#1f5c3f', dark: '#0e3322', glass: '#0a1f16', trim: 'plaque' },
  },
  {
    id: 'apex-predator', name: 'Apex Predator', tier: 'legendary', photo: null,
    skin: { base: '#1a1d24', dark: '#0a0c10', glass: '#3a2f08', trim: 'plaque' },
  },
  {
    id: 'midnight-runner', name: 'Midnight Runner', tier: 'rare', photo: null,
    skin: { base: '#465b7a', dark: '#26374f', glass: '#101825', trim: 'plaque' },
  },
];
JOB_CARS.forEach((car, i) => {
  car.chapter = Math.floor(i / POOL_SIZE);
  car.slot = i % POOL_SIZE;
  car.unlock = jobUnlockCheck(car.chapter, car.slot);
});

/* Bounty marks (HEIST-PLAN.md §6, phase H4): earned by clearing a
   "Tonight's Mark" under its reward condition (par/no-hints/alarm-intact —
   see js/bounty.js). One per rarity tier; that tier's car is also the hero
   shown while playing any bounty of that tier (see carIdForBountyTier). */
const BOUNTY_CARS = [
  {
    id: 'small-fish', name: 'Small Fish', tier: 'common', bountyTier: 'common', photo: null,
    skin: { base: '#8fbf6b', dark: '#4d7a34', glass: '#1c2b14', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'common'),
  },
  {
    id: 'fence-favorite', name: "The Fence's Favorite", tier: 'uncommon', bountyTier: 'uncommon', photo: null,
    skin: { base: '#e0a840', dark: '#946a1c', glass: '#2c1e08', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'uncommon'),
  },
  {
    id: 'high-value-mark', name: 'High-Value Mark', tier: 'rare', bountyTier: 'rare', photo: null,
    skin: { base: '#d43f6a', dark: '#7a1f3a', glass: '#2b0e18', trim: 'chrome' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'rare'),
  },
  {
    id: 'the-big-score', name: 'The Big Score', tier: 'legendary', bountyTier: 'legendary', photo: null,
    skin: { base: '#f5d442', dark: '#a68c1f', glass: '#332b08', trim: 'plaque' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'legendary'),
  },
];

export const CARS = [...JOB_CARS, ...BOUNTY_CARS];

/* Which car is the hero for a given campaign level (0-based LEVELS index).
   Round-robins the level's chapter pool, five cars deep — same car is the
   mark for 10 missions before the pool repeats. */
export function carIdForLevel(idx){
  // Level 1 is everyone's first look at the game, in every mode (Heist/
  // Pursuit/Relaxed just change pacing, not which level this is) — it
  // stays the classic red car rather than handing a brand-new player an
  // unfamiliar job car before they've even seen the "free the red car"
  // premise. Clearing it still unlocks First Job (chapter 0 slot 0) same
  // as any other level in its rotation; the car just isn't on screen for it.
  if(idx === 0) return DEFAULT_CAR;
  const chapter = Math.min(3, Math.floor(idx / CHAPTER_SIZE));
  const slot = idx % CHAPTER_SIZE % POOL_SIZE;
  const pool = JOB_CARS.filter(c => c.chapter === chapter);
  return pool[slot]?.id ?? DEFAULT_CAR;
}

/* Which car is the hero for tonight's bounty, by its rarity tier. */
export function carIdForBountyTier(tier){
  return BOUNTY_CARS.find(c => c.bountyTier === tier)?.id ?? DEFAULT_CAR;
}

export function ownedCarIds(save, daily){
  const owned = new Set([DEFAULT_CAR]);
  for(const car of CARS) if(car.unlock(save, daily)) owned.add(car.id);
  return owned;
}

/* Car ids that are newly unlocked and haven't had their reveal shown yet. */
export function pendingReveals(save, daily){
  const owned = ownedCarIds(save, daily);
  const seen = new Set(save.carsSeen || []);
  return CARS.filter(c => owned.has(c.id) && !seen.has(c.id));
}

export function carById(id){
  return CARS.find(c => c.id === id) || null;
}

export function skinFor(carId){
  const car = carById(carId);
  return car ? car.skin : null;   // null → caller falls back to PALETTE[0] (classic)
}
