/* Bounties (HEIST-PLAN.md §6, phase H4): "Tonight's Mark" — a nightly
   curated board cycled deterministically by date, same pattern as the
   daily puzzle (js/daily.js), so every player worldwide sees the same
   mark with no backend. The rotation itself (js/bounty-rotation.data.js)
   is drawn from the Fogleman import surplus and needs no generator work —
   see tools/gen-bounty-pool.mjs.

   A bounty always completes like any other level (the covenant: no lose
   states). Its *reward condition* — par/no-hints/alarm-intact, rotating
   per HEIST-PLAN §6 — gates the collection car, never the win itself. */

import { BOUNTY_ROTATION } from './bounty-rotation.data.js';

export const BOUNTY_EPOCH = '2026-07-19';   // Mark #1

/* 'alarm' (clear in Heist mode) was dropped: each bounty tier now has its
   own FIXED pacing (js/collection.js's BOUNTY_CARS.pacing, forced by
   js/game.js's loadBountyLevel — "It is always in Heist or Pursuit mode
   depending on the job," not a player choice), so a condition keyed to
   "were you playing in Heist mode" would be either trivially free (the
   night's tier is forced to Heist anyway) or flatly impossible (the
   night's tier is forced to Pursuit) depending purely on which tier
   rotated in — never a real performance bar either way. par/nohints stay
   meaningful under both forced pacings. */
const CONDITIONS = ['par', 'nohints'];

function dayIndex(dateStr){
  const ms = Date.parse(dateStr + 'T00:00:00Z') - Date.parse(BOUNTY_EPOCH + 'T00:00:00Z');
  return Math.floor(ms / 86400000);
}

export function bountyNumber(dateStr){ return dayIndex(dateStr) + 1; }

/* The board + condition for a given night. Deterministic: same date always
   resolves to the same pick, cycling through the whole rotation before any
   board repeats. Returns null before BOUNTY_EPOCH. */
export function bountyFor(dateStr){
  const di = dayIndex(dateStr);
  if(di < 0) return null;
  const lv = BOUNTY_ROTATION[di % BOUNTY_ROTATION.length];
  const condition = CONDITIONS[di % CONDITIONS.length];
  return { ...lv, date: dateStr, number: bountyNumber(dateStr), condition };
}

/* Whether a completed attempt satisfies the night's reward condition.
   Only ever called from a real win (game.js's winSequence) — a Heist/
   Pursuit bust ends the attempt before it can win, so there's no "moves"
   to judge and this never runs for a busted attempt. */
export function bountyConditionMet(condition, { moves, par, hintsUsed }){
  if(condition === 'par') return moves <= par;
  if(condition === 'nohints') return hintsUsed === 0;
  return false;
}
