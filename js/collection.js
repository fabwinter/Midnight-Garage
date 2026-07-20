/* Collection system (HEIST-PLAN.md §3, phase H0). Cars are cosmetic hero
   skins, unlocked by skill milestones we already track — no RNG, no
   purchase gates a specific car. Tier is a flavor label describing how
   many players will realistically earn a car; it is NEVER tied to a
   purchase or weighting (that distinction is load-bearing for staying out
   of gacha-adjacent territory — see HEIST-PLAN.md §1). */

export const DEFAULT_CAR = 'classic';

/* unlock(save, dailyState) → boolean. H0's conditions read fields that
   already existed in save_v1 / daily_v1 (plus `equippedCar`/`carsSeen`,
   see game.js); the H4 bounty cars below read `save.bounties.done`
   (see js/bounty.js), the one new field that phase added. */
export const CARS = [
  {
    id: 'first-job', name: 'First Job', tier: 'common',
    skin: { base: '#ffb454', dark: '#c47a10', glass: '#3c2a0c', trim: 'none' },
    unlock: save => save.unlocked >= 2,
  },
  {
    id: 'understudy', name: 'The Understudy', tier: 'common',
    skin: { base: '#37c8ab', dark: '#177a67', glass: '#0e2f2b', trim: 'none' },
    unlock: save => save.unlocked > 50,
  },
  {
    id: 'neon-ghost', name: 'Neon Ghost', tier: 'uncommon',
    skin: { base: '#4fd2f0', dark: '#1f8fb0', glass: '#0f2c37', trim: 'none' },
    unlock: save => save.unlocked > 100,
  },
  {
    id: 'harbor-queen', name: 'Harbor Queen', tier: 'rare',
    skin: { base: '#1f9c82', dark: '#0d4a3e', glass: '#062420', trim: 'chrome' },
    unlock: save => save.unlocked > 150 && save.pro === true,
  },
  {
    id: 'midnight-phantom', name: 'Midnight Phantom', tier: 'legendary',
    skin: { base: '#2a2f3a', dark: '#101319', glass: '#0e2f2b', trim: 'plaque' },
    unlock: save => save.unlocked >= 200,
  },
  {
    id: 'steady-hand', name: 'The Steady Hand', tier: 'uncommon',
    skin: { base: '#b07cff', dark: '#6f3ad0', glass: '#291743', trim: 'none' },
    unlock: save => (save.streak3 || 0) >= 5,
  },
  {
    id: 'clean-sweep', name: 'Clean Sweep', tier: 'rare',
    skin: { base: '#f26fb1', dark: '#bb3679', glass: '#3a1229', trim: 'chrome' },
    unlock: save => (save.streak3 || 0) >= 15,
  },
  {
    id: 'night-regular', name: 'Night Regular', tier: 'common',
    skin: { base: '#ff8a5c', dark: '#c9502a', glass: '#3d1c10', trim: 'none' },
    unlock: (save, daily) => (daily?.streak || 0) >= 7,
  },
  {
    id: 'insomniac', name: 'The Insomniac', tier: 'rare',
    skin: { base: '#6f3ad0', dark: '#3d1c80', glass: '#1f0f40', trim: 'chrome' },
    unlock: (save, daily) => (daily?.streak || 0) >= 30,
  },
  {
    id: 'under-radar', name: 'Under the Radar', tier: 'uncommon',
    skin: { base: '#8fa2bd', dark: '#57687f', glass: '#1e2530', trim: 'none' },
    unlock: (save, daily) => Object.values(daily?.done || {}).some(d => d.moves <= d.par),
  },
  {
    id: 'paid-in-full', name: 'Paid in Full', tier: 'common',
    skin: { base: '#ffd84d', dark: '#d1a213', glass: '#3b3106', trim: 'chrome' },
    unlock: save => save.pro === true,
  },
  {
    id: 'completionist', name: 'The Completionist', tier: 'legendary',
    skin: { base: '#3b2270', dark: '#1f1140', glass: '#150b2b', trim: 'plaque' },
    unlock: save => {
      for(let i = 0; i < 200; i++) if((save.stars[i] || 0) !== 3) return false;
      return true;
    },
  },
  // Bounty rewards (HEIST-PLAN.md §6, phase H4): earned by clearing a
  // "Tonight's Mark" bounty under its reward condition (par/no-hints/
  // alarm-intact — see js/bounty.js). Rarity matches the cleared board's
  // own par bucket, not a completion count, so a single lucky legendary
  // night is enough — same "skill-gated, not grindy" spirit as the rest
  // of the collection.
  {
    id: 'small-fish', name: 'Small Fish', tier: 'common',
    skin: { base: '#8fbf6b', dark: '#4d7a34', glass: '#1c2b14', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'common'),
  },
  {
    id: 'fence-favorite', name: "The Fence's Favorite", tier: 'uncommon',
    skin: { base: '#e0a840', dark: '#946a1c', glass: '#2c1e08', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'uncommon'),
  },
  {
    id: 'high-value-mark', name: 'High-Value Mark', tier: 'rare',
    skin: { base: '#d43f6a', dark: '#7a1f3a', glass: '#2b0e18', trim: 'chrome' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'rare'),
  },
  {
    id: 'the-big-score', name: 'The Big Score', tier: 'legendary',
    skin: { base: '#f5d442', dark: '#a68c1f', glass: '#332b08', trim: 'plaque' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'legendary'),
  },
];

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
