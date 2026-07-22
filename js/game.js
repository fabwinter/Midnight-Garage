/* Midnight Garage — main app.
   Phase 0 + v1.0 of docs/SEQUENCING-PLAN.md: rebrand, chapters, game feel
   (weight/flick/dust), onboarding, session flow, accessibility, analytics,
   daily puzzle + share card, Pro Garage gating. */

import { N, EXIT_ROW, firstOptimalMove, solve } from './solver.js';
import { LEVELS, CHAPTERS, CHAPTER_SIZE } from './levels.data.js';
import { dailyLevel, dailyNumber, DAILY_EPOCH } from './generate.js';
import { load, store, todayStr } from './storage.js';
import { sfx, setSfxVolume, setMusicVolume, setGameMode, startAttemptTrack, stopAttemptTrack, duckAttemptTrack, resumeAttemptTrack, startMenuMusic, stopMenuMusic, playSettingsMusic, stopSettingsMusic, toggleThemePlayer, isThemePlaying, setThemeStateListener } from './audio.js';
import { haptic, setHapticsEnabled } from './haptics.js';
import { initAnalytics, track, flush } from './analytics.js';
import { initI18n, t } from './i18n.js';
import { loadDaily, daily, isDone, recordDailyWin, isPlayable } from './daily.js';
import { bountyFor, bountyConditionMet } from './bounty.js';
import { IMPOUND_LOT } from './impound-lot.data.js';
import { dailyShareText, shareText } from './share.js';
import { setStreakReminder } from './notify.js';
import { PALETTE, vehicleSVG, wallSVG, dressingSVG, gateSVG, hitchSVG, warmVehiclePhotos, basePhotos, combinedPhotos } from './art.js';
import { CARS, DEFAULT_CAR, ownedCarIds, pendingReveals, skinFor, carIdForLevel, carIdForBountyTier, carById } from './collection.js';
import { loadLibrary, getLibrary, addAsset, updateAsset, replaceAsset, removeAsset, setBaseDisabled, setHeroPhoto, clearHeroPhoto, resetLibrary, loadImageFromFile, loadImageFromDataUrl, downscaleForPreview, renderToCanvas } from './library.js';

const BOUNTY_TIER_ACCENT = { common: '#8fbf6b', uncommon: '#e0a840', rare: '#d43f6a', legendary: '#f5d442' };

const $ = id => document.getElementById(id);
const FREE_LEVELS = CHAPTER_SIZE * 2;        // chapters 1–2 free; 3–4 are Pro
const SKIP_AFTER_MS = 8 * 60 * 1000;         // quiet skip valve (plan 0.7)
const HINT_TOKENS_PER_DAY = 3;
const PURSUIT_PAUSES_MAX = 3;                // pause tokens per Pursuit attempt (v1)

/* ================== STATE ================== */
let mode = { type: 'campaign' };             // or {type:'daily', date, level}
let cur = 0;                                  // campaign level index
let curImpound = 0;                           // Impound Lot index (js/impound-lot.data.js)
let pastIntro = false;                        // true once the mode picker has been confirmed this session — see startBoard
let curLevel = null;                          // {m, p, w?, g?, h?} for whatever is on the board
let pieces = [];
let walls = [];                               // immovable roadworks cells [[r,c],…]
let gates = [];                               // interlock gates [{sensors, gate, polarity}]
let hitches = [];                             // hitches [{tow, trailer}]
let decoupledHitches = new Set();             // indices of decoupled hitches
let history = [];
let moves = 0;
let undos = 0, hintsUsed = 0;
let solvedAnim = false;
let levelStart = Date.now();
let skipShown = false;
let isCleanGetaway = false;
let isBountyMet = false;

// Pursuit mode: real-time countdown, ticks while running, freezes while paused.
let pursuitTimeLeft = 0;
let pursuitTimerId = null;
let pursuitPaused = false;
let pursuitPausesLeft = PURSUIT_PAUSES_MAX;

let save = {
  unlocked: 1,
  stars: {}, best: {},
  // Which campaign levels have been cleared under a car-earning pacing
  // (Heist or Pursuit) — separate from `stars`, which tracks completion
  // for every pacing including Relaxed. js/collection.js's jobUnlockCheck
  // reads this, not stars, so a Relaxed clear never unlocks a job car.
  jobClears: {},
  pro: false,
  streak3: 0,
  hints: { day: '', left: HINT_TOKENS_PER_DAY },
  settings: { sfx: 1, music: 0.5, haptics: true, colorblind: false, autoAdvance: true, reminder: false, mode: 'heist' },
  modeLevel: { relaxed: 0, heist: 0, pursuit: 0 }, // last-played campaign level index, per mode
  equippedCar: DEFAULT_CAR,
  carsSeen: [],
  hitchSeen: false,
  admin: false,
  bounties: { done: {} },   // 'YYYY-MM-DD' -> {moves, par, met, tier, condition}
  impound: { stars: {}, best: {} },   // keyed by board `key` (levelKey), not array index
};
let memOnly = false;
let carRevealQueue = [];
let afterRevealAction = null;

async function persist(){
  if(memOnly) return;
  if(!await store('save_v1', save)){
    memOnly = true;
    toast(t('toast.saveoff'));
  }
}

/* ================== BOARD RENDER ================== */
const board = $('board');
const gate = $('gate');
let CELL = 64;

function layout(){
  const vw = Math.min(window.innerWidth, 560) - 28 - 32;
  const vh = window.innerHeight - 320;
  CELL = Math.floor(Math.max(40, Math.min(vw, Math.max(vh, 240))) / 6);
  document.documentElement.style.setProperty('--cell', CELL + 'px');
  gate.style.top = (16 + EXIT_ROW * CELL - 4) + 'px';
  gate.style.height = (CELL + 8) + 'px';
  drawGrid();
  renderPositions(false);
}
function drawGrid(){
  const s = CELL * 6;
  const svg = $('gridlines');
  svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
  let h = '';
  for(let i = 1; i < 6; i++){
    h += `<line x1="${i * CELL}" y1="0" x2="${i * CELL}" y2="${s}"/>`;
    h += `<line x1="0" y1="${i * CELL}" x2="${s}" y2="${i * CELL}"/>`;
  }
  const tick = Math.max(6, CELL * 0.14), o = Math.max(3, CELL * 0.075);
  for(let r = 0; r < 6; r++) for(let c = 0; c < 6; c++){
    const x = c * CELL, y = r * CELL;
    h += `<path d="M ${x + o + tick} ${y + o} h ${-tick} v ${tick} M ${x + CELL - o - tick} ${y + o} h ${tick} v ${tick}
           M ${x + o + tick} ${y + CELL - o} h ${-tick} v ${-tick} M ${x + CELL - o - tick} ${y + CELL - o} h ${tick} v ${-tick}"
           fill="none" stroke="rgba(255,255,255,.055)" stroke-width="2" stroke-linecap="round"/>`;
  }
  h += dressingSVG(CELL, EXIT_ROW, '#ffd9a0');
  svg.innerHTML = h;
}

function grid(exclude = -1){
  const ex = Array.isArray(exclude) ? new Set(exclude) : new Set([exclude]);
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  for(const [wr, wc] of walls) g[wr][wc] = -2;   // roadworks: never empty
  pieces.forEach((p, i) => {
    if(ex.has(i)) return;
    for(let k = 0; k < p.len; k++){
      g[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] = i;
    }
  });
  return g;
}
function rangeForWithGrid(i, g){
  const p = pieces[i];
  let lo, hi;
  if(p.dir === 'h'){
    lo = p.c; while(lo > 0 && g[p.r][lo - 1] === -1) lo--;
    hi = p.c; while(hi + p.len < N && g[p.r][hi + p.len] === -1) hi++;
  } else {
    lo = p.r; while(lo > 0 && g[lo - 1][p.c] === -1) lo--;
    hi = p.r; while(hi + p.len < N && g[hi + p.len][p.c] === -1) hi++;
  }
  return [lo, hi];
}

/* Weight (plan 0.5): trucks settle slower and heavier than cars. */
function easingFor(len, distCells){
  const base = len === 3 ? 0.26 : 0.18;
  const dur = Math.min(0.42, base + distCells * 0.028);
  const curve = len === 3 ? 'cubic-bezier(.3,.75,.35,1.06)' : 'cubic-bezier(.22,.9,.3,1.15)';
  return `transform ${dur}s ${curve}`;
}

/* Small stable string hash (djb2) — used to seed the daily puzzle's photo
   rotation from its date string, so "today's board" always looks the same
   on every device rather than picking randomly on each render. */
function hashStr(s){
  let h = 5381;
  for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* Per-level seed for the traffic photo rotation (see buildPieces). Deriving
   it from the level's own identity — rather than incrementing a counter or
   picking randomly — keeps a given level looking the same across replays,
   undos, and re-visits within a session. */
function levelPhotoSeed(){
  if(mode.type === 'daily') return hashStr(mode.date ?? '');
  if(mode.type === 'sandbox') return hashStr(JSON.stringify(curLevel?.p ?? []));
  return cur;
}

/* Which car is the hero on the board right now (js/collection.js's job-car
   system). Campaign under Heist or Pursuit pacing is a "job" — the mark
   decides the car, not the player, same as a real crew doesn't pick what's
   in the truck; see HEIST-PLAN.md §2. Bounty is always a job too (that's
   the whole point of "Tonight's Mark"), regardless of pacing.

   Relaxed has no job framing — no alarm, no timer, just your own driving —
   so a campaign level played under Relaxed pacing stays on whatever the
   player last equipped in the Garage (default: the classic red car),
   exactly like Daily/Impound/Sandbox. It does NOT show the level's mark.
   This also means clearing a level in Relaxed can't unlock that mark's
   car — see the save.jobClears gate in winSequence — matching Relaxed's
   "no job, no reward" framing all the way through. */
function heroCarIdForAttempt(){
  if(mode.type === 'campaign' && save.settings.mode !== 'relaxed') return carIdForLevel(cur);
  if(mode.type === 'bounty') return carIdForBountyTier(mode.tier);
  return save.equippedCar;
}

function buildPieces(){
  board.querySelectorAll('.piece, .wall, .gate, .hitch').forEach(el => el.remove());
  walls.forEach(([r, c], i) => {
    const el = document.createElement('div');
    el.className = 'wall';
    el.dataset.r = r; el.dataset.c = c;
    el.style.width = CELL + 'px';
    el.style.height = CELL + 'px';
    el.style.transform = `translate(${c * CELL}px, ${r * CELL}px)`;
    el.innerHTML = wallSVG(i);
    el.setAttribute('aria-hidden', 'true');
    board.appendChild(el);
  });
  gates.forEach((gate, gi) => {
    const [r, c] = gate.gate;
    const el = document.createElement('div');
    el.className = 'gate';
    el.dataset.r = r; el.dataset.c = c; el.dataset.gi = gi;
    el.style.width = CELL + 'px';
    el.style.height = CELL + 'px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.transform = `translate(${c * CELL}px, ${r * CELL}px)`;
    el.style.pointerEvents = 'none';
    el.innerHTML = gateSVG(CELL / 2, CELL / 2, CELL * 0.4);
    el.setAttribute('aria-hidden', 'true');
    board.appendChild(el);
  });
  hitches.forEach((hitch, hi) => {
    const el = document.createElement('div');
    el.className = 'hitch';
    el.dataset.hi = hi;
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = (CELL * 6) + 'px';
    el.style.height = (CELL * 6) + 'px';
    el.style.pointerEvents = 'none';
    el.setAttribute('aria-hidden', 'true');
    board.appendChild(el);
  });
  /* Per-class photo ordinals: pieces of the same class (sedan / truck /
     hitch trailer) count up separately from 0, so no two pieces in one
     level share a photo — the global piece index would collide once it
     wraps a photo array (e.g. trucks at idx 3 and 11 both landing on
     photo 3). Colour variety (no two same-coloured cars in one level) is
     handled inside vehicleSVG's bucketSequence(), keyed off the level's
     own seed (see levelPhotoSeed) — passed straight through here so the
     ordinal only needs to track "which one of this level's sedans/trucks/
     trailers is this", not fold the seed into itself. */
  const seed = levelPhotoSeed();
  let sedanOrd = 0, truckOrd = 0, trailerOrd = 0;
  pieces.forEach((p, i) => {
    const el = document.createElement('div');
    const isTow = hitches.some(h => h.tow === i);
    const isTrailer = hitches.some(h => h.trailer === i);
    el.className = 'piece' + (i === 0 ? ' hero' : '') + (isTow ? ' tow' : '');
    el.dataset.idx = i;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.style.width = (p.dir === 'h' ? p.len : 1) * CELL + 'px';
    el.style.height = (p.dir === 'v' ? p.len : 1) * CELL + 'px';
    const photoOrd = i === 0 ? 0 : (isTrailer ? trailerOrd++ : (p.len >= 3 ? truckOrd++ : sedanOrd++));
    el.innerHTML = vehicleSVG(i, p.len, p.dir, i === 0, {
      colorblind: save.settings.colorblind,
      skin: i === 0 ? skinFor(heroCarIdForAttempt()) : null,
      seed,
      photoOrd,
      trailer: isTrailer,
    });
    el.classList.add('enter');
    el.style.animationDelay = (i * 0.028) + 's';
    el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    board.appendChild(el);
    attachDrag(el, i);
  });
  updatePieceAria();
  renderPositions(false);
  lastGateOpen = [];
  updateGates(true);
}
function updatePieceAria(){
  board.querySelectorAll('.piece').forEach(el => {
    const i = +el.dataset.idx, p = pieces[i];
    if(!p) return;
    const isInertTrailer = hitches.some((h, hi) => h.trailer === i && !decoupledHitches.has(hi));
    el.setAttribute('aria-label',
      (i === 0 ? 'Red car — escape this one'
        : isInertTrailer ? `Vehicle ${i}, trailer — moves only with its tow vehicle`
        : `Vehicle ${i}, ${p.len === 3 ? 'truck' : 'car'}`) +
      `, row ${p.r + 1}, column ${p.c + 1}, ` +
      (p.dir === 'h' ? 'moves left and right' : 'moves up and down'));
  });
}
function renderPositions(animate = true){
  board.querySelectorAll('.wall').forEach(el => {
    el.style.width = CELL + 'px';
    el.style.height = CELL + 'px';
    el.style.transform = `translate(${el.dataset.c * CELL}px, ${el.dataset.r * CELL}px)`;
  });
  board.querySelectorAll('.piece').forEach(el => {
    const i = +el.dataset.idx, p = pieces[i];
    if(!p) return;
    el.style.width = (p.dir === 'h' ? p.len : 1) * CELL + 'px';
    el.style.height = (p.dir === 'v' ? p.len : 1) * CELL + 'px';
    if(!animate) el.style.transition = 'none';
    el.style.transform = `translate(${p.c * CELL}px, ${p.r * CELL}px)`;
    if(!animate){ void el.offsetWidth; el.style.transition = ''; }
  });
  board.querySelectorAll('.hitch').forEach(el => {
    const hi = +el.dataset.hi, h = hitches[hi];
    if(!h || decoupledHitches.has(hi)){ el.innerHTML = ''; return; }   // decoupled: no connector line
    const tow = pieces[h.tow], trailer = pieces[h.trailer];
    if(!tow || !trailer) return;
    // Center of tow piece
    const towCx = (tow.c + (tow.dir === 'h' ? tow.len / 2 : 0.5)) * CELL;
    const towCy = (tow.r + (tow.dir === 'v' ? tow.len / 2 : 0.5)) * CELL;
    // Center of trailer piece
    const trailerCx = (trailer.c + (trailer.dir === 'h' ? trailer.len / 2 : 0.5)) * CELL;
    const trailerCy = (trailer.r + (trailer.dir === 'v' ? trailer.len / 2 : 0.5)) * CELL;
    el.innerHTML = hitchSVG(towCx, towCy, trailerCx, trailerCy, CELL * 0.08);
  });
}

/* Interlock-gate state feedback: a gate cell is passable iff sensor
   occupancy differs from its polarity (same rule as js/solver.js's
   gateBlocks). Open gates dim so the player can read the board state at a
   glance; a state flip caused by a committed move gets a chirp. Undo,
   reset and level load refresh silently (silent=true). */
let lastGateOpen = [];
function updateGates(silent = false){
  if(!gates.length){ lastGateOpen = []; return; }
  const covered = (r, c) => pieces.some(p =>
    p.dir === 'h' ? (p.r === r && c >= p.c && c < p.c + p.len)
                  : (p.c === c && r >= p.r && r < p.r + p.len));
  const now = gates.map(gt => gt.sensors.some(([sr, sc]) => covered(sr, sc)) !== gt.polarity);
  const changed = lastGateOpen.length === now.length && now.some((v, i) => v !== lastGateOpen[i]);
  board.querySelectorAll('.gate[data-gi]').forEach(el => {
    el.classList.toggle('gate-open', now[+el.dataset.gi]);
  });
  if(!silent && changed) sfx('gate');
  lastGateOpen = now;
}

/* ================== DRAG + FLICK ================== */
/* For a coupled tow, dragging also drags its trailer by the identical
   delta (see the auto-couple block in finish()/keydown below) — so the
   draggable range has to be the INTERSECTION of what the tow's own lane
   allows and what the trailer's own lane allows, not just the tow's.
   Without this a tow whose own lane is clear could be dragged past a
   point where its trailer (elsewhere on the board, moving in lockstep)
   would collide with something — the solver's legalMoves rejects that
   compound move, so the board has to match or a "verified" par could be
   undercut by a drag the solver never considered legal. */
function rangeFor(i){
  const hIdx = hitches.findIndex((h, hi) => h.tow === i && !decoupledHitches.has(hi));
  if(hIdx !== -1){
    const trailerI = hitches[hIdx].trailer;
    const tow = pieces[i], trailer = pieces[trailerI];
    if(trailer && trailer.dir === tow.dir){
      const g2 = grid([i, trailerI]);
      const [towLo, towHi] = rangeForWithGrid(i, g2);
      const [trLo, trHi] = rangeForWithGrid(trailerI, g2);
      const towCur = tow.dir === 'h' ? tow.c : tow.r;
      const trCur = trailer.dir === 'h' ? trailer.c : trailer.r;
      const deltaLo = Math.max(towLo - towCur, trLo - trCur);
      const deltaHi = Math.min(towHi - towCur, trHi - trCur);
      return [towCur + deltaLo, towCur + deltaHi];
    }
  }
  return rangeForWithGrid(i, grid(i));
}

function attachDrag(el, i){
  let startX = 0, startY = 0, startPos = 0, lo = 0, hi = 0;
  let dragging = false, lastSlideT = 0, lastCell = 0, hitWall = false;
  let samples = [];
  let lastTapT = 0;
  const p = () => pieces[i];

  el.addEventListener('pointerdown', e => {
    // Double-tap to decouple (for tow pieces)
    const now = performance.now();
    if(now - lastTapT < 300){
      if(decoupleTow(i)){
        renderPositions(true);
        updateHud();
        updatePieceAria();
      }
      lastTapT = 0;
      return;
    }
    lastTapT = now;
    if(solvedAnim || pursuitPaused) return;
    // Prevent dragging inert trailers (only tow can move, trailer follows)
    const isInertTrailer = hitches.some((h, hi) => h.trailer === i && !decoupledHitches.has(hi));
    if(isInertTrailer){ sfx('deny'); return; }
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    dragging = true; hitWall = false;
    el.classList.add('drag');
    startX = e.clientX; startY = e.clientY;
    startPos = p().dir === 'h' ? p().c : p().r;
    lastCell = startPos;
    kbRun = -1;
    samples = [{ t: performance.now(), pos: startPos }];
    [lo, hi] = rangeFor(i);
    clearHint();
    clearHand();
  });

  el.addEventListener('pointermove', e => {
    if(!dragging) return;
    const d = p().dir === 'h' ? (e.clientX - startX) : (e.clientY - startY);
    let pos = startPos + d / CELL;
    if(pos < lo){ pos = lo - Math.min(0.22, (lo - pos) * 0.25); if(!hitWall){ hitWall = true; haptic(p().len === 3 ? 'thudHeavy' : 'thud'); } }
    else if(pos > hi){ pos = hi + Math.min(0.22, (pos - hi) * 0.25); if(!hitWall){ hitWall = true; haptic(p().len === 3 ? 'thudHeavy' : 'thud'); } }
    else hitWall = false;
    const x = p().dir === 'h' ? pos * CELL : p().c * CELL;
    const y = p().dir === 'v' ? pos * CELL : p().r * CELL;
    el.style.transform = `translate(${x}px, ${y}px)`;
    const now = performance.now();
    samples.push({ t: now, pos });
    if(samples.length > 8) samples.shift();
    // light tick per cell crossed (plan 0.4)
    const cellNow = Math.round(Math.max(lo, Math.min(hi, pos)));
    if(cellNow !== lastCell){ haptic('tick'); lastCell = cellNow; }
    if(Math.abs(d) > CELL * 0.4 && now - lastSlideT > 130){ sfx('slide'); lastSlideT = now; }
  });

  const finish = e => {
    if(!dragging) return;
    dragging = false;
    el.classList.remove('drag');
    const d = p().dir === 'h' ? (e.clientX - startX) : (e.clientY - startY);
    const rawPos = startPos + d / CELL;

    // flick velocity over the last ~90ms of the gesture (plan 0.5)
    const now = performance.now();
    const old = samples.find(s => now - s.t <= 90) ?? samples[0];
    const last = samples[samples.length - 1] ?? { t: now, pos: rawPos };
    const dt = Math.max(1, last.t - old.t);
    const v = (last.pos - old.pos) / dt;          // cells per ms

    let target;
    let flicked = false;
    if(Math.abs(v) > 0.006 && Math.abs(d) > CELL * 0.15){
      target = v > 0 ? hi : lo;                    // flick slides to the wall
      flicked = target !== Math.max(lo, Math.min(hi, Math.round(rawPos)));
    } else {
      target = Math.round(rawPos);
    }
    target = Math.max(lo, Math.min(hi, target));

    const before = p().dir === 'h' ? p().c : p().r;
    if(target !== before){
      pushHistory();
      const offset = target - before;
      if(p().dir === 'h') p().c = target; else p().r = target;
      // Auto-couple: move trailer along with tow (if hitch not decoupled)
      for(let hi = 0; hi < hitches.length; hi++){
        const h = hitches[hi];
        if(h.tow === i && !decoupledHitches.has(hi)){
          const trailer = pieces[h.trailer];
          if(trailer && trailer.dir === p().dir){
            if(p().dir === 'h') trailer.c += offset; else trailer.r += offset;
          }
        }
      }
      const dist = Math.abs(target - before);
      if(flicked){
        el.style.transition = `transform ${Math.min(0.45, 0.12 + dist * 0.055)}s cubic-bezier(.18,.7,.3,1.12)`;
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          if(target === lo || target === hi){
            haptic(p().len === 3 ? 'thudHeavy' : 'thud');
            sfx('thud');
            dustAt(i, target === hi);
          }
        }, { once: true });
      } else {
        el.style.transition = easingFor(p().len, dist);
        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
      }
      commitMove(i);
    } else {
      renderPositions(true);
      if(Math.abs(d) > CELL * 0.35) sfx('deny');
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);

  el.addEventListener('keydown', e => {
    if(solvedAnim || pursuitPaused) return;
    const map = { ArrowLeft: [-1, 'h'], ArrowRight: [1, 'h'], ArrowUp: [-1, 'v'], ArrowDown: [1, 'v'] };
    const m = map[e.key];
    if(!m) return;
    // Prevent keyboard control of inert trailers
    const isInertTrailer = hitches.some((h, hi) => h.trailer === i && !decoupledHitches.has(hi));
    if(isInertTrailer){ sfx('deny'); return; }
    e.preventDefault();
    const pp = p();
    if(pp.dir !== m[1]){ sfx('deny'); return; }
    const [klo, khi] = rangeFor(i);
    const at = pp.dir === 'h' ? pp.c : pp.r;
    const to = at + m[0];
    if(to < klo || to > khi){ sfx('deny'); return; }
    /* Consecutive key-steps of the same piece merge into ONE move — a
       keyboard slide scores the same as the equivalent drag, so keyboard
       and VoiceOver players can still hit par (plan 0.8). */
    const merge = kbRun === i;
    if(!merge) pushHistory();
    const offset = to - at;
    if(pp.dir === 'h') pp.c = to; else pp.r = to;
    // Auto-couple: move trailer along with tow (if hitch not decoupled)
    for(let hi = 0; hi < hitches.length; hi++){
      const h = hitches[hi];
      if(h.tow === i && !decoupledHitches.has(hi)){
        const trailer = pieces[h.trailer];
        if(trailer && trailer.dir === pp.dir){
          if(pp.dir === 'h') trailer.c += offset; else trailer.r += offset;
        }
      }
    }
    commitMove(i, merge);
    kbRun = i;
    clearTimeout(kbRunT);
    kbRunT = setTimeout(() => { kbRun = -1; }, 1200);   // pause ends the slide
  });
}

