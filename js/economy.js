/* Soft-currency economy (docs/MONETIZATION-PLAN.md phase M1). "Wrenches"
   buy a little per-attempt breathing room — an extra hint, a Heist/Pursuit
   rescue after a bust — and nothing else: never a lower par, a star, or a
   specific car (see js/collection.js's no-purchase-gates-a-car covenant).
   Nothing here ever touches curLevel/par/the solver.

   Pure functions over an injected `save`, the same convention
   js/collection.js and js/bounty.js already use for player-state-shaped
   logic, rather than a second persisted blob like js/library.js —
   wrenches are core save state with the same lifecycle as stars/hints/
   pro, so they live inside the one save object js/game.js already owns,
   migrates and persists. grant()/spend() are the only two ways the
   balance moves; callers are responsible for persist()+track(), same
   convention as every other save mutator in js/game.js (see undo(),
   skipLevel()). */

export const PRICES = {
  hint: 1,
  alarm_rescue: 2,
  pursuit_rescue: 2,
};

export const DAILY_FREE_WRENCH = 1;
export const REWARDED_WRENCH_GRANT = 5;
export const ALARM_RESCUE_MOVES = 5;
export const PURSUIT_RESCUE_SECONDS = 20;

export function priceOf(sink){
  return PRICES[sink] ?? 0;
}

export function canAfford(save, sink){
  return save.wrenches >= priceOf(sink);
}

// Mutates save in place; returns false (no-op) if the balance is short.
export function spend(save, sink){
  const price = priceOf(sink);
  if(save.wrenches < price) return false;
  save.wrenches -= price;
  save.econ.lifetimeSpent += price;
  return true;
}

export function grant(save, amount){
  save.wrenches += amount;
  save.econ.lifetimeEarned += amount;
}

// Once per calendar day, mirroring save.hints' own day-rollover pattern
// (js/game.js: refreshHintTokens). `today` is the caller's todayStr() so
// this file never has to import storage.js's date helper itself.
export function dailyWrenchAvailable(save, today){
  return !!today && save.econ.dailyWrenchDay !== today;
}

export function claimDailyWrench(save, today){
  if(!dailyWrenchAvailable(save, today)) return false;
  save.econ.dailyWrenchDay = today;
  grant(save, DAILY_FREE_WRENCH);
  return true;
}
