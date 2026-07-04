/* Share card (plan item 1.1 — "this is the growth engine"). Wordle-style
   emoji board + moves vs par + streak. Emoji encode the starting board so
   every day's card looks different and reads as a puzzle at a glance. */

import { N, EXIT_ROW } from './solver.js';

const HERO = '🟥';
const CARS = ['🟦', '🟩', '🟨', '🟪', '🟧', '🟫', '⬜'];
const EMPTY = '⬛';

export function boardEmoji(p){
  const g = Array.from({ length: N }, () => Array(N).fill(EMPTY));
  p.forEach((a, i) => {
    const [r, c, len, dir] = a;
    const glyph = i === 0 ? HERO : CARS[(i - 1) % CARS.length];
    for(let k = 0; k < len; k++){
      g[r + (dir === 'v' ? k : 0)][c + (dir === 'h' ? k : 0)] = glyph;
    }
  });
  return g.map((row, r) => row.join('') + (r === EXIT_ROW ? '➡️' : '')).join('\n');
}

export function dailyShareText({ number, moves, par, streak, level }){
  const stars = moves <= par ? '⭐️⭐️⭐️' : moves <= par + Math.max(3, Math.ceil(par * 0.35)) ? '⭐️⭐️' : '⭐️';
  const streakBit = streak >= 2 ? `  🔥${streak}` : '';
  return `Midnight Garage — Daily #${number}\n${stars} ${moves} moves · Par ${par}${streakBit}\n\n${boardEmoji(level.p)}\n\nmidnightgarage.app`;
}

export async function shareText(text){
  try{
    if(navigator.share){
      await navigator.share({ text });
      return 'shared';
    }
  }catch(e){
    if(e && e.name === 'AbortError') return 'cancelled';
  }
  try{
    await navigator.clipboard.writeText(text);
    return 'copied';
  }catch(e){
    // last-ditch: legacy textarea copy
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(_){}
    ta.remove();
    return 'copied';
  }
}