let kbRun = -1;   // piece index of an in-progress keyboard slide, -1 = none
let kbRunT = null;

function pushHistory(){
  history.push({
    pieces: pieces.map(p => ({ r: p.r, c: p.c })),
    decoupled: new Set(decoupledHitches)
  });
  if(history.length > 500) history.shift();
  updateHud();
}
function commitMove(i, mergedKeyStep = false){
  if(!mergedKeyStep) moves++;
  sfx('snap');
  renderPositions(true);
  updateGates();
  updateHud();
  updatePieceAria();
  const p = pieces[i];
  const moveAnnounce = (i === 0 ? 'Red car' : 'Vehicle ' + i) + ` to row ${p.r + 1}, column ${p.c + 1}`;

  const won = i === 0 && pieces[0].c === N - pieces[0].len;
  const gm = save.settings.mode;

  if(gm === 'heist'){
    const budget = alarmBudgetFor(parOf());
    const remaining = budget - moves;
    if(moves === 1){
      $('srLive').textContent = moveAnnounce + '. ' + t('alarm.triggered', { n: remaining });
    } else {
      $('srLive').textContent = moveAnnounce + '. ' + t('alarm.remaining', { n: remaining });
    }
  } else if(gm === 'pursuit' && moves === 1){
    $('srLive').textContent = moveAnnounce + '. ' + t('pursuit.triggered');
  } else {
    $('srLive').textContent = moveAnnounce;
  }

  if(moves === 1 && !mergedKeyStep && gm === 'pursuit'){
    // Music already started at level load (see startBoard), same as
    // Heist/Relaxed — only the countdown itself waits for the first move.
    startPursuitTimer();
  }

  if(gm !== 'relaxed' && moves === 1 && !mergedKeyStep && !won){
    triggerAlarmFlash();
  }

  if(gm === 'heist' && moves > alarmBudgetFor(parOf())){
    busted('heist');
    return;
  }

  if(won){
    winSequence();
  } else {
    scheduleHand();
  }
}

/* Heist and Pursuit are both hard fails, not just reward-tier gates —
   going over budget or out of time ends the attempt before it can be
   solved (police arrive / the clock runs out). */
function busted(kind){
  solvedAnim = true;
  clearHint(); clearHand();
  clearPursuitTimer();
  stopAttemptTrack();
  sfx('busted');
  haptic('thudHeavy');
  track(kind === 'pursuit' ? 'pursuit_busted' : 'alarm_busted', {
    mode: mode.type, level: mode.type === 'campaign' ? cur + 1 : mode.number,
    moves, par: parOf(), hintsUsed, ...(mode.date && { date: mode.date }),
  });
  setTimeout(() => showBustedSheet(kind), 260);
}

function showBustedSheet(kind){
  const prefix = kind === 'pursuit' ? 'pursuit.busted.' : 'busted.';
  $('bustedFlag').textContent = t(prefix + 'flag');
  $('bustedTitle').textContent = t(prefix + 'title');
  $('bustedSub').textContent = t(prefix + 'sub');
  showOverlay('bustedOverlay');
  $('srLive').textContent = t(prefix + 'title');
  setTimeout(() => $('bustedRetryBtn').focus(), 100);
}

/* "The clock just started" — a brief flash the moment the first piece
   moves in a Heist/Pursuit attempt, so the budget/timer clearly starts now. */
function triggerAlarmFlash(){
  const el = $('alarmFlash');
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
  sfx('alarmTrigger');
  haptic('thudHeavy');
  el.addEventListener('animationend', () => el.classList.remove('go'), { once: true });
}

/* ================== PURSUIT MODE ================== */
function startPursuitTimer(){
  clearPursuitTimer();
  pursuitTimerId = setInterval(() => {
    if(pursuitPaused) return;
    pursuitTimeLeft--;
    updateModeHud();
    if(pursuitTimeLeft <= 0){
      pursuitTimeLeft = 0;
      updateModeHud();
      clearPursuitTimer();
      busted('pursuit');
    }
  }, 1000);
}

function clearPursuitTimer(){
  if(pursuitTimerId){ clearInterval(pursuitTimerId); pursuitTimerId = null; }
}

/* Pause locks the board and freezes the countdown; unpause hands the
   attempt track's foreground back via the same duck/resume path a
   closed tab uses. Header nav is disabled too, so a manual pause can't
   be compounded with a tab-open duck at the same time. */
function togglePursuitPause(){
  if(solvedAnim || moves === 0) return;
  if(pursuitPaused){
    pursuitPaused = false;
    resumeAttemptTrack();
    hideBoardPause();
  } else {
    if(pursuitPausesLeft <= 0) return;
    pursuitPaused = true;
    pursuitPausesLeft--;
    duckAttemptTrack();
    showBoardPause();
  }
  sfx('ui');
  updateModeHud();
}

function showBoardPause(){
  $('boardPauseOverlay').hidden = false;
  $('boardPausedLabel').textContent = t('pursuit.pausedLabel');
  $('boardPausesLeftLabel').textContent = t('pursuit.pausesLeftLabel', { n: pursuitPausesLeft });
  $('boardResumeBtn').textContent = t('pursuit.resume');
  setNavLocked(true);
}

function hideBoardPause(){
  $('boardPauseOverlay').hidden = true;
  setNavLocked(false);
}

function setNavLocked(locked){
  ['levelsBtn', 'dailyBtn', 'bountyBtn', 'garageBtn', 'settingsBtn'].forEach(id => { $(id).disabled = locked; });
}

/* ================== HUD ================== */
function parOf(){ return curLevel.m; }
function starCountFor(par, usedMoves){
  if(usedMoves <= par) return 3;
  if(usedMoves <= par + Math.max(3, Math.ceil(par * 0.35))) return 2;
  return 1;
}
function alarmBudgetFor(par){
  return par + Math.max(2, Math.ceil(par * 0.25));
}
/* Pursuit's real-time budget — v1 formula: 1 second per optimal move
   (par = 10 → 10s). Tight on purpose; loosen from funnel data once
   Pursuit has live completion rates, same as alarmBudgetFor. */
