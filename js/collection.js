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
   - Job cars (50): five per campaign chapter (10 chapters), round-robin
     assigned across that chapter's 50 levels by `carIdForLevel()` in
     contiguous ten-level blocks — car N is the hero of levels
     10N+1..10N+10 within its chapter, not scattered across it. Unlocked
     on clearing the LAST level of its block, not the first sight of it
     (see `jobUnlockCheck()`) — you drive a car for its full ten-mission
     run before it's yours, one milestone every 10 levels for all 500,
     rather than every car in a chapter arriving in its first five levels
     and nothing after. `tier` is hand-assigned into an explicit pyramid
     (10 common / 15 uncommon / 15 rare / 10 legendary, chapters 1-2 /
     3-5 / 6-8 / 9-10) — chapter position alone no longer implies rarity,
     it's the actual source of truth for the curve. See docs/HEIST-PLAN.md
     §3b for the full reasoning and the reward-curve bug this replaced.
   - Bounty marks (4): one per rarity tier, shown as the hero on every
     "Tonight's Mark" of that tier (`carIdForBountyTier()`). Unlocked by
     clearing a bounty under its nightly reward condition — unchanged from
     H4's original design. */

import { CHAPTER_SIZE } from './levels.data.js';
import { getLibrary } from './library.js';

export const DEFAULT_CAR = 'classic';
export const POOL_SIZE = 5;
// Each car fronts one contiguous block of levels within its chapter
// (levels 1-10 -> slot 0, 11-20 -> slot 1, ...) rather than cycling every
// five levels — a block is long enough to actually drive the car before
// it's handed to you, see jobUnlockCheck's comment below. Declared here,
// not next to carIdForLevel further down, because JOB_CARS.forEach calls
// jobUnlockCheck(car) at module load — which calls carIdForLevel()
// synchronously to find each car's unlock level — before this file
// reaches carIdForLevel's own definition; a `const` declared down there
// would be in its temporal dead zone at that point.
const BLOCK_SIZE = CHAPTER_SIZE / POOL_SIZE;

/* skin.photo: seam for bespoke per-car art (top-down, front-right, own
   headlights — see classic.png's conventions). Until a car has one, its
   hero render falls back to the recolored-sedan-photo treatment every
   other car already used (see js/art.js) — nothing breaks while art
   lands car by car. */
/* Finds car's own unlock level by scanning carIdForLevel() rather than
   re-deriving block arithmetic independently — the two used to be two
   separate sources of truth for "which car is level i," and they drifted
   once before (see the level-1-is-always-red override, which an earlier
   version of this scan didn't know about, letting you earn First Job's
   car without ever having driven it). Routing through carIdForLevel()
   means any future change to the round-robin (block size, chapter count)
   can't cause that class of bug again — this always finds whatever level
   ACTUALLY shows the car as hero last, not wherever the math says it
   should.

   Unlocks on clearing that level — the LAST level the car fronts, not
   the first — so you drive a car for its full ten-mission block before
   it's yours, matching "clear a level and the mark you drove becomes
   yours to keep." (Earlier version unlocked on first sight, which handed
   out the car before you'd driven it and front-loaded every chapter's
   five cars into its first five levels — see docs/HEIST-PLAN.md §3b.)

   Reads save.jobClears, not save.stars: stars tracks puzzle completion
   under every pacing (Heist/Pursuit/Relaxed alike), but Relaxed never
   shows the level's mark as the hero (see heroCarIdForAttempt in
   js/game.js — Relaxed has no "job" framing, just your own driving), so
   clearing a level there can't be what unlocks its car. jobClears only
   gets a level added when it was actually cleared under Heist or Pursuit
   — see winSequence. Swapping this to save.stars would silently let
   Relaxed earn cars again — it did once, which is why jobClears exists
   at all (see the grandfather clause in js/game.js's save loader). */
