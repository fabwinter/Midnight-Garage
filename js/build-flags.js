/* Flipped to false by tools/build-www.mjs --release. Dev server + any
   build that doesn't go through the release build step keeps admin mode
   reachable (5x tap on the title — see wireAdmin in js/game.js). Kept as
   its own tiny module rather than a constant inside js/game.js so the
   release build step can overwrite just this file's contents without
   touching or re-parsing the real source. */
export const ADMIN_ENABLED = true;