function pursuitTimeFor(par){
  return par;
}
function formatTime(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
function starStr(n, size = 3){
  let s = '';
  for(let i = 0; i < size; i++) s += i < n ? '★' : '<span class="off">★</span>';
  return s;
}
function chapterOf(idx){ return Math.floor(idx / CHAPTER_SIZE); }
/* Highest campaign index currently playable (unlock progress + Pro gate). */
function campaignUpperBound(){
  return Math.min(save.unlocked, save.pro ? LEVELS.length : FREE_LEVELS, LEVELS.length) - 1;
}

const IMPOUND_ACCENT = '#d4af37';

function applyChapterAccent(){
  const accent = mode.type === 'daily' ? '#ffb454'
    : mode.type === 'bounty' ? BOUNTY_TIER_ACCENT[mode.tier]
    : mode.type === 'impound' ? IMPOUND_ACCENT
    : CHAPTERS[chapterOf(cur)].accent;
  document.documentElement.style.setProperty('--accent', accent);
}

function updateHud(){
  if(mode.type === 'daily'){
    $('hudLevel').textContent = '#' + mode.number;
    $('hudTier').textContent = t('hud.daily');
    $('hudStars').innerHTML = isDone(mode.date) ? starStr(daily().done[mode.date].stars) : starStr(0);
  } else if(mode.type === 'bounty'){
    $('hudLevel').textContent = '#' + mode.number;
    $('hudTier').textContent = t('hud.bounty');
    const done = save.bounties.done[mode.date];
    $('hudStars').innerHTML = done ? (done.met ? '⚡' : '') : '';
  } else if(mode.type === 'impound'){
    $('hudLevel').textContent = '#' + (curImpound + 1);
    $('hudTier').textContent = t('hud.impound');
    $('hudStars').innerHTML = starStr(save.impound.stars[curLevel.key] || 0);
  } else if(mode.type === 'sandbox'){
    $('hudLevel').textContent = '✎';
    $('hudTier').textContent = 'Sandbox';
    $('hudStars').innerHTML = '';
  } else {
    $('hudLevel').textContent = cur + 1;
    $('hudTier').textContent = CHAPTERS[chapterOf(cur)].name;
    $('hudStars').innerHTML = starStr(save.stars[cur] || 0);
  }
  $('hudMoves').textContent = moves;
  $('hudPar').textContent = parOf();
  $('undoBtn').disabled = history.length === 0 || solvedAnim || pursuitPaused;
  const s3 = $('hudStreak3');
  s3.textContent = `🔥 ${save.streak3}×3★`;
  s3.classList.toggle('on', save.streak3 >= 2 && mode.type === 'campaign');
  updateModeHud();
  updateControlsVisibility();
  updateHintBadge();
  $('dailyDot').classList.toggle('on', !isDone(todayStr()));
  $('bountyDot').classList.toggle('on', !save.bounties.done[todayStr()]?.met);
}

function updateModeHud(){
  const gm = save.settings.mode;
  $('hudParRow').hidden = gm !== 'relaxed';
  $('hudAlarmRow').hidden = gm !== 'heist';
  $('hudPursuitRow').hidden = gm !== 'pursuit';

  if(gm === 'heist'){
    const budget = alarmBudgetFor(parOf());
    const remaining = budget - moves;
    $('hudAlarmBudget').textContent = Math.max(0, remaining);
    $('hudAlarmRow').setAttribute('aria-label', t('alarm.remaining', { n: Math.max(0, remaining) }));
    $('hudAlarmRow').classList.toggle('tripped', remaining < 0);
    $('hudAlarmRow').classList.toggle('low', remaining >= 0 && remaining <= Math.max(1, Math.ceil(budget * 0.2)));
  } else if(gm === 'pursuit'){
    const budget = pursuitTimeFor(parOf());
    $('hudPursuitTime').textContent = formatTime(pursuitTimeLeft);
    $('hudPursuitRow').setAttribute('aria-label', t('pursuit.remaining', { n: pursuitTimeLeft }));
    $('hudPursuitRow').classList.toggle('low', pursuitTimeLeft <= Math.max(5, Math.ceil(budget * 0.2)));
    const pauseBtn = $('pursuitPauseBtn');
    pauseBtn.textContent = pursuitPaused ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-label', pursuitPaused ? t('pursuit.resume') : t('pursuit.pause'));
    pauseBtn.disabled = !pursuitPaused && (pursuitPausesLeft <= 0 || moves === 0 || solvedAnim);
  }
}

/* Onboarding (plan 0.6): hint appears at level 4, undo at level 6. */
function updateControlsVisibility(){
  const onboarding = mode.type === 'campaign';
  const hideHint = onboarding && cur < 3;
  const hideUndo = onboarding && cur < 5;
  $('hintBtn').classList.toggle('hidden', hideHint);
  $('undoBtn').classList.toggle('hidden', hideUndo);
  const visible = 3 - (hideHint ? 1 : 0) - (hideUndo ? 1 : 0);
  $('controls').classList.toggle('two', visible === 2);
  $('controls').classList.toggle('one', visible === 1);
}

function updateHintBadge(){
  const b = $('hintBadge');
  if(save.pro){ b.hidden = true; return; }
  refreshHintTokens();
  b.hidden = $('hintBtn').classList.contains('hidden');
  b.textContent = save.hints.left;
}
function refreshHintTokens(){
  const today = todayStr();
  if(save.hints.day !== today){
    save.hints = { day: today, left: HINT_TOKENS_PER_DAY };
  }
}

/* ================== LEVEL LOAD ================== */
// Bounty jobs force their own fixed pacing (see loadBountyLevel) — this
// remembers whatever the player actually had selected so it can be
// restored the moment they leave the bounty for anything else, rather
// than the override leaking into their next campaign/daily/impound
// session. Null whenever no override is currently in effect.
let preBountyMode = null;

function abandonIfMidLevel(){
  if(moves > 0 && !solvedAnim){
    track('level_abandon', {
      mode: mode.type, level: trackLevelId(),
      moves, time_s: Math.round((Date.now() - levelStart) / 1000),
    });
  }
  if(preBountyMode !== null){
    save.settings.mode = preBountyMode;
    setGameMode(preBountyMode);
    updateModeSelectUI();
    preBountyMode = null;
    persist();
  }
}

function loadLevel(idx){
  abandonIfMidLevel();
  // No stopMenuMusic() here on purpose: the opening theme should keep
  // playing right through this navigation, with no silent gap, until
  // startBoard()'s attempt track is actually ready to hand off — see
  // audio.js's crossfadeOutOtherTracks.
  mode = { type: 'campaign' };
  cur = idx;
  curLevel = LEVELS[idx];
  // Each mode tracks its own place in the campaign — switching modes
  // never continues the level you were just on in a different mode.
  save.modeLevel[save.settings.mode] = idx;
  persist();
  startBoard();
  track('level_start', { level: idx + 1, par: curLevel.m, chapter: chapterOf(idx) + 1 });
}

function loadDailyLevel(dateStr){
  abandonIfMidLevel();
  const lv = dailyLevel(dateStr);
  mode = { type: 'daily', date: dateStr, number: dailyNumber(dateStr) };
  curLevel = lv;
  startBoard();
  track('daily_start', { date: dateStr, number: mode.number, par: lv.m });
}

function loadBountyLevel(dateStr){
  abandonIfMidLevel();
  const lv = bountyFor(dateStr);
  if(!lv) return;
  // The mark decides the pacing same as it decides the car — "It is always
  // in Heist or Pursuit mode depending on the job," never the player's own
  // Settings choice. Remember that choice (preBountyMode) so
  // abandonIfMidLevel can hand it back the moment this bounty is left.
  const pacing = carById(carIdForBountyTier(lv.tier))?.pacing ?? 'heist';
  if(save.settings.mode !== pacing){
    preBountyMode = save.settings.mode;
    save.settings.mode = pacing;
    setGameMode(pacing);
    updateModeSelectUI();
  }
  mode = { type: 'bounty', date: dateStr, number: lv.number, tier: lv.tier, condition: lv.condition, pacing };
  curLevel = lv;
  persist();
  startBoard();
  track('bounty_start', { date: dateStr, number: mode.number, par: lv.m, tier: lv.tier, condition: lv.condition, pacing });
}

/* Impound Lot (N2, docs/NEXT-PLAN.md): endgame board list, unlocked once
   Pro + every campaign level is cleared. Not date-gated like the daily/
   bounty — the whole curated list is available at once, worked through at
   the player's own pace like the campaign, hence its own advance()-style
   flow (see advanceImpound, nextImpoundIndex) rather than bounty's
   one-shot dead end. */
function impoundUnlocked(){
  return save.pro && save.unlocked >= LEVELS.length;
}

function loadImpoundLevel(idx){
  abandonIfMidLevel();
  mode = { type: 'impound' };
  curImpound = idx;
  curLevel = IMPOUND_LOT[idx];
  startBoard();
  track('impound_start', { index: idx, par: curLevel.m });
}

/* Identifier used in analytics/undo/hint tracking: the date for date-keyed
   modes, the board key for Impound, the campaign index otherwise. */
function trackLevelId(){
  if(mode.type === 'daily' || mode.type === 'bounty') return mode.date;
  if(mode.type === 'impound') return curLevel.key;
  return cur + 1;
}

function startBoard(){
  stopReplay(false);   // a new attempt invalidates any in-flight replay
  pieces = curLevel.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  walls = (curLevel.w ?? []).map(a => [a[0], a[1]]);
  gates = curLevel.g ?? [];
  hitches = curLevel.h ?? [];
  history = []; moves = 0; undos = 0; hintsUsed = 0;
  decoupledHitches.clear();
  solvedAnim = false;
  kbRun = -1;
  levelStart = Date.now();
  skipShown = false;
  $('skipRow').classList.remove('show');
  clearHint(); clearHand();
  applyChapterAccent();
  buildPieces();
  clearPursuitTimer();
  pursuitTimeLeft = pursuitTimeFor(parOf());
  pursuitPaused = false;
  pursuitPausesLeft = PURSUIT_PAUSES_MAX;
  hideBoardPause();
  updateHud();
  updateCoach();
  scheduleHand();
  // Every mode's music sets the mood immediately at level load — only
  // Pursuit's countdown itself still waits for the first move (see
  // commitMove), same "the clock starts when you start moving" reasoning,
  // now decoupled from when its music starts. This also covers Retry/
  // Reset/Replay (they all call startBoard() directly): the attempt
  // track restarts immediately rather than requiring a fresh first move
  // — startAttemptTrack() -> ensureAttemptAudio() crossfades away
  // whatever was already playing itself, so no separate stopAttemptTrack()
  // call here (that used to run first regardless, fighting the very
  // fadeIn that follows it a tick later — a measurable volume dip on
  // every retry, worse than a plain cut for Pursuit/Relaxed's multi-track
  // pools where the old and new tracks are different elements entirely).
  //
  // Gated on pastIntro: startBoard() also runs once during boot(), before
  // Start/the mode picker have been dismissed — starting an attempt track
  // there would register its autoplay retry on literally the first tap of
  // the session (tapping "Start" itself), cutting the opening theme short
  // before the player ever reaches the picker. introPlayBtn sets pastIntro
  // and calls startBoard() again right as the player confirms, which is
  // the actual "level start" moment that matters here.
  if(pastIntro) startAttemptTrack(save.settings.mode);
  else stopAttemptTrack(); // still pre-intro
  if(hitches.length && !save.hitchSeen){
    save.hitchSeen = true;
    persist();
    setTimeout(() => toast(t('toast.hitch')), 700);
  }
}

function undo(){
  if(!history.length || solvedAnim || pursuitPaused) return;
  kbRun = -1;
  const entry = history.pop();
  entry.pieces.forEach((q, i) => { pieces[i].r = q.r; pieces[i].c = q.c; });
  decoupledHitches = new Set(entry.decoupled);
  if(save.settings.mode !== 'heist') moves = Math.max(0, moves - 1);
  undos++;
  sfx('ui'); haptic('ui');
  track('undo_used', { mode: mode.type, level: trackLevelId() });
  renderPositions(true);
  updateGates(true);
  updateHud();
  updatePieceAria();
}

function decoupleTow(towIdx){
  if(solvedAnim || pursuitPaused) return false;
  const hi = hitches.findIndex(h => h.tow === towIdx);
  if(hi === -1) return false;
  if(decoupledHitches.has(hi)) return false;
  pushHistory();
  decoupledHitches.add(hi);
  moves++;
  sfx('decouple');
  haptic('ui');
  track('decouple', { mode: mode.type, level: trackLevelId() });
  updateHud();
  return true;
}

/* ================== HINTS ================== */
let hintTimer = null;
function clearHint(){
  document.querySelectorAll('.hint-glow').forEach(el => el.classList.remove('hint-glow'));
  document.querySelectorAll('.hint-arrow').forEach(el => el.remove());
  if(hintTimer){ clearTimeout(hintTimer); hintTimer = null; }
}
function showHint(){
  if(solvedAnim || pursuitPaused) return;
  if(!save.pro){
    refreshHintTokens();
    if(save.hints.left <= 0){
      toast(t('toast.nohints'));
      showOverlay('proOverlay');
      track('iap_view', { source: 'hints' });
      return;
    }
  }
  clearHint();
  const mv = firstOptimalMove(pieces, { walls, gates, hitches });
  if(!mv){ toast(t('toast.nosol')); sfx('deny'); return; }
  if(!save.pro){
    save.hints.left--;
    persist();
    updateHintBadge();
  }
  hintsUsed++;
  sfx('hint');
  track('hint_used', { mode: mode.type, level: trackLevelId() });

  if(mv.decouple !== undefined){
    // No destination to point at — the optimal move is to unhitch this
    // tow (double-tap it), not slide it anywhere.
    const el = board.querySelector(`.piece[data-idx="${mv.decouple}"]`);
    el.classList.add('hint-glow');
    const p = pieces[mv.decouple];
    const badge = document.createElement('div');
    badge.className = 'hint-arrow hint-decouple';
    badge.textContent = '⛓️‍💥';
    badge.style.left = p.c * CELL + 'px';
    badge.style.top = p.r * CELL + 'px';
    badge.style.width = (p.dir === 'h' ? p.len : 1) * CELL + 'px';
    badge.style.height = (p.dir === 'v' ? p.len : 1) * CELL + 'px';
    board.appendChild(badge);
    hintTimer = setTimeout(clearHint, 3200);
    return;
  }

  const el = board.querySelector(`.piece[data-idx="${mv.idx}"]`);
  el.classList.add('hint-glow');
  const p = pieces[mv.idx];
  const dr = mv.r - p.r, dc = mv.c - p.c;
  const arrow = document.createElement('div');
  arrow.className = 'hint-arrow';
  arrow.textContent = dc > 0 ? '→' : dc < 0 ? '←' : dr > 0 ? '↓' : '↑';
  const cx = (p.dir === 'h' ? (dc > 0 ? p.c + p.len : p.c - 1) : p.c);
  const cyr = (p.dir === 'v' ? (dr > 0 ? p.r + p.len : p.r - 1) : p.r);
  arrow.style.left = cx * CELL + 'px';
  arrow.style.top = cyr * CELL + 'px';
  arrow.style.width = CELL + 'px';
  arrow.style.height = CELL + 'px';
  board.appendChild(arrow);
  hintTimer = setTimeout(clearHint, 3200);
}

/* ================== ONBOARDING (plan 0.6) ================== */
function updateCoach(){
  const el = $('coach');
  if(mode.type === 'campaign' && cur < 3){
    el.textContent = t('coach.' + (cur + 1));
    el.classList.add('on');
  } else {
    el.textContent = '';
    el.classList.remove('on');
  }
}

let handTimer = null;
function clearHand(){
  document.querySelectorAll('.hand').forEach(el => el.remove());
  if(handTimer){ clearTimeout(handTimer); handTimer = null; }
}
function scheduleHand(){
  clearHand();
  if(!(mode.type === 'campaign' && cur < 3) || solvedAnim) return;
  handTimer = setTimeout(showHand, moves === 0 ? 900 : 3500);
}
function showHand(){
  if(solvedAnim || !(mode.type === 'campaign' && cur < 3)) return;
  const mv = firstOptimalMove(pieces, { walls, gates, hitches });
  if(!mv || mv.decouple !== undefined) return;   // hitches never appear in the intro ramp
  const p = pieces[mv.idx];
  const hand = document.createElement('div');
  hand.className = 'hand';
  hand.textContent = '👆';
  const midR = p.r + (p.dir === 'v' ? Math.min(p.len - 1, 1) * 0.5 : 0);
  const midC = p.c + (p.dir === 'h' ? Math.min(p.len - 1, 1) * 0.5 : 0);
  hand.style.left = (midC * CELL + CELL * 0.2) + 'px';
  hand.style.top = (midR * CELL + CELL * 0.25) + 'px';
  hand.style.setProperty('--hx', (mv.c - p.c) * CELL + 'px');
  hand.style.setProperty('--hy', (mv.r - p.r) * CELL + 'px');
  board.appendChild(hand);
}

/* ================== SKIP VALVE (plan 0.7) ================== */
setInterval(() => {
  if(mode.type !== 'campaign' || solvedAnim || skipShown) return;
  if(Date.now() - levelStart >= SKIP_AFTER_MS){
    skipShown = true;
    $('skipRow').classList.add('show');
  }
}, 15000);

function skipLevel(){
  track('level_skip', { level: cur + 1, time_s: Math.round((Date.now() - levelStart) / 1000) });
  save.stars[cur] = Math.max(save.stars[cur] || 0, 1);
  save.streak3 = 0;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, cur + 2));
  persist();
  toast(t('toast.skip'));
  advance();
}

/* ================== REPLAYS (win sheet only) ==================
   Two distinct replays share this tap-to-skip / input-lock machinery — the
   level is already cleared, so neither leaks anything to an unsolved level
   or undercuts the hint-token economy:
   - playSolutionReplay (NEXT-PLAN N3e / v1.1): the solver's own optimal
     path — "here's the ideal way," for chasing the 3-star retry.
   - playMoveReplay: the PLAYER's actual move sequence, sped up — "here's
     what you just did," independent of whether it matched par.
   Input stays locked the whole time (solvedAnim is still true post-win);
   any tap skips back to the win sheet. */
let replayToken = 0;

function stopReplay(reshow){
  replayToken++;
  document.removeEventListener('pointerdown', onReplaySkip);
  setNavLocked(false);
  if(reshow) showOverlay('winOverlay');
}
function onReplaySkip(){ sfx('ui'); stopReplay(true); }

function playSolutionReplay(){
  cancelAuto();
  hideOverlay('winOverlay');
  const token = ++replayToken;

  // Reset to the level's starting position. Full rebuild (not just
  // renderPositions) because the win animation left the hero element
  // translated off-board with an inline transition.
  pieces = curLevel.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  decoupledHitches = new Set();
  buildPieces();

  const sol = solve(pieces, { walls, gates, hitches });
  if(!sol.solvable){ showOverlay('winOverlay'); return; }   // can't happen for a shipped level; bail politely

  setNavLocked(true);
  $('hudMoves').textContent = 0;
  track('solution_replay', { mode: mode.type, level: trackLevelId(), par: sol.optimal });
  // arm tap-to-skip on the next tick so the click that opened the replay
  // doesn't immediately cancel it
  setTimeout(() => { if(token === replayToken) document.addEventListener('pointerdown', onReplaySkip); }, 80);

  let step = 0;
  const tick = () => {
    if(token !== replayToken) return;   // skipped, or a new level loaded
    if(step >= sol.path.length){
      const heroEl = board.querySelector('.piece[data-idx="0"]');
      heroEl.style.transition = 'transform .9s cubic-bezier(.5,0,.9,.4)';
      heroEl.style.transform = `translate(${(N + 2.6) * CELL}px, ${pieces[0].r * CELL}px)`;
      sfx('win');
      setTimeout(() => { if(token === replayToken) stopReplay(true); }, 950);
      return;
    }
    const mv = sol.path[step++];
    if(mv.decouple !== undefined){
      decoupledHitches.add(mv.decouple);
      sfx('decouple');
    } else {
      const p = pieces[mv.i];
      if(p.dir === 'h') p.c = mv.o; else p.r = mv.o;
      if(mv.i2 !== undefined){
        const q = pieces[mv.i2];
        if(q.dir === 'h') q.c = mv.o2; else q.r = mv.o2;
      }
      sfx('snap');
    }
    renderPositions(true);
    updateGates();
    $('hudMoves').textContent = step;
    setTimeout(tick, 480);
  };
  setTimeout(tick, 500);
}

