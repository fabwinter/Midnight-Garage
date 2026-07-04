/* Daily puzzle state (plan item 1.1): streaks, freeze tokens, calendar
   back-fill. The board itself comes from generate.js (date-seeded). */

import { load, store, todayStr } from './storage.js';
import { DAILY_EPOCH } from './generate.js';

const KEY = 'daily_v1';

let state = {
  done: {},          // 'YYYY-MM-DD' -> {moves, par, stars}
  streak: 0,
  lastStreakDay: null,
  freezes: 0,
  playCount: 0,      // total dailies solved; every 7th earns a freeze
};

export async function loadDaily(){
  state = Object.assign(state, (await load(KEY, {})) ?? {});
  return state;
}

export function daily(){ return state; }
export function isDone(dateStr){ return !!state.done[dateStr]; }

function dayDiff(a, b){
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/* Record a daily win. Only *today's* puzzle touches the streak — back-fills
   count for the calendar and freeze-earn progress but never extend streaks
   (plan: "back-fills don't extend streak"). Returns {usedFreeze, earnedFreeze}. */
export function recordDailyWin(dateStr, moves, par, stars){
  const first = !state.done[dateStr];
  const prev = state.done[dateStr];
  state.done[dateStr] = {
    moves: prev ? Math.min(prev.moves, moves) : moves,
    par,
    stars: prev ? Math.max(prev.stars, stars) : stars,
  };

  let usedFreeze = 0, earnedFreeze = false;
  if(first){
    state.playCount++;
    if(state.playCount % 7 === 0){ state.freezes = Math.min(3, state.freezes + 1); earnedFreeze = true; }
  }

  const today = todayStr();
  if(dateStr === today && first){
    if(state.lastStreakDay === null){
      state.streak = 1;
    } else {
      const gap = dayDiff(state.lastStreakDay, today);
      if(gap <= 0){
        /* already counted */
      } else if(gap === 1){
        state.streak++;
      } else if(state.freezes >= gap - 1){
        usedFreeze = gap - 1;            // freeze tokens absorb the missed days
        state.freezes -= usedFreeze;
        state.streak++;
      } else {
        state.streak = 1;
      }
    }
    state.lastStreakDay = today;
  }

  store(KEY, state);
  return { usedFreeze, earnedFreeze };
}

/* Calendar helpers */
export function isPlayable(dateStr){
  return dateStr >= DAILY_EPOCH && dateStr <= todayStr();
}