function jobUnlockCheck(car){
  const from = car.chapter * CHAPTER_SIZE;
  let unlockLevel = -1;
  for(let i = from; i < from + CHAPTER_SIZE; i++){
    if(carIdForLevel(i) === car.id) unlockLevel = i;
  }
  return save => unlockLevel >= 0 && !!save.jobClears?.[unlockLevel];
}

/* Job cars, five per chapter, in chapter order — chapter/slot are derived
   from array position below (see the assignment loop), not hand-typed, so
   reordering a chapter's five entries can't drift out of sync with it. */
const JOB_CARS = [
  // --- Night Shift (ch. 1) — economy hatch & sedan, all common ---------
  {
    id: 'first-job', name: 'First Job', tier: 'common', photo: 'assets/cars/traffic-sedan-13.webp',
    skin: { base: '#e9e9e3', dark: '#c47a10', glass: '#3c2a0c', trim: 'none' },
  },
  {
    id: 'understudy', name: 'The Understudy', tier: 'common', photo: 'assets/cars/traffic-sedan-25.webp',
    skin: { base: '#ff4d4d', dark: '#177a67', glass: '#0e2f2b', trim: 'none' },
  },
  {
    id: 'night-regular', name: 'Night Regular', tier: 'common', photo: 'assets/cars/library-sedans-1785067674835-13-red-hatch.webp',
    skin: { base: '#ff4d4d', dark: '#c9502a', glass: '#3d1c10', trim: 'none' },
  },
  {
    id: 'paid-in-full', name: 'Paid in Full', tier: 'common', photo: 'assets/cars/library-sedans-1785067674835-14-green-hatch.webp',
    skin: { base: '#5fbf4a', dark: '#d1a213', glass: '#3b3106', trim: 'chrome' },
  },
  {
    id: 'under-radar', name: 'Under the Radar', tier: 'common', photo: 'assets/cars/traffic-sedan-new-lightblue.webp',
    skin: { base: '#4a7dff', dark: '#57687f', glass: '#1e2530', trim: 'none' },
  },
  // --- Neon District (ch. 2) — economy, first personality, common ------
  {
    id: 'neon-ghost', name: 'Neon Ghost', tier: 'common', photo: 'assets/cars/traffic-sedan-28.webp',
    skin: { base: '#8c7762', dark: '#1f8fb0', glass: '#0f2c37', trim: 'none' },
  },
  {
    id: 'steady-hand', name: 'The Steady Hand', tier: 'common', photo: 'assets/cars/library-sedans-1785067674835-7-orange-suv.webp',
    skin: { base: '#ff9a3d', dark: '#6f3ad0', glass: '#291743', trim: 'none' },
  },
  {
    id: 'street-tuner', name: 'Street Tuner', tier: 'common', photo: null,
    skin: { base: '#9be03f', dark: '#5f8f1e', glass: '#1c2b0c', trim: 'none' },
  },
  {
    id: 'lowrider', name: 'The Low Rider', tier: 'common', photo: null,
    skin: { base: '#c23a5e', dark: '#701f36', glass: '#2b0f18', trim: 'chrome' },
  },
  {
    id: 'clean-sweep', name: 'Clean Sweep', tier: 'common', photo: null,
    skin: { base: '#f26fb1', dark: '#bb3679', glass: '#3a1229', trim: 'chrome' },
  },
  // --- Harbor Freight (ch. 3) — tuner scene, uncommon -------------------
  {
    id: 'harbor-queen', name: 'Harbor Queen', tier: 'uncommon', photo: 'assets/cars/hero-fluro-cyan.webp',
    skin: { base: '#2fb5b0', dark: '#0d4a3e', glass: '#062420', trim: 'chrome' },
  },
  {
    id: 'insomniac', name: 'The Insomniac', tier: 'uncommon', photo: 'assets/cars/hero-fluro-pink.webp',
    skin: { base: '#e85fa8', dark: '#3d1c80', glass: '#1f0f40', trim: 'chrome' },
  },
  {
    id: 'dockside-classic', name: 'Dockside Classic', tier: 'uncommon', photo: 'assets/cars/hero-fluro-green.webp',
    skin: { base: '#5fbf4a', dark: '#1e3357', glass: '#0e1a2b', trim: 'chrome' },
  },
  {
    id: 'crate-fresh', name: 'Crate Fresh', tier: 'uncommon', photo: 'assets/cars/hero-fluro-yellow.webp',
    skin: { base: '#f5d442', dark: '#a6adba', glass: '#232a33', trim: 'chrome' },
  },
  {
    id: 'american-steel', name: 'American Steel', tier: 'uncommon', photo: 'assets/cars/hero-fluro-orange.webp',
    skin: { base: '#ff9a3d', dark: '#873217', glass: '#2b140a', trim: 'none' },
  },
  // --- Gridlock (ch. 4) — coupes & roadsters, uncommon ------------------
  {
    id: 'midnight-phantom', name: 'Midnight Phantom', tier: 'uncommon', photo: 'assets/cars/library-sedans-1785067674835-12-orange-coupe.webp',
    skin: { base: '#ff9a3d', dark: '#101319', glass: '#0e2f2b', trim: 'chrome' },
  },
  {
    id: 'vintage-icon', name: 'The Vintage Icon', tier: 'uncommon', photo: 'assets/cars/library-sedans-1785067674835-15-green-coupe.webp',
    skin: { base: '#5fbf4a', dark: '#1f1140', glass: '#150b2b', trim: 'chrome' },
  },
  {
    id: 'grand-tourer', name: 'Grand Tourer', tier: 'uncommon', photo: 'assets/cars/hero-convertible-brown.webp',
    skin: { base: '#8c7762', dark: '#0e3322', glass: '#0a1f16', trim: 'chrome' },
  },
  {
    id: 'apex-predator', name: 'Apex Predator', tier: 'uncommon', photo: 'assets/cars/hero-spyder-blue.webp',
    skin: { base: '#4a7dff', dark: '#0a0c10', glass: '#3a2f08', trim: 'chrome' },
  },
  {
    id: 'midnight-runner', name: 'Midnight Runner', tier: 'uncommon', photo: 'assets/cars/traffic-sedan-7.webp',
    skin: { base: '#e9e9e3', dark: '#26374f', glass: '#101825', trim: 'chrome' },
  },
  // --- Overpass (ch. 5) — classics, uncommon -----------------------------
  {
    id: 'overpass-shadow', name: 'Overpass Shadow', tier: 'uncommon', photo: 'assets/cars/hero-classic-blue-stripe.webp',
    skin: { base: '#4a7dff', dark: '#161d24', glass: '#0b1116', trim: 'chrome' },
  },
  {
    id: 'toll-runner', name: 'Toll Runner', tier: 'uncommon', photo: 'assets/cars/hero-classic-cream.webp',
    skin: { base: '#e9e9e3', dark: '#8a6912', glass: '#2c2107', trim: 'chrome' },
  },
  {
    id: 'high-lane', name: 'High Lane', tier: 'uncommon', photo: 'assets/cars/hero-classic-white-green.webp',
    skin: { base: '#e9e9e3', dark: '#164a72', glass: '#0c1f2e', trim: 'chrome' },
  },
  {
    id: 'concrete-ghost', name: 'Concrete Ghost', tier: 'uncommon', photo: 'assets/cars/hero-sedan-bronze.webp',
    skin: { base: '#8c7762', dark: '#4d525c', glass: '#1c1f24', trim: 'chrome' },
  },
  {
    id: 'merge-artist', name: 'The Merge Artist', tier: 'uncommon', photo: 'assets/cars/hero-sedan-green.webp',
    skin: { base: '#5fbf4a', dark: '#6e2c1a', glass: '#25100a', trim: 'chrome' },
  },
  // --- Freight Yard (ch. 6) — hitch country, muscle, rare ---------------
  {
    id: 'yardmaster', name: 'The Yardmaster', tier: 'rare', photo: 'assets/cars/hero-muscle.webp',
    skin: { base: '#8a929c', dark: '#241a10', glass: '#120d08', trim: 'chrome' },
  },
  {
    id: 'coupling-run', name: 'Coupling Run', tier: 'rare', photo: 'assets/cars/hero-muscle-grey-stripe.webp',
    skin: { base: '#8a929c', dark: '#8a4a18', glass: '#2c1a09', trim: 'chrome' },
  },
  {
    id: 'switchyard', name: 'Switchyard', tier: 'rare', photo: 'assets/cars/hero-muscle-sage.webp',
    skin: { base: '#5fbf4a', dark: '#163b32', glass: '#0a1c17', trim: 'plaque' },
  },
  {
    id: 'container-king', name: 'Container King', tier: 'rare', photo: null,
    skin: { base: '#c23838', dark: '#701f1f', glass: '#2b0f0f', trim: 'plaque' },
  },
  {
    id: 'last-hitch', name: 'The Last Hitch', tier: 'rare', photo: null,
    skin: { base: '#5c4a8f', dark: '#332757', glass: '#160f2b', trim: 'plaque' },
  },
  // --- Customs (ch. 7) — GT & wide-body, rare ---------------------------
  {
    id: 'contraband', name: 'Contraband', tier: 'rare', photo: 'assets/cars/hero-airtail-blue.webp',
    skin: { base: '#4a7dff', dark: '#0d1318', glass: '#3a2f08', trim: 'plaque' },
  },
  {
    id: 'inspection-lane', name: 'Inspection Lane', tier: 'rare', photo: 'assets/cars/hero-airtail-purple-yellow.webp',
    skin: { base: '#9a5bd6', dark: '#a3891c', glass: '#2f290a', trim: 'chrome' },
  },
  {
    id: 'clearance-run', name: 'Clearance Run', tier: 'rare', photo: 'assets/cars/hero-airtail-stripe.webp',
    skin: { base: '#e9e9e3', dark: '#154532', glass: '#0a1f17', trim: 'plaque' },
  },
  {
    id: 'red-stamp', name: 'Red Stamp', tier: 'rare', photo: 'assets/cars/hero-airtail-red.webp',
    skin: { base: '#ff4d4d', dark: '#5c141f', glass: '#240a0f', trim: 'chrome' },
  },
  {
    id: 'sealed-manifest', name: 'Sealed Manifest', tier: 'rare', photo: 'assets/cars/hero-airtail-pink.webp',
    skin: { base: '#e85fa8', dark: '#252c38', glass: '#0e1218', trim: 'plaque' },
  },
  // --- Rush Hour (ch. 8) — GT, racer, off-road, rare ---------------------
  {
    id: 'gridlocked', name: 'Gridlocked', tier: 'rare', photo: null,
    skin: { base: '#d4471f', dark: '#82290f', glass: '#2b1006', trim: 'plaque' },
  },
  {
    id: 'lane-splitter', name: 'Lane Splitter', tier: 'rare', photo: null,
    skin: { base: '#e0e5ea', dark: '#9aa2ad', glass: '#20242b', trim: 'chrome' },
  },
  {
    id: 'peak-hour', name: 'Peak Hour', tier: 'rare', photo: null,
    skin: { base: '#f0a83a', dark: '#a86e17', glass: '#2e2107', trim: 'chrome' },
  },
  {
    id: 'rat-run', name: 'The Rat Run', tier: 'rare', photo: null,
    skin: { base: '#3a4a2e', dark: '#1c2716', glass: '#0e1409', trim: 'plaque' },
  },
  {
    id: 'clean-getaway', name: 'Clean Getaway', tier: 'rare', photo: null,
    skin: { base: '#2e3a5c', dark: '#151d33', glass: '#0a0f1c', trim: 'plaque' },
  },
  // --- The Syndicate (ch. 9) — exotics, legendary -----------------------
  {
    id: 'made-man', name: 'Made Man', tier: 'legendary', photo: 'assets/cars/hero-red-exotic.webp',
    skin: { base: '#ff4d4d', dark: '#0a0a0c', glass: '#241f08', trim: 'plaque' },
  },
  {
    id: 'front-company', name: 'Front Company', tier: 'legendary', photo: 'assets/cars/hero-sports-cyan.webp',
    skin: { base: '#2fb5b0', dark: '#302a24', glass: '#141210', trim: 'chrome' },
  },
  {
    id: 'silent-partner', name: 'Silent Partner', tier: 'legendary', photo: 'assets/cars/hero-canopy-green.webp',
    skin: { base: '#5fbf4a', dark: '#152633', glass: '#0a1319', trim: 'plaque' },
  },
  {
    id: 'ledger-clean', name: 'Ledger Clean', tier: 'legendary', photo: null,
    skin: { base: '#c9c2b0', dark: '#8f8875', glass: '#28251e', trim: 'chrome' },
  },
  {
    id: 'the-fixer', name: 'The Fixer', tier: 'legendary', photo: null,
    skin: { base: '#7a1f2e', dark: '#420f18', glass: '#1c0709', trim: 'plaque' },
  },
  // --- Vault Row (ch. 10) — hyper & one-off, the campaign's endgame, all legendary
  {
    id: 'vault-runner', name: 'Vault Runner', tier: 'legendary', photo: null,
    skin: { base: '#0e0e10', dark: '#050506', glass: '#3a2f08', trim: 'plaque' },
  },
  {
    id: 'last-take', name: 'The Last Take', tier: 'legendary', photo: null,
    skin: { base: '#8f0e1f', dark: '#4a070f', glass: '#1f0306', trim: 'plaque' },
  },
  {
    id: 'final-count', name: 'Final Count', tier: 'legendary', photo: null,
    skin: { base: '#d4af37', dark: '#8a6f1e', glass: '#2e2308', trim: 'chrome' },
  },
  {
    id: 'no-witnesses', name: 'No Witnesses', tier: 'legendary', photo: null,
    skin: { base: '#1f2e3a', dark: '#0d161c', glass: '#050a0e', trim: 'plaque' },
  },
  {
    id: 'one-way-out', name: 'One Way Out', tier: 'legendary', photo: null,
    skin: { base: '#3a0e5c', dark: '#1f0733', glass: '#0c0319', trim: 'plaque' },
  },
];
JOB_CARS.forEach((car, i) => {
  car.chapter = Math.floor(i / POOL_SIZE);
  car.slot = i % POOL_SIZE;
  car.unlock = jobUnlockCheck(car);
});