/* "Replay" on the win sheet — the player's own moves, sped up. `history`
   holds a full board snapshot from before each non-merged move this
   attempt (see pushHistory/undo); nothing touches it between the win and
   this being clicked (input stays locked), so history[k] is exactly the
   state after move k for k>0, and the last move's result is just whatever
   `pieces`/decoupledHitches currently are — the win animation only sets an
   inline transform on the hero element, it never mutates `pieces` itself. */
function playMoveReplay(){
  cancelAuto();
  hideOverlay('winOverlay');
  const token = ++replayToken;

  const finalFrame = { pieces: pieces.map(p => ({ r: p.r, c: p.c })), decoupled: new Set(decoupledHitches) };
  const frames = [...history.slice(1), finalFrame];

  pieces = curLevel.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  decoupledHitches = new Set();
  buildPieces();

  if(!frames.length){ showOverlay('winOverlay'); return; }   // shouldn't happen — a win needs ≥1 move

  setNavLocked(true);
  $('hudMoves').textContent = 0;
  track('move_replay', { mode: mode.type, level: trackLevelId(), moves: frames.length });
  setTimeout(() => { if(token === replayToken) document.addEventListener('pointerdown', onReplaySkip); }, 80);

  // Sped up relative to the optimal-solution replay's fixed 480ms/step, and
  // scaled down further for long solves (Gridlock levels run up to 60
  // moves) so watching your own clear back never takes longer than ~5s.
  const stepMs = Math.max(90, Math.min(260, 4800 / frames.length));

  let step = 0;
  const tick = () => {
    if(token !== replayToken) return;
    const decoupledBefore = decoupledHitches.size;
    const frame = frames[step++];
    pieces.forEach((p, i) => { p.r = frame.pieces[i].r; p.c = frame.pieces[i].c; });
    decoupledHitches = new Set(frame.decoupled);
    sfx(decoupledHitches.size > decoupledBefore ? 'decouple' : 'snap');
    renderPositions(true);
    updateGates();
    $('hudMoves').textContent = step;
    if(step >= frames.length){
      const heroEl = board.querySelector('.piece[data-idx="0"]');
      heroEl.style.transition = 'transform .9s cubic-bezier(.5,0,.9,.4)';
      heroEl.style.transform = `translate(${(N + 2.6) * CELL}px, ${pieces[0].r * CELL}px)`;
      sfx('win');
      setTimeout(() => { if(token === replayToken) stopReplay(true); }, 950);
      return;
    }
    setTimeout(tick, stepMs);
  };
  setTimeout(tick, 500);
}

/* ================== WIN ================== */
let autoTimer = null;
function winSequence(){
  solvedAnim = true;
  clearHint(); clearHand();
  clearPursuitTimer();
  // Relaxed's music is a continuous session-long playlist (see
  // attemptContinuous in js/audio.js), not tied to any one level — a win
  // must let it keep playing straight into whatever's next, same as it
  // already does through Retry/Reset. Heist/Pursuit still stop clean: the
  // tension music belongs to that one attempt.
  if(save.settings.mode !== 'relaxed') stopAttemptTrack();
  updateHud();
  sfx('win');
  haptic('success');
  const hero = board.querySelector('.piece[data-idx="0"]');
  hero.style.transition = 'transform .9s cubic-bezier(.5,0,.9,.4)';
  hero.style.transform = `translate(${(N + 2.6) * CELL}px, ${pieces[0].r * CELL}px)`;
  gate.style.filter = 'brightness(1.6)';
  burst();

  const par = parOf();
  const stars = starCountFor(par, moves);
  const timeS = Math.round((Date.now() - levelStart) / 1000);

  isCleanGetaway = false;
  if(save.settings.mode === 'heist'){
    isCleanGetaway = moves <= par;
    if(isCleanGetaway) track('alarm_clean_getaway', { level: trackLevelId(), moves, par, date: mode.date });
  }

  if(mode.type === 'campaign'){
    save.stars[cur] = Math.max(save.stars[cur] || 0, stars);
    save.best[cur] = Math.min(save.best[cur] || Infinity, moves);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, cur + 2));
    save.streak3 = stars === 3 ? save.streak3 + 1 : 0;
    // Cars are earned by driving the job's actual mark under real
    // pressure (Heist/Pursuit) — Relaxed reuses whatever's equipped (see
    // heroCarIdForAttempt) and clearing a level there doesn't count
    // towards unlocking it. save.jobClears is what jobUnlockCheck in
    // js/collection.js reads, separate from save.stars (which still just
    // tracks puzzle-completion/progression for every pacing, Relaxed
    // included).
    if(save.settings.mode !== 'relaxed') save.jobClears[cur] = true;
    persist();
    track('level_win', { level: cur + 1, moves, par, stars, time_s: timeS, undos, hints: hintsUsed });
  } else if(mode.type === 'daily'){
    const res = recordDailyWin(mode.date, moves, par, stars);
    if(res.usedFreeze) toast(t('toast.freeze'));
    track('daily_win', { date: mode.date, number: mode.number, moves, par, stars, time_s: timeS, streak: daily().streak });
    if(save.settings.reminder) setStreakReminder(true, daily().streak);
  } else if(mode.type === 'bounty'){
    isBountyMet = bountyConditionMet(mode.condition, { moves, par, hintsUsed });
    const prev = save.bounties.done[mode.date];
    save.bounties.done[mode.date] = {
      moves: prev ? Math.min(prev.moves, moves) : moves,
      par, tier: mode.tier, condition: mode.condition,
      met: (prev?.met || false) || isBountyMet,   // once earned, always earned — retries can't un-clear it
    };
    persist();
    track('bounty_complete', { date: mode.date, number: mode.number, moves, par, tier: mode.tier, condition: mode.condition, met: isBountyMet });
  } else if(mode.type === 'impound'){
    const key = curLevel.key;
    save.impound.stars[key] = Math.max(save.impound.stars[key] || 0, stars);
    save.impound.best[key] = Math.min(save.impound.best[key] || Infinity, moves);
    persist();
    track('impound_win', { index: curImpound, moves, par, stars, time_s: timeS });
  }
  // sandbox playtests record nothing — no stars, no streaks, no daily state

  const reveals = pendingReveals(save, daily());
  if(reveals.length){
    carRevealQueue.push(...reveals);
    reveals.forEach(c => track('car_unlock', { car: c.id, tier: c.tier }));
  }

  setTimeout(() => {
    showWinSheet(stars);
    gate.style.filter = '';
  }, 780);
}

function showWinSheet(stars){
  const par = parOf();
  $('winFlag').textContent = t('win.flag');
  $('winTitle').textContent = mode.type === 'daily'
    ? t('win.daily', { n: mode.number })
    : mode.type === 'bounty'
    ? t('win.bounty')
    : mode.type === 'impound'
    ? t('win.impound', { n: curImpound + 1 })
    : mode.type === 'sandbox'
    ? 'Sandbox level cleared'
    : t('win.title', { n: cur + 1 });
  $('winMoves').textContent = moves;
  $('winPar').textContent = par;
  // A job's briefing is the car and the nightly condition, never a level
  // number or a par baseline (see the bounty sheet) — the win sheet stays
  // consistent with that.
  $('winParRow').hidden = mode.type === 'bounty';
  $('winBest').textContent = mode.type === 'daily'
    ? (daily().done[mode.date]?.moves ?? moves)
    : mode.type === 'bounty'
    ? (save.bounties.done[mode.date]?.moves ?? moves)
    : mode.type === 'impound'
    ? (save.impound.best[curLevel.key] ?? moves)
    : mode.type === 'sandbox' ? moves
    : save.best[cur];
  $('cleanGetaway').hidden = !isCleanGetaway;
  if(isCleanGetaway) $('cleanGetaway').textContent = t('win.clean');
  $('watchSolBtn').hidden = mode.type === 'sandbox';
  $('bountyResult').hidden = mode.type !== 'bounty';
  if(mode.type === 'bounty'){
    $('bountyResult').textContent = t(isBountyMet ? 'bounty.result.met' : 'bounty.result.notmet');
    $('bountyResult').className = 'bounty-result ' + (isBountyMet ? 'met' : 'notmet');
  }
  const ws = $('winStars');
  ws.innerHTML = '';
  for(let i = 0; i < 3; i++){
    const sp = document.createElement('span');
    sp.textContent = '★';
    if(i >= stars) sp.className = 'off';
    ws.appendChild(sp);
    if(i < stars) setTimeout(() => sfx('star'), 500 + i * 160);
  }

  const isDaily = mode.type === 'daily';
  $('peek').hidden = true;
  $('sharePre').hidden = true;
  $('autobar').classList.remove('run');

  if(mode.type === 'sandbox'){
    // Playtest loop: straight back to the editor, no peek/share/auto-advance.
    $('nextLabel').textContent = 'Back to editor';
    $('nextBtn').dataset.action = 'sandbox';
    showOverlay('winOverlay');
    return;
  }
  if(mode.type === 'bounty'){
    // No natural "next" until tomorrow's mark — a dead end like sandbox,
    // no peek/share/auto-advance.
    $('nextLabel').textContent = t('btn.done');
    $('nextBtn').dataset.action = 'bounty';
    showOverlay('winOverlay');
    return;
  }
  if(mode.type === 'impound'){
    // Unlike bounty, the Impound Lot IS an ordered list — mirrors the
    // campaign's own peek/next/auto-advance flow, just off IMPOUND_LOT.
    const next = nextImpoundIndex();
    if(next !== -1){
      renderPeek(IMPOUND_LOT[next]);
      $('peek').hidden = false;
      $('peekLab').textContent = t('win.next');
      $('nextLabel').textContent = t('btn.next');
    } else {
      $('nextLabel').textContent = t('btn.levels');
    }
    $('nextBtn').dataset.action = 'impound';
    if(save.settings.autoAdvance && next !== -1 && !carRevealQueue.length && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      $('autobar').style.setProperty('--automs', '2600ms');
      requestAnimationFrame(() => $('autobar').classList.add('run'));
      autoTimer = setTimeout(() => { hideOverlay('winOverlay'); advanceImpound(); }, 2600);
    }
    showOverlay('winOverlay');
    return;
  }
  if(isDaily){
    const text = dailyShareText({ number: mode.number, moves, par, streak: daily().streak, level: curLevel });
    const pre = $('sharePre');
    pre.textContent = text;
    pre.hidden = false;
    $('nextLabel').textContent = t('btn.share');
    $('nextBtn').dataset.action = 'share';
    $('nextBtn').dataset.share = text;
  } else {
    const next = nextPlayableIndex();
    if(next !== -1){
      renderPeek(LEVELS[next]);
      $('peek').hidden = false;
      $('peekLab').textContent = t('win.next');
      $('nextLabel').textContent = t('btn.next');
    } else {
      $('nextLabel').textContent = t('btn.levels');
    }
    $('nextBtn').dataset.action = 'next';
    // zero-tap flow (plan 0.7): auto-advance unless the player opts out —
    // but never auto-skip past a new car reveal
    if(save.settings.autoAdvance && next !== -1 && !carRevealQueue.length && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      $('autobar').style.setProperty('--automs', '2600ms');
      requestAnimationFrame(() => $('autobar').classList.add('run'));
      autoTimer = setTimeout(() => { hideOverlay('winOverlay'); advance(); }, 2600);
    }
  }
  showOverlay('winOverlay');
}

function cancelAuto(){
  if(autoTimer){ clearTimeout(autoTimer); autoTimer = null; }
  $('autobar').classList.remove('run');
}

/* Car reveals (H0): a new car earned on this win takes priority over
   whatever the player tapped (replay/next) — shown once, then the
   original action runs. Queue supports earning more than one car on a
   single win (e.g. a chapter finish that also completes a streak). */
function proceedOrReveal(action){
  if(carRevealQueue.length){
    afterRevealAction = action;
    hideOverlay('winOverlay');
    showNextCarReveal();
  } else {
    action();
  }
}
function showNextCarReveal(){
  const car = carRevealQueue[0];
  if(!car){ hideOverlay('carRevealOverlay'); const fn = afterRevealAction; afterRevealAction = null; if(fn) fn(); return; }
  $('carRevealName').textContent = car.name;
  $('carRevealTier').textContent = t('tier.' + car.tier);
  $('carRevealTier').className = 'car-tier tier-' + car.tier;
  const holder = $('carRevealArt');
  holder.innerHTML = vehicleSVG(0, 2, 'h', true, { skin: car.skin, headlights: false });
  sfx('fanfare');
  haptic('success');
  showOverlay('carRevealOverlay');
}
function dismissCarReveal(){
  const car = carRevealQueue.shift();
  if(car){
    save.carsSeen = [...new Set([...(save.carsSeen || []), car.id])];
    persist();
  }
  if(carRevealQueue.length){ showNextCarReveal(); }
  else { hideOverlay('carRevealOverlay'); const fn = afterRevealAction; afterRevealAction = null; if(fn) fn(); }
}

/* ================== GARAGE (collection screen) ================== */
/* Job cars (campaign) and bounty marks aren't equip choices during their
   own job — the mark decides its own car (see heroCarIdForAttempt). Tapping
   a tile still sets save.equippedCar (it's what Relaxed/Daily/Impound/
   Sandbox will use next), but while a job is actually on screen the tap
   can't change what's currently rendered — the toast below says so instead
   of the tile silently appearing to do nothing. */
function lockedHintFor(car){
  if(car.bountyTier) return t('car.locked.' + car.id);
  return t('car.locked.job', { chapter: car.chapter + 1, name: CHAPTERS[car.chapter].name });
}

function buildGarageList(){
  const owned = ownedCarIds(save, daily());
  const holder = $('garageList');
  holder.innerHTML = '';

  const groupHeader = text => {
    const h = document.createElement('div');
    h.className = 'car-group-h';
    h.textContent = text;
    return h;
  };

  const tile = (id, name, tier, skin, isOwned, hint, limited) => {
    const b = document.createElement('button');
    b.className = 'car-tile' + (isOwned ? ' owned' : ' locked') + (save.equippedCar === id ? ' equipped' : '') + (limited ? ' limited' : '');
    const art = document.createElement('div');
    art.className = 'car-tile-art';
    if(isOwned) art.innerHTML = vehicleSVG(0, 2, 'h', true, { skin, headlights: false });
    else art.innerHTML = '<span class="car-lock">🔒</span>';
    b.appendChild(art);
    const label = document.createElement('div');
    label.className = 'car-tile-label';
    label.innerHTML = isOwned
      ? `<span class="car-tile-name">${name}</span><span class="car-tier tier-${tier}">${t('tier.' + tier)}</span>`
      : `<span class="car-tile-name locked-name">${hint}</span>`;
    b.appendChild(label);
    if(isOwned){
      b.addEventListener('click', () => {
        sfx('ui');
        save.equippedCar = id;
        persist();
        if(mode.type === 'campaign' || mode.type === 'bounty'){
          toast(t('garage.equip.job'));
        } else {
          buildPieces();
        }
        buildGarageList();
      });
    }
    return b;
  };

  holder.appendChild(tile(DEFAULT_CAR, t('car.classic'), 'common', null, true, ''));
  CHAPTERS.forEach((ch, i) => {
    holder.appendChild(groupHeader(ch.name));
    CARS.filter(c => c.chapter === i).forEach(car => {
      holder.appendChild(tile(car.id, car.name, car.tier, car.skin, owned.has(car.id), lockedHintFor(car)));
    });
  });
  holder.appendChild(groupHeader(t('garage.marks')));
  CARS.filter(c => c.bountyTier).forEach(car => {
    holder.appendChild(tile(car.id, car.name, car.tier, car.skin, owned.has(car.id), lockedHintFor(car), true));
  });
}

function nextPlayableIndex(){
  const next = cur + 1;
  if(next >= LEVELS.length) return -1;
  if(next >= FREE_LEVELS && !save.pro) return -1;
  return next;
}

function advance(){
  cancelAuto();
  const next = nextPlayableIndex();
  if(next !== -1){ loadLevel(next); return; }
  if(cur + 1 >= FREE_LEVELS && !save.pro && cur + 1 < LEVELS.length){
    // paywall sits at the end of chapter 2 (plan 1.3; final position tuned in v1.1)
    showOverlay('proOverlay');
    track('iap_view', { source: 'chapter_gate' });
    return;
  }
  buildLevelList(); showOverlay('levelsOverlay');
}

function nextImpoundIndex(){
  const next = curImpound + 1;
  return next < IMPOUND_LOT.length ? next : -1;
}

function advanceImpound(){
  cancelAuto();
  const next = nextImpoundIndex();
  if(next !== -1){ loadImpoundLevel(next); return; }
  tabChapter = IMPOUND_TAB;
  buildLevelList(); showOverlay('levelsOverlay');
}

