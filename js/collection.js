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
import { getLibrary } from './library.js';

export const DEFAULT_CAR = 'classic';
export const POOL_SIZE = 5;

/* skin.photo: seam for bespoke per-car art (top-down, front-right, own
   headlights — see classic.png's conventions). Until a car has one, its
   hero render falls back to the recolored-sedan-photo treatment every
   other car already used (see js/art.js) — nothing breaks while art
   lands car by car. */
/* Derives its scan directly from carIdForLevel() rather than
   re-deriving chapter/slot arithmetic independently — the two used to be
   two separate sources of truth for "which car is level i," and they
   drifted the moment carIdForLevel() grew its level-1-is-always-red
   override: this scan kept counting level 1 toward First Job's unlock
   even though level 1 never actually shows First Job as the hero,
   letting you earn a car in the garage you never once drove. Routing
   through carIdForLevel() means any future override (here or elsewhere)
   can't cause that class of bug again — the unlock condition is always
   "you cleared a level that actually showed you this car."

   Reads save.jobClears, not save.stars: stars tracks puzzle completion
   under every pacing (Heist/Pursuit/Relaxed alike), but Relaxed never
   shows the level's mark as the hero (see heroCarIdForAttempt in
   js/game.js — Relaxed has no "job" framing, just your own driving), so
   clearing a level there can't be what unlocks its car. jobClears only
   gets a level added when it was actually cleared under Heist or Pursuit
   — see winSequence. */