/* Bounty marks (HEIST-PLAN.md §6, phase H4): earned by clearing a
   "Tonight's Mark" under its reward condition (par/no-hints — see
   js/bounty.js). One per rarity tier; that tier's car is also the hero
   shown while playing any bounty of that tier (see carIdForBountyTier).

   `pacing` is the job's own fixed mode (heist or pursuit) — a bounty isn't
   a pacing choice like campaign/Relaxed is; the mark dictates how tonight's
   job runs, same as it dictates the car. js/game.js's loadBountyLevel()
   forces save.settings.mode to this for the attempt's duration and
   restores whatever the player had afterward. `narrative` is the short
   pre-job briefing shown on the bounty sheet before "Take the job" —
   deliberately not run through i18n (car names aren't either; see `name`
   above), same "ship the flavor in English, mechanics stay translated"
   split already used throughout this file. */
const BOUNTY_CARS = [
  {
    id: 'small-fish', name: 'Small Fish', tier: 'common', bountyTier: 'common', photo: null,
    pacing: 'heist',
    narrative: "A nothing job — one guard, one alarm panel, in and out before he finishes his coffee. The garage owes you nothing more than gas money, but word is there's a spare set of keys to Small Fish sitting on the peg. Clear it under budget and it's yours.",
    skin: { base: '#8fbf6b', dark: '#4d7a34', glass: '#1c2b14', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'common'),
  },
  {
    id: 'fence-favorite', name: "The Fence's Favorite", tier: 'uncommon', bountyTier: 'uncommon', photo: null,
    pacing: 'pursuit',
    narrative: "The fence wants his goods back before sunrise, and he's not the patient type. No time to case the place twice — you're already being watched. Stay ahead of the clock and The Fence's Favorite rides home with you tonight.",
    skin: { base: '#e0a840', dark: '#946a1c', glass: '#2c1e08', trim: 'none' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'uncommon'),
  },
  {
    id: 'high-value-mark', name: 'High-Value Mark', tier: 'rare', bountyTier: 'rare', photo: null,
    pacing: 'heist',
    narrative: "This one's got a name in the file for a reason — private security, a real vault, a client who'll pay double to keep his name out of it. Trip the alarm and it's over. Walk it clean and the High-Value Mark is yours.",
    skin: { base: '#d43f6a', dark: '#7a1f3a', glass: '#2b0e18', trim: 'chrome' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'rare'),
  },
  {
    id: 'the-big-score', name: 'The Big Score', tier: 'legendary', bountyTier: 'legendary', photo: null,
    pacing: 'pursuit',
    narrative: "Every crew talks about one job they never took. This is that job. It ends in a straight line at speed with everyone watching, and there's no version of tonight where you get a second run at it. Beat the clock — The Big Score doesn't wait twice.",
    skin: { base: '#f5d442', dark: '#a68c1f', glass: '#332b08', trim: 'plaque' },
    unlock: save => Object.values(save.bounties?.done || {}).some(d => d.met && d.tier === 'legendary'),
  },
];