function renderPeek(lv, holder = $('peekBoard')){
  holder.innerHTML = '';
  const u = 96 / 6;
  (lv.w ?? []).forEach(([r, c]) => {
    const d = document.createElement('i');
    d.className = 'rw';
    d.style.left = (c * u + 1.5) + 'px';
    d.style.top = (r * u + 1.5) + 'px';
    d.style.width = (u - 3) + 'px';
    d.style.height = (u - 3) + 'px';
    holder.appendChild(d);
  });
  lv.p.forEach((a, i) => {
    const [r, c, len, dir] = a;
    const d = document.createElement('i');
    d.style.left = (c * u + 1.5) + 'px';
    d.style.top = (r * u + 1.5) + 'px';
    d.style.width = ((dir === 'h' ? len : 1) * u - 3) + 'px';
    d.style.height = ((dir === 'v' ? len : 1) * u - 3) + 'px';
    d.style.background = i === 0 ? PALETTE[0][0] : PALETTE[1 + (i - 1) % (PALETTE.length - 1)][0];
    holder.appendChild(d);
  });
}

/* ================== PARTICLES ================== */
const fx = $('fx');
const fxc = fx.getContext('2d');
let parts = [], fxRun = false;
function resizeFx(){ fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio; }
function pump(){
  if(!fxRun){ fxRun = true; requestAnimationFrame(tickFx); }
}
function burst(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  resizeFx();
  const rect = board.getBoundingClientRect();
  const x = (rect.right + 4) * devicePixelRatio;
  const y = (rect.top + (EXIT_ROW + 0.5) * CELL) * devicePixelRatio;
  const cols = ['#ffb454', '#ff3b4e', '#ffe9c2', '#5ee6a8', '#5b8dff'];
  for(let i = 0; i < 90; i++){
    const a = (Math.random() - 0.5) * 1.9;
    const sp = (3 + Math.random() * 9) * devicePixelRatio;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2 * devicePixelRatio,
      g: 0.25 * devicePixelRatio, life: 60 + Math.random() * 40,
      c: cols[i % cols.length], s: (2 + Math.random() * 3.5) * devicePixelRatio, rot: Math.random() * 6, vr: (Math.random() - .5) * .3 });
  }
  pump();
}
/* Dust puff on collision stop (plan 0.5) — same system, small gray emission. */
function dustAt(i, atHi){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  resizeFx();
  const p = pieces[i];
  const rect = board.getBoundingClientRect();
  let cx, cy;
  if(p.dir === 'h'){
    cx = rect.left + (atHi ? (p.c + p.len) : p.c) * CELL;
    cy = rect.top + (p.r + 0.5) * CELL;
  } else {
    cx = rect.left + (p.c + 0.5) * CELL;
    cy = rect.top + (atHi ? (p.r + p.len) : p.r) * CELL;
  }
  const cols = ['#8a93a6', '#5d6675', '#b9c1d0'];
  for(let k = 0; k < 10; k++){
    const a = Math.random() * Math.PI * 2;
    const sp = (0.6 + Math.random() * 2.2) * devicePixelRatio;
    parts.push({ x: cx * devicePixelRatio, y: cy * devicePixelRatio,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6 * devicePixelRatio,
      g: 0.04 * devicePixelRatio, life: 22 + Math.random() * 16,
      c: cols[k % cols.length], s: (1.5 + Math.random() * 2.5) * devicePixelRatio, rot: Math.random() * 6, vr: (Math.random() - .5) * .2 });
  }
  pump();
}
function tickFx(){
  fxc.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter(p => p.life > 0);
  for(const p of parts){
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life--; p.rot += p.vr;
    fxc.save();
    fxc.globalAlpha = Math.min(1, p.life / 40);
    fxc.translate(p.x, p.y); fxc.rotate(p.rot);
    fxc.fillStyle = p.c;
    fxc.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
    fxc.restore();
  }
  if(parts.length){ requestAnimationFrame(tickFx); } else { fxRun = false; fxc.clearRect(0, 0, fx.width, fx.height); }
}