function jobUnlockCheck(car){
  const from = car.chapter * CHAPTER_SIZE;
  return save => {
    for(let i = from; i < from + CHAPTER_SIZE; i++){
      if(carIdForLevel(i) === car.id && save.jobClears?.[i]) return true;
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
  // --- Overpass (ch. 5) — rare leaning legendary, continuing Gridlock's climb
  {
    id: 'overpass-shadow', name: 'Overpass Shadow', tier: 'rare', photo: null,
    skin: { base: '#33414f', dark: '#161d24', glass: '#0b1116', trim: 'plaque' },
  },
  {
    id: 'toll-runner', name: 'Toll Runner', tier: 'rare', photo: null,
    skin: { base: '#c99a2e', dark: '#8a6912', glass: '#2c2107', trim: 'plaque' },
  },
  {
    id: 'high-lane', name: 'High Lane', tier: 'rare', photo: null,
    skin: { base: '#2f7fbf', dark: '#164a72', glass: '#0c1f2e', trim: 'plaque' },
  },
  {
    id: 'concrete-ghost', name: 'Concrete Ghost', tier: 'legendary', photo: null,
    skin: { base: '#8f96a3', dark: '#4d525c', glass: '#1c1f24', trim: 'chrome' },
  },
  {
    id: 'merge-artist', name: 'The Merge Artist', tier: 'rare', photo: null,
    skin: { base: '#b04a2e', dark: '#6e2c1a', glass: '#25100a', trim: 'plaque' },
  },
  // --- Freight Yard (ch. 6) — hitch country, rare leaning legendary -----
  {
    id: 'yardmaster', name: 'The Yardmaster', tier: 'legendary', photo: null,
    skin: { base: '#4a3520', dark: '#241a10', glass: '#120d08', trim: 'chrome' },
  },
  {
    id: 'coupling-run', name: 'Coupling Run', tier: 'rare', photo: null,
    skin: { base: '#d1782e', dark: '#8a4a18', glass: '#2c1a09', trim: 'chrome' },
  },
  {
    id: 'switchyard', name: 'Switchyard', tier: 'rare', photo: null,
    skin: { base: '#2e6b5c', dark: '#163b32', glass: '#0a1c17', trim: 'plaque' },
  },
  {
    id: 'container-king', name: 'Container King', tier: 'legendary', photo: null,
    skin: { base: '#c23838', dark: '#701f1f', glass: '#2b0f0f', trim: 'plaque' },
  },
  {
    id: 'last-hitch', name: 'The Last Hitch', tier: 'rare', photo: null,
    skin: { base: '#5c4a8f', dark: '#332757', glass: '#160f2b', trim: 'plaque' },
  },
  // --- Customs (ch. 7) — mostly legendary ------------------------------
  {
    id: 'contraband', name: 'Contraband', tier: 'legendary', photo: null,
    skin: { base: '#1f2933', dark: '#0d1318', glass: '#3a2f08', trim: 'plaque' },
  },
  {
    id: 'inspection-lane', name: 'Inspection Lane', tier: 'rare', photo: null,
    skin: { base: '#e0c23a', dark: '#a3891c', glass: '#2f290a', trim: 'chrome' },
  },
  {
    id: 'clearance-run', name: 'Clearance Run', tier: 'legendary', photo: null,
    skin: { base: '#2e7d5c', dark: '#154532', glass: '#0a1f17', trim: 'plaque' },
  },
  {
    id: 'red-stamp', name: 'Red Stamp', tier: 'legendary', photo: null,
    skin: { base: '#a8283a', dark: '#5c141f', glass: '#240a0f', trim: 'chrome' },
  },
  {
    id: 'sealed-manifest', name: 'Sealed Manifest', tier: 'rare', photo: null,
    skin: { base: '#4a5568', dark: '#252c38', glass: '#0e1218', trim: 'plaque' },
  },
  // --- Rush Hour (ch. 8) — dense traffic, legendary --------------------
  {
    id: 'gridlocked', name: 'Gridlocked', tier: 'legendary', photo: null,
    skin: { base: '#d4471f', dark: '#82290f', glass: '#2b1006', trim: 'plaque' },
  },
  {
    id: 'lane-splitter', name: 'Lane Splitter', tier: 'legendary', photo: null,
    skin: { base: '#e0e5ea', dark: '#9aa2ad', glass: '#20242b', trim: 'chrome' },
  },
  {
    id: 'peak-hour', name: 'Peak Hour', tier: 'rare', photo: null,
    skin: { base: '#f0a83a', dark: '#a86e17', glass: '#2e2107', trim: 'chrome' },
  },
  {
    id: 'rat-run', name: 'The Rat Run', tier: 'legendary', photo: null,
    skin: { base: '#3a4a2e', dark: '#1c2716', glass: '#0e1409', trim: 'plaque' },
  },
  {
    id: 'clean-getaway', name: 'Clean Getaway', tier: 'legendary', photo: null,
    skin: { base: '#2e3a5c', dark: '#151d33', glass: '#0a0f1c', trim: 'plaque' },
  },
  // --- The Syndicate (ch. 9) — imported hard boards become the norm ----
  {
    id: 'made-man', name: 'Made Man', tier: 'legendary', photo: null,
    skin: { base: '#1a1a1e', dark: '#0a0a0c', glass: '#241f08', trim: 'plaque' },
  },
  {
    id: 'front-company', name: 'Front Company', tier: 'legendary', photo: null,
    skin: { base: '#5c5248', dark: '#302a24', glass: '#141210', trim: 'chrome' },
  },
  {
    id: 'silent-partner', name: 'Silent Partner', tier: 'legendary', photo: null,
    skin: { base: '#2e4a5c', dark: '#152633', glass: '#0a1319', trim: 'plaque' },
  },
  {
    id: 'ledger-clean', name: 'Ledger Clean', tier: 'rare', photo: null,
    skin: { base: '#c9c2b0', dark: '#8f8875', glass: '#28251e', trim: 'chrome' },
  },
  {
    id: 'the-fixer', name: 'The Fixer', tier: 'legendary', photo: null,
    skin: { base: '#7a1f2e', dark: '#420f18', glass: '#1c0709', trim: 'plaque' },
  },
  // --- Vault Row (ch. 10) — the campaign's true endgame, all legendary -
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
   Round-robins the level's chapter pool, five cars deep — same car is the
   mark for 10 missions before the pool repeats. */
export function carIdForLevel(idx){
  // Level 1 is everyone's first look at the game, in every mode (Heist/
  // Pursuit/Relaxed just change pacing, not which level this is) — it
  // stays the classic red car rather than handing a brand-new player an
  // unfamiliar job car before they've even seen the "free the red car"
  // premise. jobUnlockCheck() reads this same function, so First Job
  // (chapter 0 slot 0) correctly does NOT unlock off level 1 — you only
  // get a car in the garage once you've actually driven and freed it.
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

/* An admin-assigned photo (Sandbox → Library → Hero Art) always wins over
   whatever's hardcoded here, including replacing a bespoke skin.photo — so
   reassigning a job car's art from the library takes effect immediately,
   the same "no code change needed" promise the rest of the library makes. */
export function skinFor(carId){
  const car = carById(carId);
  if(!car) return null;   // null → caller falls back to PALETTE[0] (classic)
  const override = getLibrary().heroPhotos[carId];
  return override ? { ...car.skin, photo: override } : car.skin;
}