export const CARS = [...JOB_CARS, ...BOUNTY_CARS];

/* Which car is the hero for a given campaign level (0-based LEVELS index).
   Round-robins the level's chapter pool, one ten-level block per car. */
export function carIdForLevel(idx){
  // Level 1 is everyone's first look at the game, in every mode (Heist/
  // Pursuit/Relaxed just change pacing, not which level this is) — it
  // stays the classic red car rather than handing a brand-new player an
  // unfamiliar job car before they've even seen the "free the red car"
  // premise. jobUnlockCheck() reads this same function, so First Job
  // (chapter 0 slot 0) correctly does NOT unlock off level 1 — you only
  // get a car in the garage once you've actually driven and freed it.
  if(idx === 0) return DEFAULT_CAR;
  // Clamped against how many chapters actually have a populated car
  // pool (JOB_CARS.length / POOL_SIZE), not a hardcoded chapter count —
  // a stale literal here is exactly what silently orphaned every car
  // past chapter 4 when the campaign grew from 4 chapters to 10 (see
  // docs/HEIST-PLAN.md §3b). Re-serves the last chapter's pool if the
  // campaign ever outgrows the car roster again, rather than that
  // happening silently.
  const chapterCount = Math.floor(JOB_CARS.length / POOL_SIZE);
  const chapter = Math.min(chapterCount - 1, Math.floor(idx / CHAPTER_SIZE));
  const slot = Math.floor((idx % CHAPTER_SIZE) / BLOCK_SIZE);
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

/* Merges each car's top-level `photo` (its own bespoke art, if any — see
   the JOB_CARS/BOUNTY_CARS entries above) into the `skin` object
   vehicleSVG actually reads `skin.photo` off of. Returning car.skin
   verbatim here was a real, fully latent bug: every car shipped with
   photo: null until this file's cars got their first real art, so
   `skin.photo` was always undefined regardless of what `car.photo` said,
   and no job car's bespoke render could ever have fired.

   An admin-assigned photo (Sandbox → Library → Hero Art) always wins over
   whatever's hardcoded here, including replacing a bespoke car.photo — so
   reassigning a job car's art from the library takes effect immediately,
   the same "no code change needed" promise the rest of the library makes. */
export function skinFor(carId){
  const car = carById(carId);
  if(!car) return null;   // null → caller falls back to PALETTE[0] (classic)
  const override = getLibrary().heroPhotos[carId];
  return { ...car.skin, photo: override ?? car.photo };
}