/* ================== OVERLAYS / TOAST ================== */
function showOverlay(id){ $(id).classList.add('show'); }
function hideOverlay(id){ $(id).classList.remove('show'); }
let toastT = null;
function toast(msg){
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ================== LEVEL SELECT ================== */
let tabChapter = 0;
const ROMAN = ['I', 'II', 'III', 'IV'];
const IMPOUND_TAB = 'impound';   // sentinel tabChapter value — not a real chapter index

function buildChapterTabs(){
  const holder = $('chapterTabs');
  holder.innerHTML = '';
  CHAPTERS.forEach((ch, i) => {
    const b = document.createElement('button');
    const locked = i >= 2 && !save.pro;
    b.className = 'tab' + (i === tabChapter ? ' cur' : '') + (locked ? ' locked' : '');
    b.style.setProperty('--tabaccent', ch.accent);
    b.innerHTML = `<span class="roman">${ROMAN[i]}</span><span>${ch.name}</span>` +
      (locked ? `<span class="lock">🔒 ${t('chapter.locked')}</span>` : '');
    b.addEventListener('click', () => { sfx('ui'); tabChapter = i; buildLevelList(); });
    holder.appendChild(b);
  });
  const ib = document.createElement('button');
  const iLocked = !impoundUnlocked();
  ib.className = 'tab impound-tab' + (tabChapter === IMPOUND_TAB ? ' cur' : '') + (iLocked ? ' locked' : '');
  ib.style.setProperty('--tabaccent', IMPOUND_ACCENT);
  ib.innerHTML = `<span class="roman">★</span><span>${t('impound.title')}</span>` +
    (iLocked ? `<span class="lock">🔒</span>` : '');
  ib.addEventListener('click', () => {
    sfx('ui');
    if(iLocked){
      if(!save.pro){
        toast(t('toast.locked'));
        showOverlay('proOverlay');
        track('iap_view', { source: 'impound_tab' });
      } else {
        toast(t('impound.locked.incomplete'));
      }
      return;
    }
    tabChapter = IMPOUND_TAB;
    buildLevelList();
  });
  holder.appendChild(ib);
}

function buildLevelList(){
  buildChapterTabs();
  const holder = $('levelList');
  holder.innerHTML = '';

  if(tabChapter === IMPOUND_TAB){
    $('levelsTitle').textContent = t('impound.title');
    $('levelsSub').textContent = t('impound.sub');
    const g = document.createElement('div');
    g.className = 'lvl-grid';
    IMPOUND_LOT.forEach((lv, i) => {
      const b = document.createElement('button');
      const st = save.impound.stars[lv.key] || 0;
      b.className = 'lvl' + (i === curImpound && mode.type === 'impound' ? ' cur' : '') + (st > 0 ? ' done' : '');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="s">${starStr(st)}</span>`;
      b.addEventListener('click', () => {
        sfx('ui'); stopSettingsMusic(); hideOverlay('levelsOverlay'); loadImpoundLevel(i);
      });
      b.setAttribute('aria-label', `Impound job ${i + 1}`);
      g.appendChild(b);
    });
    holder.appendChild(g);
    return;
  }

  $('levelsTitle').textContent = t('levels.title');
  $('levelsSub').textContent = t('levels.sub');
  const chLocked = tabChapter >= 2 && !save.pro;
  const g = document.createElement('div');
  g.className = 'lvl-grid';
  const from = tabChapter * CHAPTER_SIZE, to = from + CHAPTER_SIZE;
  for(let i = from; i < to; i++){
    const b = document.createElement('button');
    const locked = chLocked || i + 1 > save.unlocked;
    const st = save.stars[i] || 0;
    b.className = 'lvl' + (locked ? ' locked' : '') + (i === cur && mode.type === 'campaign' ? ' cur' : '') + (st > 0 ? ' done' : '');
    b.innerHTML = locked
      ? `<span class="n">🔒</span>`
      : `<span class="n">${i + 1}</span><span class="s">${starStr(st)}</span>`;
    if(!locked){
      b.addEventListener('click', () => {
        sfx('ui'); stopSettingsMusic(); hideOverlay('levelsOverlay'); loadLevel(i);
      });
    } else if(chLocked){
      b.addEventListener('click', () => {
        toast(t('toast.locked'));
        showOverlay('proOverlay');
        track('iap_view', { source: 'level_grid' });
      });
    }
    b.setAttribute('aria-label', `Level ${i + 1}` + (locked ? ' locked' : ''));
    g.appendChild(b);
  }
  holder.appendChild(g);
  if(chLocked){
    const teaser = document.createElement('div');
    teaser.className = 'pro-teaser';
    teaser.innerHTML = `<b>${t('pro.title')}</b> — ${t('pro.f1')}`;
    holder.appendChild(teaser);
  }
}

/* ================== DAILY SHEET + CALENDAR ================== */
let calYear, calMonth;   // displayed month

function openDaily(){
  const d = new Date();
  calYear = d.getFullYear(); calMonth = d.getMonth();
  renderDailySheet();
  showOverlay('dailyOverlay');
}

function renderDailySheet(){
  $('dailyStreak').textContent = daily().streak;
  $('dailyFreezes').textContent = daily().freezes;
  const today = todayStr();
  const done = isDone(today);
  $('dailyPlayLabel').textContent = done
    ? t('daily.done', { n: daily().done[today].moves }) + ' ✓'
    : t('daily.today');
  renderCalendar();
}

function renderCalendar(){
  const grid = $('calGrid');
  grid.innerHTML = '';
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString(document.documentElement.lang, { month: 'long', year: 'numeric' });
  $('calMonth').textContent = monthName;
  const dows = [0, 1, 2, 3, 4, 5, 6].map(d =>
    new Date(2026, 1, 1 + d).toLocaleDateString(document.documentElement.lang, { weekday: 'narrow' }));
  dows.forEach(w => {
    const el = document.createElement('div');
    el.className = 'cal-dow'; el.textContent = w;
    grid.appendChild(el);
  });
  const first = new Date(calYear, calMonth, 1);
  const startDow = first.getDay();
  const daysIn = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayStr();
  for(let i = 0; i < startDow; i++){
    const pad = document.createElement('div');
    pad.className = 'cal-day out';
    grid.appendChild(pad);
  }
  for(let day = 1; day <= daysIn; day++){
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const el = document.createElement('button');
    el.className = 'cal-day';
    el.textContent = day;
    if(ds > today) el.classList.add('future');
    else if(ds < DAILY_EPOCH) el.classList.add('pre');
    if(isDone(ds)) el.classList.add('done');
    if(ds === today) el.classList.add('today');
    if(isPlayable(ds)){
      el.addEventListener('click', () => {
        sfx('ui');
        hideOverlay('dailyOverlay');
        loadDailyLevel(ds);
      });
    }
    grid.appendChild(el);
  }
}

/* ================== BOUNTY (H4 "Tonight's Mark") ================== */
function openBounty(){
  renderBountySheet();
  showOverlay('bountyOverlay');
}

function renderBountySheet(){
  const today = todayStr();
  const lv = bountyFor(today);
  if(!lv){ return; }   // before BOUNTY_EPOCH — shouldn't happen once shipped
  const done = save.bounties.done[today];
  const car = carById(carIdForBountyTier(lv.tier));

  $('bountyTierChip').textContent = t('tier.' + lv.tier);
  $('bountyTierChip').className = 'car-tier tier-' + lv.tier;
  $('bountyPacingChip').textContent = t('mode.' + car.pacing);
  $('bountyCond').textContent = t('bounty.cond.' + lv.condition);
  $('bountyNarrative').textContent = car.narrative;
  renderPeek(lv, $('bountyBoard'));

  if(done){
    $('bountyStatus').hidden = false;
    $('bountyStatus').textContent = t('bounty.done', { n: done.moves })
      + (done.met ? ' — ' + t('bounty.metyes') : ' — ' + t('bounty.metno'));
  } else {
    $('bountyStatus').hidden = true;
  }
  $('bountyPlayLabel').textContent = done ? t('bounty.replay') : t('bounty.play');
}

/* ================== SETTINGS ================== */
function applySettings(){
  const s = save.settings;
  setSfxVolume(s.sfx);
  setMusicVolume(s.music);
  setGameMode(s.mode);
  setHapticsEnabled(s.haptics);
  $('sfxRange').value = s.sfx;
  $('musicRange').value = s.music;
  $('hapticsChk').checked = s.haptics;
  $('colorblindChk').checked = s.colorblind;
  $('autoAdvanceChk').checked = s.autoAdvance;
  $('reminderChk').checked = s.reminder;
  updateModeSelectUI();
}

function updateModeSelectUI(){
  const m = save.settings.mode;
  document.querySelectorAll('#modeSelect .mode-btn').forEach(b => b.classList.toggle('cur', b.dataset.mode === m));
  document.querySelectorAll('#introModeCards .mode-card').forEach(b => b.classList.toggle('cur', b.dataset.mode === m));
  $('modeDesc').textContent = t('mode.desc.' + m);
}

function wireSettings(){
  $('sfxRange').addEventListener('input', e => { save.settings.sfx = +e.target.value; setSfxVolume(save.settings.sfx); sfx('ui'); persist(); });
  $('musicRange').addEventListener('input', e => { save.settings.music = +e.target.value; setMusicVolume(save.settings.music); persist(); });
  $('hapticsChk').addEventListener('change', e => { save.settings.haptics = e.target.checked; setHapticsEnabled(e.target.checked); haptic('ui'); persist(); });
  $('colorblindChk').addEventListener('change', e => { save.settings.colorblind = e.target.checked; persist(); buildPieces(); });
  document.querySelectorAll('#modeSelect .mode-btn').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if(save.settings.mode === m) return;
    sfx('ui');
    save.settings.mode = m;
    setGameMode(m);
    updateModeSelectUI();
    persist();
    // A mode switch never continues the level/day you were just on —
    // each mode keeps its own campaign position; Daily just restarts
    // fresh under the new mode's rules (there's only one board per day).
    if(mode.type === 'daily'){
      loadDailyLevel(mode.date);
    } else {
      loadLevel(Math.max(0, Math.min(save.modeLevel[m] ?? 0, campaignUpperBound())));
    }
  }));
  $('autoAdvanceChk').addEventListener('change', e => { save.settings.autoAdvance = e.target.checked; persist(); });
  $('reminderChk').addEventListener('change', e => {
    save.settings.reminder = e.target.checked; persist();
    setStreakReminder(e.target.checked, daily().streak);
  });
  const restore = () => { toast(save.pro ? t('toast.pro') : t('btn.restore') + ' …'); };
  $('restoreBtn').addEventListener('click', restore);
  $('restoreBtn2').addEventListener('click', restore);
}

/* ================== PRO GARAGE (plan 1.3) ================== */
function wirePro(){
  $('buyBtn').addEventListener('click', () => {
    /* StoreKit hook point: in the native shell this calls the purchase
       plugin; the web build sandbox-unlocks so the full flow is testable. */
    save.pro = true;
    persist();
    track('iap_purchase', { product: 'pro_garage' });
    toast(t('toast.pro'));
    hideOverlay('proOverlay');
    updateHud();
  });
}

/* ================== STATIC STRINGS ================== */
function applyStrings(){
  $('brandSub').textContent = t('sub');
  $('labLevel').textContent = t('hud.level');
  $('labMoves').textContent = t('hud.moves');
  $('labPar').textContent = t('hud.par');
  $('labAlarmBudget').textContent = t('hud.alarm');
  $('labPursuitTime').textContent = t('hud.pursuit');
  $('labUndo').textContent = t('btn.undo');
  $('labHint').textContent = t('btn.hint');
  $('labReset').textContent = t('btn.reset');
  $('skipBtn').textContent = t('btn.skip');
  $('levelsTitle').textContent = t('levels.title');
  $('levelsSub').textContent = t('levels.sub');
  $('labWinMoves').textContent = t('win.moves');
  $('labWinPar').textContent = t('win.par');
  $('labWinBest').textContent = t('win.best');
  $('tryAgainBtn').textContent = t('btn.tryagain');
  $('moveReplayBtn').textContent = t('btn.replay');
  $('watchSolBtn').textContent = t('win.watch');
  $('dailyTitle').textContent = t('daily.title');
  $('dailySub').textContent = t('daily.sub');
  $('labStreak').textContent = t('daily.streak');
  $('labFreezes').textContent = t('daily.freezes');
  $('dailyNote').textContent = t('daily.backfill');
  $('bountyTitle').textContent = t('bounty.title');
  $('bountySub').textContent = t('bounty.sub');
  $('settingsTitle').textContent = t('settings.title');
  $('labSfx').textContent = t('settings.sfx');
  $('labMusic').textContent = t('settings.music');
  $('labHaptics').textContent = t('settings.haptics');
  $('labColorblind').textContent = t('settings.colorblind');
  $('labMode').textContent = t('mode.label');
  $('modeRelaxedName').textContent = t('mode.relaxed');
  $('modeHeistName').textContent = t('mode.heist');
  $('modePursuitName').textContent = t('mode.pursuit');
  updateModeSelectUI();
  $('labAutoAdvance').textContent = t('settings.autoadvance');
  $('labReminder').textContent = t('settings.reminder');
  $('labTheme').textContent = t('theme.label');
  updateThemeButtonUI();
  $('labRestore').textContent = t('btn.restore');
  $('proTitle').textContent = t('pro.title');
  $('proPitch').textContent = t('pro.pitch');
  $('proF1').textContent = t('pro.f1');
  $('proF2').textContent = t('pro.f2');
  $('proF3').textContent = t('pro.f3');
  $('proNone').textContent = t('pro.none');
  $('restoreBtn2').textContent = t('btn.restore');
  $('garageTitle').textContent = t('garage.title');
  $('garageSub').textContent = t('garage.sub');
  $('carRevealFlag').textContent = t('garage.newcar');
  $('carRevealBtn').textContent = t('btn.nice');
  $('bustedRetryBtn').textContent = t('btn.retry');
  $('bustedNoAlarmBtn').textContent = t('btn.relaxed');
  $('startPlayLabel').textContent = t('start.play');
  $('introTitle').textContent = t('intro.title');
  $('introP1').textContent = t('start.p1');
  $('introP2').textContent = t('start.p2');
  $('introModesTitle').textContent = t('intro.modes');
  $('introModeRelaxedName').textContent = t('mode.relaxed');
  $('introModeRelaxedDesc').textContent = t('mode.desc.relaxed');
  $('introModeHeistName').textContent = t('mode.heist');
  $('introModeHeistDesc').textContent = t('mode.desc.heist');
  $('introModePursuitName').textContent = t('mode.pursuit');
  $('introModePursuitDesc').textContent = t('mode.desc.pursuit');
  $('introPlayLabel').textContent = t('intro.play');
}

function updateThemeButtonUI(){
  const isPlaying = isThemePlaying();
  $('themePlayIcon').hidden = isPlaying;
  $('themePauseIcon').hidden = !isPlaying;
  $('themePlayBtn').setAttribute('aria-label', t(isPlaying ? 'theme.pause' : 'theme.play'));
}

/* ================== GLOBAL WIRING ================== */
function wire(){
  setThemeStateListener(updateThemeButtonUI);
  $('levelsBtn').addEventListener('click', () => {
    sfx('ui'); playSettingsMusic();
    tabChapter = mode.type === 'impound' ? IMPOUND_TAB : chapterOf(cur);
    buildLevelList(); showOverlay('levelsOverlay');
  });
  $('dailyBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); openDaily(); });
  $('bountyBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); openBounty(); });
  $('settingsBtn').addEventListener('click', () => {
    sfx('ui'); playSettingsMusic(); showOverlay('settingsOverlay');
    updateThemeButtonUI();   // re-sync in case the theme ended/kept playing while Settings was closed
  });
  $('themePlayBtn').addEventListener('click', () => { sfx('ui'); toggleThemePlayer(); });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => {
    e.target.closest('.overlay').classList.remove('show'); sfx('ui');
    if(['settingsOverlay', 'dailyOverlay', 'bountyOverlay', 'garageOverlay', 'levelsOverlay'].includes(e.target.closest('.overlay').id)) stopSettingsMusic();
  }));
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => {
    if(e.target === o && !['winOverlay', 'carRevealOverlay', 'bustedOverlay', 'startOverlay', 'introOverlay'].includes(o.id)){
      o.classList.remove('show');
      if(['settingsOverlay', 'dailyOverlay', 'bountyOverlay', 'garageOverlay', 'levelsOverlay'].includes(o.id)) stopSettingsMusic();
    }
  }));
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', () => { sfx('ui'); startBoard(); toast(t('toast.reset')); });
  $('bustedRetryBtn').addEventListener('click', () => { sfx('ui'); hideOverlay('bustedOverlay'); startBoard(); setTimeout(() => $('board').focus(), 100); });
  $('bustedNoAlarmBtn').addEventListener('click', () => {
    // Deliberate exception to "modes don't share a level": this is a
    // retry-easier escape hatch right after a bust, so it stays on the
    // same level rather than jumping to Relaxed's own tracked position.
    sfx('ui');
    save.settings.mode = 'relaxed';
    setGameMode('relaxed');
    updateModeSelectUI();
    if(mode.type === 'campaign') save.modeLevel.relaxed = cur;
    persist();
    hideOverlay('bustedOverlay');
    startBoard();
    setTimeout(() => $('board').focus(), 100);
  });
  $('pursuitPauseBtn').addEventListener('click', togglePursuitPause);
  $('boardResumeBtn').addEventListener('click', togglePursuitPause);
  $('hintBtn').addEventListener('click', showHint);
  $('skipBtn').addEventListener('click', skipLevel);
  $('tryAgainBtn').addEventListener('click', () => {
    cancelAuto(); sfx('ui');
    proceedOrReveal(() => { hideOverlay('winOverlay'); startBoard(); });
  });
  $('moveReplayBtn').addEventListener('click', () => { sfx('ui'); playMoveReplay(); });
  $('watchSolBtn').addEventListener('click', () => { sfx('ui'); playSolutionReplay(); });
  $('winCloseBtn').addEventListener('click', () => { sfx('ui'); cancelAuto(); hideOverlay('winOverlay'); });
  $('nextBtn').addEventListener('click', async () => {
    if($('nextBtn').dataset.action === 'share'){
      const res = await shareText($('nextBtn').dataset.share);
      track('share_daily', { result: res, date: mode.date });
      if(res === 'copied') toast(t('toast.copied'));
      return;
    }
    if($('nextBtn').dataset.action === 'sandbox'){
      cancelAuto(); sfx('ui');
      hideOverlay('winOverlay');
      openSandbox();
      return;
    }
    if($('nextBtn').dataset.action === 'bounty'){
      cancelAuto(); sfx('ui');
      proceedOrReveal(() => hideOverlay('winOverlay'));
      return;
    }
    if($('nextBtn').dataset.action === 'impound'){
      cancelAuto(); sfx('ui');
      proceedOrReveal(() => { hideOverlay('winOverlay'); advanceImpound(); });
      return;
    }
    cancelAuto(); sfx('ui');
    proceedOrReveal(() => { hideOverlay('winOverlay'); advance(); });
  });
  $('carRevealBtn').addEventListener('click', () => { sfx('ui'); dismissCarReveal(); });
  $('garageBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); buildGarageList(); showOverlay('garageOverlay'); });
  $('dailyPlayBtn').addEventListener('click', () => {
    sfx('ui'); stopSettingsMusic(); hideOverlay('dailyOverlay'); loadDailyLevel(todayStr());
  });
  $('bountyPlayBtn').addEventListener('click', () => {
    sfx('ui'); stopSettingsMusic(); hideOverlay('bountyOverlay'); loadBountyLevel(todayStr());
  });
  $('calPrev').addEventListener('click', () => { calMonth--; if(calMonth < 0){ calMonth = 11; calYear--; } renderCalendar(); });
  $('calNext').addEventListener('click', () => { calMonth++; if(calMonth > 11){ calMonth = 0; calYear++; } renderCalendar(); });

  document.addEventListener('keydown', e => {
    if(e.key === 'z' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); undo(); }
    if(e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.target.closest('input')){ startBoard(); }
    if(e.key === 'Escape'){
      ['levelsOverlay', 'dailyOverlay', 'bountyOverlay', 'settingsOverlay', 'proOverlay', 'garageOverlay', 'sandboxOverlay'].forEach(hideOverlay);
      stopSettingsMusic();
    }
  });
  window.addEventListener('resize', layout);
  window.addEventListener('pagehide', () => { abandonIfMidLevel(); flush(); });
  board.addEventListener('contextmenu', e => e.preventDefault());
  $('startPlayBtn').addEventListener('click', () => {
    sfx('ui');
    hideOverlay('startOverlay');
    // How to Play + mode picker shows on every launch (by request) — not
    // just the first. Opening theme keeps playing under it either way;
    // see audio.js's crossfadeOutOtherTracks for the handoff once a mode
    // is confirmed.
    showOverlay('introOverlay');
    setTimeout(() => $('introPlayBtn').focus(), 100);
  });
  // Mode cards: picking one is the same act as picking in Settings — it
  // sets the persisted mode, which boot() reads next launch as the
  // pre-selected default here (still changeable every time).
  document.querySelectorAll('#introModeCards .mode-card').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    sfx('ui');
    if(save.settings.mode === m){ updateModeSelectUI(); return; }
    save.settings.mode = m;
    setGameMode(m);
    updateModeSelectUI();
    persist();
  }));
  $('introPlayBtn').addEventListener('click', () => {
    sfx('ui');
    hideOverlay('introOverlay');
    pastIntro = true;
    // Re-init the board under the picked mode — boot loaded it before the
    // choice existed, and startBoard() is what seeds the mode's alarm
    // budget / pursuit clock (this is also the first point Heist's music
    // is allowed to start — see startBoard). Zero moves have been made,
    // so re-initializing here is free.
    startBoard();
    setTimeout(() => $('board').focus(), 100);
  });
}

/* ================== ADMIN MODE + SANDBOX DESIGNER ==================
   Dev-only tooling, hidden behind 5 quick taps on the header title.
   While on: an ADMIN chip in the header reopens the start screen, whose
   admin bar accepts jump commands ("42", "pursuit 30", "daily
   2026-07-01", "sandbox") and opens the sandbox level designer. */

function applyAdminUI(){
  $('adminBar').hidden = !save.admin;
  $('adminChip').hidden = !save.admin;
}

function runAdminCommand(raw){
  const s = raw.trim().toLowerCase();
  if(!s) return;
  if(s === 'sandbox' || s === 'sb'){ openSandbox(); return; }
  if(s.startsWith('daily')){
    const d = s.split(/\s+/)[1];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayStr();
    hideOverlay('startOverlay');
    loadDailyLevel(date);
    toast('Daily ' + date);
    return;
  }
  if(s.startsWith('bounty')){
    const d = s.split(/\s+/)[1];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayStr();
    hideOverlay('startOverlay');
    loadBountyLevel(date);
    toast('Bounty ' + date);
    return;
  }
  if(s.startsWith('impound')){
    const n = s.split(/\s+/)[1];
    const idx = Math.min(IMPOUND_LOT.length - 1, Math.max(0, (Number(n) || 1) - 1));
    hideOverlay('startOverlay');
    loadImpoundLevel(idx);   // admin jump ignores the Pro+finished gate on purpose
    toast(`Impound ${idx + 1}`);
    return;
  }
  const m = s.match(/^(relaxed|heist|pursuit)?\s*#?(\d+)$/);
  if(m){
    if(m[1] && m[1] !== save.settings.mode){
      save.settings.mode = m[1];
      setGameMode(m[1]);
      updateModeSelectUI();
      persist();
    }
    const idx = Math.min(LEVELS.length, Math.max(1, +m[2])) - 1;
    hideOverlay('startOverlay');
    loadLevel(idx);   // admin jump ignores unlock/Pro gating on purpose
    toast(`Level ${idx + 1} · ${save.settings.mode}`);
    return;
  }
  toast('Try: 42 · pursuit 30 · daily 2026-07-01 · bounty · impound 5 · sandbox');
}

function wireAdmin(){
  let taps = 0, tapTimer = null;
  $('brandTitle').addEventListener('pointerdown', () => {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1600);
    if(taps >= 5){
      taps = 0;
      save.admin = !save.admin;
      persist();
      applyAdminUI();
      toast(save.admin ? 'Admin mode ON' : 'Admin mode off');
      if(save.admin) showOverlay('startOverlay');
    }
  });
  $('adminChip').addEventListener('click', () => { sfx('ui'); showOverlay('startOverlay'); });
  $('adminForm').addEventListener('submit', e => {
    e.preventDefault();
    runAdminCommand($('adminInput').value);
    $('adminInput').value = '';
  });
  $('adminSandboxBtn').addEventListener('click', () => { sfx('ui'); openSandbox(); });
}

/* ---------- sandbox level designer ----------
   sb.pieces[0] is always the hero (locked to the exit row, horizontal).
   Levels save to local storage in the same {m,p,w} shape as LEVELS, so a
   saved sandbox level is directly playable by startBoard(). */
const SB_KEY = 'sandbox_levels_v1';
const SB_CELL = 46;                     // must match --sbc in css
let sbTool = 'car', sbDir = 'h';
let sbState = { pieces: [], walls: [] };   // pieces: {r,c,len,dir,hero?,photo?}
let sbSaved = [];

function openSandbox(){
  hideOverlay('startOverlay');
  showOverlay('sandboxOverlay');
  sbRender();
  sbRenderSaved();
  sbRenderPicker();
}

/* Car/truck picker: drag a specific asset from the library straight onto
   the grid, instead of only getting whatever the generic Car/Truck tool's
   round-robin would pick. Shown only while one of those two tools is
   active — Hero/Wall/Erase have nothing to pick from. */
function sbRenderPicker(){
  const holder = $('sbPicker');
  holder.innerHTML = '';
  if(sbTool !== 'car' && sbTool !== 'truck') return;
  const category = sbTool === 'car' ? 'sedans' : 'trucks';
  const len = sbTool === 'car' ? 2 : 3;
  combinedPhotos(category).forEach(entry => {
    const b = document.createElement('div');
    b.className = 'sb-pick';
    b.innerHTML = vehicleSVG(0, len, 'h', false, { photoOverride: entry.img });
    b.addEventListener('pointerdown', e => sbStartPickerDrag(e, entry.img, len));
    holder.appendChild(b);
  });
}

/* Pointer-tracked drag from a picker thumbnail to a board cell — a ghost
   element follows the pointer (position:fixed, viewport coordinates) the
   same way sbAttachBoard's in-board piece drag does, just starting from
   outside the board instead of an existing piece. */
function sbStartPickerDrag(e, img, len){
  e.preventDefault();
  const pickEl = e.currentTarget;
  pickEl.classList.add('dragging');
  const ghost = document.createElement('div');
  ghost.className = 'sb-drag-ghost';
  ghost.innerHTML = vehicleSVG(0, len, sbDir, false, { photoOverride: img });
  document.body.appendChild(ghost);
  const move = ev => {
    ghost.style.left = (ev.clientX - 46) + 'px';
    ghost.style.top = (ev.clientY - 23) + 'px';
  };
  move(e);
  const up = ev => {
    document.removeEventListener('pointermove', move);
    pickEl.classList.remove('dragging');
    ghost.remove();
    const rect = $('sbBoard').getBoundingClientRect();
    if(ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom){
      const cell = sbCellFromEvent(ev);
      sbPlaceFromPicker(cell.r, cell.c, img, len);
    }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up, { once: true });
}

function sbPlaceFromPicker(r, c, img, len){
  const p = {
    r: Math.min(Math.max(0, r), N - (sbDir === 'v' ? len : 1)),
    c: Math.min(Math.max(0, c), N - (sbDir === 'h' ? len : 1)),
    len, dir: sbDir, photo: img,
  };
  if(!sbFits(p)){ sfx('deny'); return; }
  sbState.pieces.push(p);
  sbRender();
}

function sbGrid(){
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  sbState.walls.forEach(([r, c]) => { g[r][c] = 'w'; });
  sbState.pieces.forEach((p, i) => {
    for(let k = 0; k < p.len; k++){
      const r = p.dir === 'h' ? p.r : p.r + k;
      const c = p.dir === 'h' ? p.c + k : p.c;
      if(r < N && c < N) g[r][c] = i;
    }
  });
  return g;
}

function sbFits(p, ignoreIdx = -1){
  const g = sbGrid();
  for(let k = 0; k < p.len; k++){
    const r = p.dir === 'h' ? p.r : p.r + k;
    const c = p.dir === 'h' ? p.c + k : p.c;
    if(r < 0 || c < 0 || r >= N || c >= N) return false;
    if(g[r][c] !== -1 && g[r][c] !== ignoreIdx) return false;
  }
  return true;
}

function sbStatus(){
  const el = $('sbStatus');
  el.className = 'sb-status';
  if(!sbState.pieces.length || !sbState.pieces[0].hero){
    el.textContent = 'Place the hero car to check solvability.';
    return null;
  }
  const sol = solve(sbState.pieces.map(q => ({ r: q.r, c: q.c, len: q.len, dir: q.dir })),
                    { walls: sbState.walls });
  if(sol.solvable){
    el.textContent = `Solvable · par ${sol.optimal}`;
    el.classList.add('ok');
  } else {
    el.textContent = 'Not solvable from this layout.';
    el.classList.add('bad');
  }
  return sol;
}

function sbRender(){
  const b = $('sbBoard');
  b.querySelectorAll('.sb-piece, .sb-wall').forEach(e => e.remove());
  sbState.walls.forEach(([r, c], wi) => {
    const el = document.createElement('div');
    el.className = 'sb-wall';
    el.dataset.w = wi;
    el.style.width = el.style.height = SB_CELL + 'px';
    el.style.transform = `translate(${c * SB_CELL}px, ${r * SB_CELL}px)`;
    el.innerHTML = wallSVG('sb' + wi);
    b.appendChild(el);
  });
  const seed = hashStr(JSON.stringify(sbState.pieces));
  let sedanOrd = 0, truckOrd = 0;
  sbState.pieces.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'sb-piece' + (p.hero ? ' hero' : '');
    el.dataset.i = i;
    el.style.width = (p.dir === 'h' ? p.len : 1) * SB_CELL + 'px';
    el.style.height = (p.dir === 'v' ? p.len : 1) * SB_CELL + 'px';
    el.style.transform = `translate(${p.c * SB_CELL}px, ${p.r * SB_CELL}px)`;
    const photoOrd = p.hero ? 0 : (p.len >= 3 ? truckOrd++ : sedanOrd++);
    el.innerHTML = vehicleSVG(i, p.len, p.dir, !!p.hero, { seed, photoOrd, photoOverride: p.photo });
    b.appendChild(el);
  });
  sbStatus();
}

function sbCellFromEvent(e){
  const rect = $('sbBoard').getBoundingClientRect();
  return {
    r: Math.floor((e.clientY - rect.top) / SB_CELL),
    c: Math.floor((e.clientX - rect.left) / SB_CELL),
  };
}

function sbPlace(r, c){
  if(r < 0 || c < 0 || r >= N || c >= N) return;
  const g = sbGrid();
  if(sbTool === 'erase'){
    if(g[r][c] === 'w') sbState.walls = sbState.walls.filter(w => !(w[0] === r && w[1] === c));
    else if(g[r][c] !== -1) sbState.pieces.splice(g[r][c], 1);
    sbRender();
    return;
  }
  if(sbTool === 'wall'){
    if(g[r][c] === 'w') sbState.walls = sbState.walls.filter(w => !(w[0] === r && w[1] === c));
    else if(g[r][c] === -1 && !(r === EXIT_ROW)) sbState.walls.push([r, c]);
    else if(g[r][c] === -1) toast('No walls on the exit row');
    sbRender();
    return;
  }
  if(sbTool === 'hero'){
    const p = { r: EXIT_ROW, c: Math.min(Math.max(0, c), N - 2), len: 2, dir: 'h', hero: true };
    const oldIdx = sbState.pieces.findIndex(q => q.hero);
    const ignore = oldIdx !== -1 ? oldIdx : -1;
    if(!sbFits(p, ignore)){ sfx('deny'); return; }
    if(oldIdx !== -1) sbState.pieces.splice(oldIdx, 1);
    sbState.pieces.unshift(p);
    sbRender();
    return;
  }
  const len = sbTool === 'truck' ? 3 : 2;
  const p = {
    r: sbDir === 'v' ? Math.min(r, N - len) : r,
    c: sbDir === 'h' ? Math.min(c, N - len) : c,
    len, dir: sbDir,
  };
  if(!sbFits(p)){ sfx('deny'); return; }
  sbState.pieces.push(p);
  sbRender();
}

function sbAttachBoard(){
  const b = $('sbBoard');
  let dragIdx = -1, dragEl = null, moved = false, startCell = null, grabOff = null;

  b.addEventListener('pointerdown', e => {
    const pieceEl = e.target.closest('.sb-piece');
    const wallEl = e.target.closest('.sb-wall');
    const cell = sbCellFromEvent(e);
    if(pieceEl){
      const i = +pieceEl.dataset.i;
      if(sbTool === 'erase'){ sbState.pieces.splice(i, 1); sbRender(); return; }
      dragIdx = i; dragEl = pieceEl; moved = false; startCell = cell;
      const p = sbState.pieces[i];
      grabOff = { r: cell.r - p.r, c: cell.c - p.c };
      pieceEl.classList.add('drag');
      b.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if(wallEl && (sbTool === 'erase' || sbTool === 'wall')){
      sbPlace(cell.r, cell.c);
      return;
    }
    sbPlace(cell.r, cell.c);
  });

  b.addEventListener('pointermove', e => {
    if(dragIdx === -1) return;
    const cell = sbCellFromEvent(e);
    if(cell.r !== startCell.r || cell.c !== startCell.c) moved = true;
    const p = sbState.pieces[dragIdx];
    const isHero = !!p.hero;
    const target = {
      ...p,
      r: isHero ? EXIT_ROW : Math.min(Math.max(0, cell.r - grabOff.r), N - (p.dir === 'v' ? p.len : 1)),
      c: Math.min(Math.max(0, cell.c - grabOff.c), N - (p.dir === 'h' ? p.len : 1)),
    };
    dragEl.style.transform = `translate(${target.c * SB_CELL}px, ${target.r * SB_CELL}px)`;
    dragEl.classList.toggle('bad', !sbFits(target, dragIdx));
    dragEl.dataset.tr = target.r; dragEl.dataset.tc = target.c;
  });

  const drop = () => {
    if(dragIdx === -1) return;
    const p = sbState.pieces[dragIdx];
    if(moved){
      const target = { ...p, r: +dragEl.dataset.tr, c: +dragEl.dataset.tc };
      if(sbFits(target, dragIdx)){ p.r = target.r; p.c = target.c; }
    } else if(!p.hero){
      // A tap (no drag) rotates the piece in place when the turn fits.
      const rot = { ...p, dir: p.dir === 'h' ? 'v' : 'h' };
      rot.r = Math.min(rot.r, N - (rot.dir === 'v' ? rot.len : 1));
      rot.c = Math.min(rot.c, N - (rot.dir === 'h' ? rot.len : 1));
      if(sbFits(rot, dragIdx)){ p.r = rot.r; p.c = rot.c; p.dir = rot.dir; }
      else sfx('deny');
    }
    dragIdx = -1; dragEl = null;
    sbRender();
  };
  b.addEventListener('pointerup', drop);
  b.addEventListener('pointercancel', drop);
}

function sbLevelObj(){
  const sol = sbStatus();
  return {
    m: sol && sol.solvable ? sol.optimal : 99,
    p: sbState.pieces.map(q => [q.r, q.c, q.len, q.dir]),
    w: sbState.walls.map(w => [w[0], w[1]]),
  };
}

function sbPlaytest(levelObj){
  const lv = levelObj ?? (() => {
    if(!sbState.pieces.length || !sbState.pieces[0].hero){ toast('Place the hero car first'); return null; }
    return sbLevelObj();
  })();
  if(!lv) return;
  abandonIfMidLevel();
  stopMenuMusic(); stopSettingsMusic();
  mode = { type: 'sandbox' };
  curLevel = lv;
  hideOverlay('sandboxOverlay');
  hideOverlay('startOverlay');
  startBoard();
  track('sandbox_test', { pieces: lv.p.length, walls: (lv.w || []).length, par: lv.m });
}

async function sbLoadSaved(){
  sbSaved = (await load(SB_KEY)) || [];
}

async function sbPersistSaved(){
  await store(SB_KEY, sbSaved);
}

/* Exported shape matches exactly what tools/promote-sandbox-levels.mjs and
   the LEVELS array both expect: {name, m, p, w?}. m===99 means "not yet
   verified solvable" (sbLevelObj()'s placeholder) — the promote script
   recomputes par itself regardless, so an unsolved-looking export is still
   safe to hand off, just not guaranteed to go anywhere. */
function sbLevelExportObj(lv){
  return { name: lv.name, m: lv.m, p: lv.p, ...(lv.w?.length ? { w: lv.w } : {}) };
}

/* Plain clipboard copy, deliberately skipping shareText()'s navigator.share
   path — this is a dev/technical handoff (paste into a script or chat), not
   social sharing, so popping the OS share sheet would be the wrong UI. */
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(_){}
    ta.remove();
    return ok;
  }
}

async function sbExportOne(lv){
  const ok = await copyToClipboard(JSON.stringify(sbLevelExportObj(lv), null, 2));
  toast(ok ? t('toast.copied') : t('toast.copyfail'));
}

function sbRenderSaved(){
  const list = $('sbSavedList');
  list.innerHTML = '';
  sbSaved.forEach((lv, i) => {
    const row = document.createElement('div');
    row.className = 'sb-saved-row';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = lv.name;
    const par = document.createElement('span'); par.className = 'par'; par.textContent = lv.m === 99 ? 'par ?' : 'par ' + lv.m;
    const play = document.createElement('button'); play.className = 'btn'; play.textContent = 'Play';
    play.addEventListener('click', () => { sfx('ui'); sbPlaytest({ m: lv.m, p: lv.p, w: lv.w }); });
    const edit = document.createElement('button'); edit.className = 'btn'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      sfx('ui');
      sbState = {
        pieces: lv.p.map((a, j) => ({ r: a[0], c: a[1], len: a[2], dir: a[3], hero: j === 0 })),
        walls: (lv.w || []).map(w => [w[0], w[1]]),
      };
      $('sbName').value = lv.name;
      sbRender();
    });
    const exp = document.createElement('button'); exp.className = 'btn'; exp.textContent = 'Export';
    exp.addEventListener('click', async () => { sfx('ui'); await sbExportOne(lv); });
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = '✕';
    del.addEventListener('click', async () => {
      sfx('ui');
      sbSaved.splice(i, 1);
      await sbPersistSaved();
      sbRenderSaved();
    });
    row.append(nm, par, play, edit, exp, del);
    list.appendChild(row);
  });
}

function wireSandbox(){
  document.querySelectorAll('.sb-tool').forEach(btn => btn.addEventListener('click', () => {
    sbTool = btn.dataset.tool;
    document.querySelectorAll('.sb-tool').forEach(x => x.classList.toggle('cur', x === btn));
    sbRenderPicker();
  }));
  $('sbDirBtn').addEventListener('click', () => {
    sbDir = sbDir === 'h' ? 'v' : 'h';
    $('sbDirBtn').textContent = 'Dir: ' + sbDir.toUpperCase();
  });
  $('sbTestBtn').addEventListener('click', () => { sfx('ui'); sbPlaytest(); });
  $('sbClearBtn').addEventListener('click', () => {
    sfx('ui');
    sbState = { pieces: [], walls: [] };
    sbRender();
  });
  $('sbSaveBtn').addEventListener('click', async () => {
    if(!sbState.pieces.length || !sbState.pieces[0].hero){ toast('Place the hero car first'); return; }
    const name = ($('sbName').value || '').trim() || 'Level ' + (sbSaved.length + 1);
    const lv = { name, ...sbLevelObj(), t: Date.now() };
    const existing = sbSaved.findIndex(x => x.name === name);
    if(existing !== -1) sbSaved[existing] = lv; else sbSaved.push(lv);
    await sbPersistSaved();
    sbRenderSaved();
    sfx('ui');
    toast(`Saved “${name}”` + (lv.m === 99 ? ' (not solvable yet)' : ` · par ${lv.m}`));
  });
  $('sbExportAllBtn').addEventListener('click', async () => {
    sfx('ui');
    if(!sbSaved.length){ toast('No saved levels to export'); return; }
    const ok = await copyToClipboard(JSON.stringify(sbSaved.map(sbLevelExportObj), null, 2));
    toast(ok ? `Copied ${sbSaved.length} level(s)` : t('toast.copyfail'));
  });
  $('sbLibraryBtn').addEventListener('click', () => { sfx('ui'); openLibrary(); });
  sbAttachBoard();
}

/* ================== ADMIN ASSET LIBRARY ================== */
let libTab = 'sedans';
// Index within lib[libTab] currently showing its inline rename input
// instead of its normal tag+buttons — cleared on tab switch and after
// commit/cancel. Only 'lib'-origin entries are renamable: base entries are
// hardcoded array constants with no per-instance name to persist (that's
// what Duplicate is for — it copies a base entry into the editable layer,
// where it then CAN be renamed).
let libRenamingIndex = null;

function openLibrary(){
  showOverlay('libraryOverlay');
  renderLibraryOverlay();
}

// Copies any entry (base or lib-origin) into the library's editable layer
// under a "-copy" tag, then drops the new card straight into rename mode —
// this is the "duplicate and save as" flow: one action, immediately
// followed by naming the result. Duplicating a base entry is how an admin
// gets an editable variant of a hardcoded asset (same image, independently
// recolorable/renamable) without touching source.
async function duplicateAsset(entry){
  sfx('ui');
  const copy = Object.assign({}, entry, { color: `${entry.color || 'asset'}-copy` });
  await addAsset(libTab, copy);
  libRenamingIndex = (getLibrary()[libTab] || []).length - 1;
  renderLibraryOverlay();
  sbRenderPicker();
  toast('Duplicated — rename it below');
}

function libCard(entry, len, meta){
  const card = document.createElement('div');
  card.className = 'lib-card' + (meta.isDisabled ? ' disabled' : '');
  const art = document.createElement('div');
  art.className = 'lib-card-art';
  art.innerHTML = vehicleSVG(0, len, 'h', false, { photoOverride: entry.img });
  card.appendChild(art);

  if(meta.isRenaming){
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'lib-card-rename'; input.autocomplete = 'off';
    input.value = entry.color || '';
    card.appendChild(input);
    const commit = async () => {
      const val = input.value.trim();
      if(val) await updateAsset(libTab, meta.index, { color: val });
      libRenamingIndex = null;
      renderLibraryOverlay();
      sbRenderPicker();
    };
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); sfx('ui'); commit(); }
      if(e.key === 'Escape'){ sfx('ui'); libRenamingIndex = null; renderLibraryOverlay(); }
    });
    const row = document.createElement('div');
    row.className = 'lib-card-row';
    const save = document.createElement('button');
    save.className = 'btn primary'; save.type = 'button'; save.textContent = 'Save';
    save.addEventListener('click', () => { sfx('ui'); commit(); });
    row.appendChild(save);
    const cancel = document.createElement('button');
    cancel.className = 'btn'; cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { sfx('ui'); libRenamingIndex = null; renderLibraryOverlay(); });
    row.appendChild(cancel);
    card.appendChild(row);
    return card;
  }

  const tag = document.createElement('div');
  tag.className = 'lib-card-tag';
  tag.textContent = entry.color || (entry.fixed ? 'fixed' : `hue ${entry.hue ?? 0}`);
  card.appendChild(tag);

  const row = document.createElement('div');
  row.className = 'lib-card-row';
  const dup = document.createElement('button');
  dup.className = 'btn'; dup.type = 'button'; dup.textContent = 'Duplicate';
  dup.addEventListener('click', () => duplicateAsset(entry));
  row.appendChild(dup);

  if(meta.origin === 'base'){
    const btn = document.createElement('button');
    btn.className = 'btn'; btn.type = 'button';
    btn.textContent = meta.isDisabled ? 'Enable' : 'Disable';
    btn.addEventListener('click', async () => {
      sfx('ui');
      await setBaseDisabled(entry.img, !meta.isDisabled);
      renderLibraryOverlay();
      sbRenderPicker();
    });
    row.appendChild(btn);
    card.appendChild(row);
  } else {
    // Edit only applies to lib-origin entries: it re-opens the asset's own
    // img in the add-form's full pipeline and saves back via replaceAsset
    // (in place), which needs a real persisted entry at a real index —
    // a base entry has neither.
    const edit = document.createElement('button');
    edit.className = 'btn'; edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => libEditAsset(entry, meta.index));
    row.appendChild(edit);
    card.appendChild(row);

    const row2 = document.createElement('div');
    row2.className = 'lib-card-row';
    const ren = document.createElement('button');
    ren.className = 'btn'; ren.type = 'button'; ren.textContent = 'Rename';
    ren.addEventListener('click', () => {
      sfx('ui');
      libRenamingIndex = meta.index;
      renderLibraryOverlay();
    });
    row2.appendChild(ren);
    const del = document.createElement('button');
    del.className = 'btn'; del.type = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      sfx('ui');
      await removeAsset(libTab, meta.index);
      renderLibraryOverlay();
      sbRenderPicker();
    });
    row2.appendChild(del);
    card.appendChild(row2);
  }
  return card;
}

function renderLibraryHeroTab(){
  const grid = $('libGrid');
  grid.innerHTML = '';
  const lib = getLibrary();
  CARS.forEach(car => {
    const row = document.createElement('div');
    row.className = 'lib-hero-row';
    const art = document.createElement('div');
    art.className = 'lib-hero-art';
    art.innerHTML = vehicleSVG(0, 2, 'h', true, { skin: skinFor(car.id), headlights: false });
    row.appendChild(art);
    const name = document.createElement('div');
    name.className = 'lib-hero-name';
    name.textContent = car.name;
    row.appendChild(name);
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.className = 'lib-hero-file';
    const photo = lib.heroPhotos[car.id];
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'btn'; uploadBtn.type = 'button';
    uploadBtn.textContent = photo ? 'Replace' : 'Assign';
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if(!file) return;
      // Hero uploads skip the interactive preview (scale/background-removal
      // controls) the main library add-form has — a fixed 97% centered fit
      // is a reasonable default per-car, and building a 24-row-deep preview
      // panel for a much less frequent action wasn't worth the UI weight.
      const img = await loadImageFromFile(file);
      const canvas = renderToCanvas(img, 'sedans', { scalePercent: 97 });
      await setHeroPhoto(car.id, canvas.toDataURL('image/png'));
      renderLibraryOverlay();
      sfx('ui');
      toast(`Assigned ${car.name}`);
    });
    row.appendChild(fileInput);
    row.appendChild(uploadBtn);
    if(photo){
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn'; clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', async () => {
        sfx('ui');
        await clearHeroPhoto(car.id);
        renderLibraryOverlay();
      });
      row.appendChild(clearBtn);
    }
    grid.appendChild(row);
  });
}

function renderLibraryOverlay(){
  $('libAddForm').hidden = libTab === 'hero';
  if(libTab === 'hero'){ renderLibraryHeroTab(); return; }

  const grid = $('libGrid');
  grid.innerHTML = '';
  const lib = getLibrary();
  const disabled = new Set(lib.disabledBase);
  const len = libTab === 'trucks' ? 3 : 2;

  basePhotos(libTab).forEach(entry => {
    grid.appendChild(libCard(entry, len, { origin: 'base', isDisabled: disabled.has(entry.img) }));
  });
  let renamingCard = null;
  (lib[libTab] || []).forEach((entry, i) => {
    const card = libCard(entry, len, { origin: 'lib', index: i, isRenaming: i === libRenamingIndex });
    if(i === libRenamingIndex) renamingCard = card;
    grid.appendChild(card);
  });
  if(renamingCard){
    const input = renamingCard.querySelector('input');
    if(input){ input.focus(); input.select(); }
    renamingCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// The currently-loaded NATIVE-resolution source image — kept in memory
// (not re-read from the file input) so the final "Add"/"Save" commit can
// bake the asset at full quality. Live preview re-renders use
// libPreviewSrc instead (a downscaled copy made once, right after
// loading) — reusing the native image for every drag-tick render would
// pay a full-resolution resample cost on every single frame, which is
// what actually made the sliders feel broken on a real 12-megapixel
// phone photo.
let libPendingImg = null;
let libPreviewSrc = null;

// Index within lib[libTab] currently being re-edited (null = plain "Add"
// mode). Set by libEditAsset(), cleared by libCancelEdit()/a successful
// save/switching tabs.
let libEditingIndex = null;

// Independent, centered non-uniform stretch multipliers (%) driven by the
// preview's drag handles — not a pair of range inputs, since dragging a
// handle is the whole point of "transform points" rather than a slider.
let libStretchX = 100, libStretchY = 100;

// The last render's placement rect (in the preview canvas's own pixel
// space, from renderToCanvas's rectOut) — used to position the transform
// handles and to give handle-dragging a stable, stretch-independent base
// size to compute percentages against.
let libPreviewRect = null;

// [rangeId, valueLabelId, default] for every preview-adjustment slider —
// one list drives both the 'input' wiring and the two reset paths (the
// explicit Reset-adjustments button, and clearing the form after Add/on
// tab switch) so the defaults only live in one place.
const LIB_SLIDERS = [
  ['libTolerance', 'libToleranceVal', 32],
  ['libScaleRange', 'libScaleVal', 97],
  ['libRotate', 'libRotateVal', 0],
  ['libBrightness', 'libBrightnessVal', 100],
  ['libContrast', 'libContrastVal', 100],
  ['libSaturation', 'libSaturationVal', 100],
  ['libHue', 'libHueVal', 0],
  ['libColorizeAmount', 'libColorizeAmountVal', 0],
  ['libColorizeHue', 'libColorizeHueVal', 0],
];

function libResetSliders(){
  LIB_SLIDERS.forEach(([id, labelId, def]) => {
    $(id).value = def;
    $(labelId).textContent = def;
  });
  $('libToleranceLab').hidden = !$('libRemoveBg').checked;
  libStretchX = 100; libStretchY = 100;
  $('libStretchReadout').textContent = 'Stretch 100% × 100%';
}

// Everything renderToCanvas needs, read fresh off the form each call.
// `preview=true` adds previewMaxDim so live re-renders (fired on every
// slider tick / handle-drag frame) work off a downscaled copy instead of
// the source photo's full resolution — see renderToCanvas's own comment
// for why that matters (this was the actual cause of "sliders do
// nothing" on a real phone photo). The one-time commit (Add/Save) calls
// this with preview=false to bake the final asset at full resolution.
function libGatherOpts(preview){
  const opts = {
    removeBackground: $('libRemoveBg').checked,
    tolerance: Number($('libTolerance').value),
    scalePercent: Number($('libScaleRange').value),
    rotate: Number($('libRotate').value),
    brightness: Number($('libBrightness').value),
    contrast: Number($('libContrast').value),
    saturation: Number($('libSaturation').value),
    hue: Number($('libHue').value),
    colorizeHue: Number($('libColorizeHue').value),
    colorizeAmount: Number($('libColorizeAmount').value),
    stretchX: libStretchX,
    stretchY: libStretchY,
  };
  if(preview) opts.previewMaxDim = 1000;
  return opts;
}

let libPreviewErrorShown = false;

function libRenderPreview(){
  if(!libPreviewSrc) return;
  try{
    const rect = {};
    const canvas = renderToCanvas(libPreviewSrc, libTab, libGatherOpts(true), rect);
    const preview = $('libPreviewCanvas');
    preview.width = canvas.width; preview.height = canvas.height;
    preview.getContext('2d').drawImage(canvas, 0, 0);
    libPreviewRect = rect;
    libPositionHandles();
    libPreviewErrorShown = false;
  }catch(err){
    console.error('Library preview render failed:', err);
    if(!libPreviewErrorShown){
      libPreviewErrorShown = true;
      toast('Preview failed — try a smaller image or fewer adjustments');
    }
  }
}

// Coalesces bursts of slider-drag/handle-drag 'input'/'pointermove' events
// (a real touch drag can fire dozens per second) down to at most one
// re-render per animation frame, so a rapid drag can't pile up many
// overlapping full pipeline runs.
let libPreviewRAF = null;
function scheduleLibPreview(){
  if(libPreviewRAF) return;
  libPreviewRAF = requestAnimationFrame(() => {
    libPreviewRAF = null;
    libRenderPreview();
  });
}

// Places the 8 transform handles around the last render's rect, mapping
// from the canvas's internal pixel space to on-screen CSS pixels via
// getBoundingClientRect (robust regardless of how object-fit/max-height
// actually resolved the canvas's displayed size).
function libPositionHandles(){
  if(!libPreviewRect) return;
  const canvas = $('libPreviewCanvas');
  const stage = $('libPreviewStage');
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if(!canvasRect.width || !canvasRect.height) return;
  const sx = canvasRect.width / canvas.width;
  const sy = canvasRect.height / canvas.height;
  const offX = canvasRect.left - stageRect.left;
  const offY = canvasRect.top - stageRect.top;
  const { x, y, w, h } = libPreviewRect;
  const pts = {
    nw: [x, y], n: [x + w / 2, y], ne: [x + w, y],
    e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h],
    sw: [x, y + h], w: [x, y + h / 2],
  };
  document.querySelectorAll('#libPreviewStage .lib-xform-handle').forEach(el => {
    const [px, py] = pts[el.dataset.handle];
    el.style.left = `${offX + px * sx}px`;
    el.style.top = `${offY + py * sy}px`;
  });
  $('libStretchReadout').textContent = `Stretch ${Math.round(libStretchX)}% × ${Math.round(libStretchY)}%`;
}

// Drag-to-stretch: each handle nudges libStretchX and/or libStretchY based
// on which cardinal letters its name contains ('nw' touches both the
// n-branch and w-branch, 'e' touches only the e-branch, etc). Stretch is
// always centered (matching how every render here centers the car in the
// canvas), so growing one edge by `d` grows the total dimension by `2d`.
function libWireHandles(){
  document.querySelectorAll('#libPreviewStage .lib-xform-handle').forEach(el => {
    el.addEventListener('pointerdown', e => {
      if(!libPreviewRect) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const handle = el.dataset.handle;
      const startX = e.clientX, startY = e.clientY;
      const startStretchX = libStretchX, startStretchY = libStretchY;
      const canvas = $('libPreviewCanvas');
      const canvasRect = canvas.getBoundingClientRect();
      const pxToCanvasX = canvas.width / canvasRect.width;
      const pxToCanvasY = canvas.height / canvasRect.height;
      // Un-stretch the current rect back to its 100%/100% size so drag
      // sensitivity (% per pixel) stays constant regardless of the
      // stretch level already dialed in when the drag starts.
      const baseW = libPreviewRect.w / (startStretchX / 100);
      const baseH = libPreviewRect.h / (startStretchY / 100);

      const onMove = ev => {
        const dxCanvas = (ev.clientX - startX) * pxToCanvasX;
        const dyCanvas = (ev.clientY - startY) * pxToCanvasY;
        if(handle.includes('e')) libStretchX = startStretchX + (dxCanvas * 2 / baseW) * 100;
        if(handle.includes('w')) libStretchX = startStretchX - (dxCanvas * 2 / baseW) * 100;
        if(handle.includes('s')) libStretchY = startStretchY + (dyCanvas * 2 / baseH) * 100;
        if(handle.includes('n')) libStretchY = startStretchY - (dyCanvas * 2 / baseH) * 100;
        libStretchX = Math.max(20, Math.min(400, libStretchX));
        libStretchY = Math.max(20, Math.min(400, libStretchY));
        scheduleLibPreview();
      };
      const onUp = () => {
        el.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

// Resets the add-form back to a blank "Add" state — shared by tab
// switches, a successful Add/Save, and explicit Cancel-edit.
function libCancelEdit(){
  libEditingIndex = null;
  libPendingImg = null;
  libPreviewSrc = null;
  $('libEditBanner').hidden = true;
  $('libAddBtn').textContent = 'Add to library';
  $('libAddFile').value = '';
  $('libAddColor').value = ''; $('libAddHue').value = '';
  $('libAddFixed').checked = true; $('libAddHue').hidden = true;
  $('libRemoveBg').checked = false;
  libResetSliders();
  $('libPreviewWrap').hidden = true;
}

// Re-opens an existing lib-origin entry in the add-form's full image
// pipeline (all sliders + transform handles) plus its name/tag fields, so
// an admin can touch up an asset already in the library instead of only
// being able to re-upload from scratch. Saves back via replaceAsset at
// the same index rather than creating a new entry (that's what Duplicate
// is for).
async function libEditAsset(entry, index){
  sfx('ui');
  libEditingIndex = index;
  libPendingImg = await loadImageFromDataUrl(entry.img);
  libPreviewSrc = downscaleForPreview(libPendingImg);
  $('libAddColor').value = entry.color || '';
  const fixed = !!entry.fixed;
  $('libAddFixed').checked = fixed;
  $('libAddHue').hidden = fixed;
  $('libAddHue').value = entry.hue ?? 0;
  $('libRemoveBg').checked = false;
  libResetSliders();
  $('libEditBanner').hidden = false;
  $('libEditBannerName').textContent = entry.color || 'asset';
  $('libAddBtn').textContent = 'Save changes';
  $('libPreviewWrap').hidden = false;
  libRenderPreview();
  $('libAddForm').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function wireLibrary(){
  libWireHandles();
  $('libEditCancelBtn').addEventListener('click', () => { sfx('ui'); libCancelEdit(); });
  document.querySelectorAll('#libTabs .tab').forEach(btn => btn.addEventListener('click', () => {
    sfx('ui');
    libTab = btn.dataset.libtab;
    // Switching category mid-upload: base canvas size (sedans/trucks) may
    // differ, and Hero Art has no add-form at all — clear the pending
    // preview rather than carry a stale one across tabs.
    libCancelEdit();
    libRenamingIndex = null;
    document.querySelectorAll('#libTabs .tab').forEach(x => x.classList.toggle('cur', x === btn));
    renderLibraryOverlay();
  }));
  $('libAddFixed').addEventListener('change', () => {
    $('libAddHue').hidden = $('libAddFixed').checked;
  });
  $('libAddFile').addEventListener('change', async () => {
    const file = $('libAddFile').files[0];
    if(!file){ libPendingImg = null; libPreviewSrc = null; $('libPreviewWrap').hidden = true; return; }
    // A fresh upload always means "Add", even if a previous Edit was left
    // open — swap back to add-mode's labelling/state, then load the file.
    libEditingIndex = null;
    $('libEditBanner').hidden = true;
    $('libAddBtn').textContent = 'Add to library';
    libPendingImg = await loadImageFromFile(file);
    libPreviewSrc = downscaleForPreview(libPendingImg);
    $('libPreviewWrap').hidden = false;
    libRenderPreview();
  });
  $('libRemoveBg').addEventListener('change', () => {
    $('libToleranceLab').hidden = !$('libRemoveBg').checked;
    libRenderPreview();
  });
  LIB_SLIDERS.forEach(([id, labelId]) => {
    $(id).addEventListener('input', () => {
      $(labelId).textContent = $(id).value;
      scheduleLibPreview();
    });
  });
  $('libResetAdjustBtn').addEventListener('click', () => {
    sfx('ui');
    libResetSliders();
    libRenderPreview();
  });
  $('libAddBtn').addEventListener('click', async () => {
    if(!libPendingImg){ toast('Choose an image first'); return; }
    const color = ($('libAddColor').value || '').trim();
    if(!color){ toast('Give it a colour tag'); return; }
    const fixed = $('libAddFixed').checked;
    const hue = Number($('libAddHue').value) || 0;
    let dataUrl;
    try{
      // Re-render at full native resolution for the actual committed
      // asset — the live preview canvas this reads from during dragging
      // is deliberately downscaled for performance (see libGatherOpts),
      // so grabbing its pixels directly would ship a lower-quality PNG.
      const finalCanvas = renderToCanvas(libPendingImg, libTab, libGatherOpts(false));
      dataUrl = finalCanvas.toDataURL('image/png');
    }catch(err){
      console.error('Library commit render failed:', err);
      toast('Could not process this image — try different settings');
      return;
    }
    const entry = fixed ? { img: dataUrl, color, fixed: true } : { img: dataUrl, color, hue };
    if(libEditingIndex != null){
      await replaceAsset(libTab, libEditingIndex, entry);
      toast('Saved changes');
    } else {
      await addAsset(libTab, entry);
      toast('Added to library');
    }
    libCancelEdit();
    renderLibraryOverlay();
    sbRenderPicker();
    sfx('ui');
  });
  $('libExportBtn').addEventListener('click', async () => {
    sfx('ui');
    const ok = await copyToClipboard(JSON.stringify(getLibrary(), null, 2));
    toast(ok ? 'Copied — hand it to tools/promote-library.mjs' : t('toast.copyfail'));
  });
  $('libResetBtn').addEventListener('click', async () => {
    sfx('ui');
    await resetLibrary();
    renderLibraryOverlay();
    sbRenderPicker();
    toast('Library cleared');
  });
  $('adminLibraryBtn').addEventListener('click', () => { sfx('ui'); openLibrary(); });
}

/* Browsers block audio.play() until a user gesture; retry menu music
   on the first tap/click/key anywhere so Velvet Glove starts the
   moment the player touches the screen, not just on the Play button. */
document.addEventListener('pointerdown', () => startMenuMusic(), { once: true });
document.addEventListener('keydown', () => startMenuMusic(), { once: true });

/* ================== BOOT ================== */
(async function boot(){
  initI18n();
  applyStrings();
  await loadLibrary();
  const loaded = await load('save_v1');
  if(loaded){
    save = Object.assign(save, loaded);
    save.settings = Object.assign({ sfx: 1, music: 0.5, haptics: true, colorblind: false, autoAdvance: true, reminder: false, mode: 'heist' }, loaded.settings);
    // Migrate the old boolean alarm toggle: players who had it on keep
    // Heist, players who had it off (or never set it) land on Relaxed —
    // new installs get the new default (Heist) via the object above.
    if(!loaded.settings?.mode && typeof loaded.settings?.alarm === 'boolean'){
      save.settings.mode = loaded.settings.alarm ? 'heist' : 'relaxed';
    }
    delete save.settings.alarm;
    save.hints = Object.assign({ day: '', left: HINT_TOKENS_PER_DAY }, loaded.hints);
    save.bounties = Object.assign({ done: {} }, loaded.bounties);
    save.impound = Object.assign({ stars: {}, best: {} }, loaded.impound);
    // Older saves have no per-mode level tracking — seed all three modes
    // from wherever the player's single shared progress pointer was.
    if(!loaded.modeLevel){
      const shared = Math.max(0, campaignUpperBound());
      save.modeLevel = { relaxed: shared, heist: shared, pursuit: shared };
    }
    // Older saves predate jobClears (Relaxed clears used to count towards
    // unlocking a level's mark same as Heist/Pursuit) — grandfather in
    // whatever was already starred rather than silently repossessing cars
    // a returning player already earned under the old rule. Only clears
    // from here on actually require a car-earning pacing.
    if(!loaded.jobClears) save.jobClears = Object.assign({}, loaded.stars);
  }
  await loadDaily();
  await initAnalytics();
  applySettings();
  wire();
  wireSettings();
  wirePro();
  wireAdmin();
  wireSandbox();
  wireLibrary();
  await sbLoadSaved();
  applyAdminUI();
  layout();
  const startAt = Math.max(0, Math.min(save.modeLevel[save.settings.mode] ?? 0, campaignUpperBound()));
  loadLevel(startAt);
  startMenuMusic();
  // Deferred so it never competes with this first level's own images —
  // idle time on the start screen (before a mode's even picked) is enough
  // to warm most of the library before it's actually needed.
  const warmLater = () => warmVehiclePhotos();
  if('requestIdleCallback' in window) requestIdleCallback(warmLater, { timeout: 4000 });
  else setTimeout(warmLater, 1500);
  // Poster start screen already has the `show` class in the static HTML
  // (no flash-of-bare-board while this async boot sequence runs) and
  // shows on every launch; the how-to-play/mode-picker popup that follows
  // it is gated to the first launch only (see startPlayBtn).
  setTimeout(() => $('startPlayBtn').focus(), 100);
})();
