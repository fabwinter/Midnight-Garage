/* Midnight Garage — main app.
   Phase 0 + v1.0 of docs/SEQUENCING-PLAN.md: rebrand, chapters, game feel
   (weight/flick/dust), onboarding, session flow, accessibility, analytics,
   daily puzzle + share card, Pro Garage gating. */

import { N, EXIT_ROW, firstOptimalMove, solve } from './solver.js';
import { LEVELS, CHAPTERS, CHAPTER_SIZE } from './levels.data.js';
import { dailyLevel, dailyNumber, DAILY_EPOCH } from './generate.js';
import { load, store, todayStr } from './storage.js';
import { sfx, setSfxVolume, setMusicVolume, setGameMode, startAttemptTrack, stopAttemptTrack, duckAttemptTrack, resumeAttemptTrack, startMenuMusic, stopMenuMusic, playSettingsMusic, stopSettingsMusic, toggleThemePlayer } from './audio.js';
import { haptic, setHapticsEnabled } from './haptics.js';
import { initAnalytics, track, flush } from './analytics.js';
import { initI18n, t } from './i18n.js';
import { loadDaily, daily, isDone, recordDailyWin, isPlayable } from './daily.js';
import { bountyFor, bountyConditionMet } from './bounty.js';
import { IMPOUND_LOT } from './impound-lot.data.js';
import { dailyShareText, shareText } from './share.js';
import { setStreakReminder } from './notify.js';
import { PALETTE, vehicleSVG, wallSVG, dressingSVG, gateSVG, hitchSVG } from './art.js';
import { CARS, DEFAULT_CAR, ownedCarIds, pendingReveals, skinFor } from './collection.js';

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
  pro: false,
  streak3: 0,
  hints: { day: '', left: HINT_TOKENS_PER_DAY },
  settings: { sfx: 1, music: 0.5, haptics: true, colorblind: false, autoAdvance: true, reminder: false, mode: 'heist' },
  modeLevel: { relaxed: 0, heist: 0, pursuit: 0 }, // last-played campaign level index, per mode
  equippedCar: DEFAULT_CAR,
  carsSeen: [],
  introSeen: false,
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
     hitch trailer) count up separately, so no two pieces in one level share
     a photo — the global piece index would collide once it wraps a photo
     array (e.g. trucks at idx 3 and 11 both landing on photo 3). Sedans
     start at 1: photo 0 is the Garage-skin body.

     Each counter is also offset by a per-level seed (see levelPhotoSeed)
     before it starts counting. Without this every level's sedans walked
     the SEDAN_PHOTOS array from the same starting point (1, 2, 3…), so with
     ~4-8 sedans per level and 22 photos in the array, indices past ~8 were
     essentially never reached — the back two-thirds of the library (all
     the newer real-photo colors) never showed up in normal play even
     though they were correctly in rotation code-wise. The seed makes
     different levels start at different offsets while still walking
     sequentially, so "no duplicate within a level" still holds. */
  const seed = levelPhotoSeed();
  let sedanOrd = 1 + seed, truckOrd = seed * 3, trailerOrd = seed * 5;
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
    const photoIdx = i === 0 ? 0 : (isTrailer ? trailerOrd++ : (p.len >= 3 ? truckOrd++ : sedanOrd++));
    el.innerHTML = vehicleSVG(i, p.len, p.dir, i === 0, {
      colorblind: save.settings.colorblind,
      skin: i === 0 ? skinFor(save.equippedCar) : null,
      photoIdx,
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

  if(moves === 1 && !mergedKeyStep){
    fadeOutMenuMusicOnFirstMove();
    if(gm !== 'relaxed') startAttemptTrack(gm);
    if(gm === 'pursuit') startPursuitTimer();
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
function abandonIfMidLevel(){
  if(moves > 0 && !solvedAnim){
    track('level_abandon', {
      mode: mode.type, level: trackLevelId(),
      moves, time_s: Math.round((Date.now() - levelStart) / 1000),
    });
  }
}

function loadLevel(idx){
  abandonIfMidLevel();
  stopMenuMusic();
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
  stopMenuMusic();
  const lv = dailyLevel(dateStr);
  mode = { type: 'daily', date: dateStr, number: dailyNumber(dateStr) };
  curLevel = lv;
  startBoard();
  track('daily_start', { date: dateStr, number: mode.number, par: lv.m });
}

function loadBountyLevel(dateStr){
  abandonIfMidLevel();
  stopMenuMusic();
  const lv = bountyFor(dateStr);
  if(!lv) return;
  mode = { type: 'bounty', date: dateStr, number: lv.number, tier: lv.tier, condition: lv.condition };
  curLevel = lv;
  startBoard();
  track('bounty_start', { date: dateStr, number: mode.number, par: lv.m, tier: lv.tier, condition: lv.condition });
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
  stopMenuMusic();
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
  stopSolutionReplay(false);   // a new attempt invalidates any in-flight replay
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
  stopAttemptTrack(); // reset any track from the previous attempt; this attempt's track (if heist/pursuit) starts on first move
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

/* ================== SOLUTION REPLAY (NEXT-PLAN N3e / v1.1) ==================
   Offered on the win sheet only — the level is already cleared, so this
   teaches par-matching for the 3-star retry without leaking solutions to
   unsolved levels or undercutting the hint-token economy. Input stays
   locked the whole time (solvedAnim is still true post-win); any tap
   skips back to the win sheet. */
let replayToken = 0;

function stopSolutionReplay(reshow){
  replayToken++;
  document.removeEventListener('pointerdown', onReplaySkip);
  setNavLocked(false);
  if(reshow) showOverlay('winOverlay');
}
function onReplaySkip(){ sfx('ui'); stopSolutionReplay(true); }

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
      setTimeout(() => { if(token === replayToken) stopSolutionReplay(true); }, 950);
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

/* ================== WIN ================== */
let autoTimer = null;
function winSequence(){
  solvedAnim = true;
  clearHint(); clearHand();
  clearPursuitTimer();
  stopAttemptTrack();
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
    persist();
    track('level_win', { level: cur + 1, moves, par, stars, time_s: timeS, undos, hints: hintsUsed });
  } else if(mode.type === 'daily'){
    const res = recordDailyWin(mode.date, moves, par, stars);
    if(res.usedFreeze) toast(t('toast.freeze'));
    track('daily_win', { date: mode.date, number: mode.number, moves, par, stars, time_s: timeS, streak: daily().streak });
    if(save.settings.reminder) setStreakReminder(true, daily().streak);
  } else if(mode.type === 'bounty'){
    isBountyMet = bountyConditionMet(mode.condition, { moves, par, hintsUsed, gameMode: save.settings.mode });
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
    ? t('win.bounty', { n: mode.number })
    : mode.type === 'impound'
    ? t('win.impound', { n: curImpound + 1 })
    : mode.type === 'sandbox'
    ? 'Sandbox level cleared'
    : t('win.title', { n: cur + 1 });
  $('winMoves').textContent = moves;
  $('winPar').textContent = par;
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
  holder.innerHTML = vehicleSVG(0, 2, 'h', true, { skin: car.skin });
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
function buildGarageList(){
  const owned = ownedCarIds(save, daily());
  const holder = $('garageList');
  holder.innerHTML = '';

  const tile = (id, name, tier, skin, isOwned, hint) => {
    const b = document.createElement('button');
    b.className = 'car-tile' + (isOwned ? ' owned' : ' locked') + (save.equippedCar === id ? ' equipped' : '');
    const art = document.createElement('div');
    art.className = 'car-tile-art';
    if(isOwned) art.innerHTML = vehicleSVG(0, 2, 'h', true, { skin });
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
        buildPieces();
        buildGarageList();
      });
    }
    return b;
  };

  holder.appendChild(tile(DEFAULT_CAR, t('car.classic'), 'common', null, true, ''));
  CARS.forEach(car => {
    holder.appendChild(tile(car.id, car.name, car.tier, car.skin, owned.has(car.id), t('car.locked.' + car.id)));
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

  $('bountyTierChip').textContent = t('tier.' + lv.tier);
  $('bountyTierChip').className = 'car-tier tier-' + lv.tier;
  $('bountyPar').textContent = lv.m;
  $('bountyCond').textContent = t('bounty.cond.' + lv.condition);
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
  $('replayBtn').textContent = t('btn.replay');
  $('watchSolBtn').textContent = t('win.watch');
  $('dailyTitle').textContent = t('daily.title');
  $('dailySub').textContent = t('daily.sub');
  $('labStreak').textContent = t('daily.streak');
  $('labFreezes').textContent = t('daily.freezes');
  $('dailyNote').textContent = t('daily.backfill');
  $('bountyTitle').textContent = t('bounty.title');
  $('bountySub').textContent = t('bounty.sub');
  $('labBountyPar').textContent = t('hud.par');
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
  $('themePlayBtn').textContent = t('theme.play');
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

function updateThemeButtonText(){
  const isPlaying = menuAudio && !menuAudio.paused;
  $('themePlayBtn').textContent = isPlaying ? t('theme.pause') : t('theme.play');
}

function fadeOutMenuMusicOnFirstMove(){
  stopMenuMusic();
}

/* ================== GLOBAL WIRING ================== */
function wire(){
  $('levelsBtn').addEventListener('click', () => {
    sfx('ui'); playSettingsMusic();
    tabChapter = mode.type === 'impound' ? IMPOUND_TAB : chapterOf(cur);
    buildLevelList(); showOverlay('levelsOverlay');
  });
  $('dailyBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); openDaily(); });
  $('bountyBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); openBounty(); });
  $('settingsBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); showOverlay('settingsOverlay'); });
  $('themePlayBtn').addEventListener('click', () => { sfx('ui'); toggleThemePlayer(); updateThemeButtonText(); });
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
  $('replayBtn').addEventListener('click', () => {
    cancelAuto(); sfx('ui');
    proceedOrReveal(() => { hideOverlay('winOverlay'); startBoard(); });
  });
  $('watchSolBtn').addEventListener('click', () => { sfx('ui'); playSolutionReplay(); });
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
    if(!save.introSeen){
      showOverlay('introOverlay');
      setTimeout(() => $('introPlayBtn').focus(), 100);
    } else {
      setTimeout(() => $('board').focus(), 100);
    }
  });
  // First-launch mode cards: picking one is the same act as picking in
  // Settings — it sets the persisted mode, and every later launch defaults
  // to whatever was played last (boot() reads save.settings.mode).
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
    save.introSeen = true;
    persist();
    hideOverlay('introOverlay');
    // Re-init the board under the picked mode — boot loaded it before the
    // choice existed, and startBoard() is what seeds the mode's alarm
    // budget / pursuit clock. Zero moves have been made, so this is free.
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
let sbState = { pieces: [], walls: [] };   // pieces: {r,c,len,dir,hero?}
let sbSaved = [];

function openSandbox(){
  hideOverlay('startOverlay');
  showOverlay('sandboxOverlay');
  sbRender();
  sbRenderSaved();
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
  let sedanOrd = 1, truckOrd = 0;
  sbState.pieces.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'sb-piece' + (p.hero ? ' hero' : '');
    el.dataset.i = i;
    el.style.width = (p.dir === 'h' ? p.len : 1) * SB_CELL + 'px';
    el.style.height = (p.dir === 'v' ? p.len : 1) * SB_CELL + 'px';
    el.style.transform = `translate(${p.c * SB_CELL}px, ${p.r * SB_CELL}px)`;
    const photoIdx = p.hero ? 0 : (p.len >= 3 ? truckOrd++ : sedanOrd++);
    el.innerHTML = vehicleSVG(i, p.len, p.dir, !!p.hero, { photoIdx });
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
  sbAttachBoard();
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
  }
  await loadDaily();
  await initAnalytics();
  applySettings();
  wire();
  wireSettings();
  wirePro();
  wireAdmin();
  wireSandbox();
  await sbLoadSaved();
  applyAdminUI();
  layout();
  const startAt = Math.max(0, Math.min(save.modeLevel[save.settings.mode] ?? 0, campaignUpperBound()));
  loadLevel(startAt);
  startMenuMusic();
  // Poster start screen already has the `show` class in the static HTML
  // (no flash-of-bare-board while this async boot sequence runs) and
  // shows on every launch; the how-to-play/mode-picker popup that follows
  // it is gated to the first launch only (see startPlayBtn).
  setTimeout(() => $('startPlayBtn').focus(), 100);
})();
