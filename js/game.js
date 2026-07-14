/* Midnight Garage — main app.
   Phase 0 + v1.0 of docs/SEQUENCING-PLAN.md: rebrand, chapters, game feel
   (weight/flick/dust), onboarding, session flow, accessibility, analytics,
   daily puzzle + share card, Pro Garage gating. */

import { N, EXIT_ROW, firstOptimalMove } from './solver.js';
import { LEVELS, CHAPTERS, CHAPTER_SIZE } from './levels.data.js';
import { dailyLevel, dailyNumber, DAILY_EPOCH } from './generate.js';
import { load, store, todayStr } from './storage.js';
import { sfx, setSfxVolume, setMusicVolume, setAlarmMode, startAlarmTrack, stopAlarmTrack, startMenuMusic, stopMenuMusic, playSettingsMusic, stopSettingsMusic, toggleThemePlayer, setMusicIntensity, startAmbienceBed, stopAmbienceBed } from './audio.js';
import { haptic, setHapticsEnabled } from './haptics.js';
import { initAnalytics, track, flush } from './analytics.js';
import { initI18n, t } from './i18n.js';
import { loadDaily, daily, isDone, recordDailyWin, isPlayable } from './daily.js';
import { dailyShareText, shareText } from './share.js';
import { setStreakReminder } from './notify.js';
import { PALETTE, vehicleSVG, wallSVG, dressingSVG, gateSVG, hitchSVG } from './art.js';
import { CARS, DEFAULT_CAR, ownedCarIds, pendingReveals, skinFor, carPayoutValue } from './collection.js';
import { armClock, startClock, stopClock, pauseClock, resumeClock, getPausesLeft, getTimeLeft, isClockRunning, resetPursuit, initPursuit, PURSUIT_BUDGET } from './pursuit.js';
import { showVignette, resetVignettes } from './vignette.js';

const $ = id => document.getElementById(id);
const FREE_LEVELS = CHAPTER_SIZE * 2;        // chapters 1–2 free; 3–4 are Pro
const SKIP_AFTER_MS = 8 * 60 * 1000;         // quiet skip valve (plan 0.7)
const HINT_TOKENS_PER_DAY = 3;

function isAlarmMode(){
  // Intro levels (0–2) are always relax; level 3+ respects the setting
  return cur > 2 && save.settings.mode === 'heist';
}

function isPursuitMode(){
  return cur > 2 && save.settings.mode === 'pursuit';
}

/* ================== STATE ================== */
let mode = { type: 'campaign' };             // or {type:'daily', date, level}
let cur = 0;                                  // campaign level index
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

let save = {
  unlocked: 1,
  stars: {}, best: {},
  pro: false,
  streak3: 0,
  hints: { day: '', left: HINT_TOKENS_PER_DAY },
  settings: { sfx: 1, music: 0.5, haptics: true, colorblind: false, autoAdvance: true, reminder: false, mode: 'heist' },
  equippedCar: DEFAULT_CAR,
  carsSeen: [],
  introSeen: false,
  modeUpgradeShown: false,
  level4ExplainerSeen: false,
  chaptersCardShown: {},  // chapterIdx: true (M6)
  heists: {},  // levelIdx: {mode, value, moves}
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
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  for(const [wr, wc] of walls) g[wr][wc] = -2;   // roadworks: never empty
  pieces.forEach((p, i) => {
    if(i === exclude) return;
    for(let k = 0; k < p.len; k++){
      g[p.r + (p.dir === 'v' ? k : 0)][p.c + (p.dir === 'h' ? k : 0)] = i;
    }
  });
  return g;
}

/* Weight (plan 0.5): trucks settle slower and heavier than cars. */
function easingFor(len, distCells){
  const base = len === 3 ? 0.26 : 0.18;
  const dur = Math.min(0.42, base + distCells * 0.028);
  const curve = len === 3 ? 'cubic-bezier(.3,.75,.35,1.06)' : 'cubic-bezier(.22,.9,.3,1.15)';
  return `transform ${dur}s ${curve}`;
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
  gates.forEach(gate => {
    const [r, c] = gate.gate;
    const el = document.createElement('div');
    el.className = 'gate';
    el.dataset.r = r; el.dataset.c = c;
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
  pieces.forEach((p, i) => {
    const el = document.createElement('div');
    const isTow = hitches.some(h => h.tow === i);
    el.className = 'piece' + (i === 0 ? ' hero' : '') + (isTow ? ' tow' : '');
    el.dataset.idx = i;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.style.width = (p.dir === 'h' ? p.len : 1) * CELL + 'px';
    el.style.height = (p.dir === 'v' ? p.len : 1) * CELL + 'px';
    el.innerHTML = vehicleSVG(i, p.len, p.dir, i === 0, {
      colorblind: save.settings.colorblind,
      skin: i === 0 ? skinFor(save.equippedCar) : null,
    });
    el.classList.add('enter');
    el.style.animationDelay = (i * 0.028) + 's';
    el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    board.appendChild(el);
    attachDrag(el, i);
  });
  updatePieceAria();
  renderPositions(false);
}
function updatePieceAria(){
  board.querySelectorAll('.piece').forEach(el => {
    const i = +el.dataset.idx, p = pieces[i];
    if(!p) return;
    el.setAttribute('aria-label',
      (i === 0 ? 'Red car — escape this one' : `Vehicle ${i}, ${p.len === 3 ? 'truck' : 'car'}`) +
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
    if(!h || decoupledHitches.has(hi)) return;  // Skip decoupled hitches
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

/* ================== DRAG + FLICK ================== */
function rangeFor(i){
  const p = pieces[i], g = grid(i);
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
      }
      lastTapT = 0;
      return;
    }
    lastTapT = now;
    if(solvedAnim) return;
    // Prevent dragging inert trailers (only tow can move, trailer follows)
    const isInertTrailer = hitches.some((h, hi) => h.trailer === i && !decoupledHitches.has(hi));
    if(isInertTrailer){ sfx('deny'); return; }
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    dragging = true; hitWall = false;
    el.classList.add('drag', 'grabbed');
    sfx('engineRev');
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
    if(pos < lo){ pos = lo - Math.min(0.22, (lo - pos) * 0.25); if(!hitWall){ hitWall = true; el.classList.add('colliding'); setTimeout(() => el.classList.remove('colliding'), 180); haptic(p().len === 3 ? 'thudHeavy' : 'thud'); sfx('collision'); } }
    else if(pos > hi){ pos = hi + Math.min(0.22, (pos - hi) * 0.25); if(!hitWall){ hitWall = true; el.classList.add('colliding'); setTimeout(() => el.classList.remove('colliding'), 180); haptic(p().len === 3 ? 'thudHeavy' : 'thud'); sfx('collision'); } }
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
    el.classList.remove('drag', 'grabbed');
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
    if(solvedAnim) return;
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
  updateHud();
  updatePieceAria();
  const p = pieces[i];
  const moveAnnounce = (i === 0 ? 'Red car' : 'Vehicle ' + i) + ` to row ${p.r + 1}, column ${p.c + 1}`;

  const won = i === 0 && pieces[0].c === N - pieces[0].len;

  if(isAlarmMode()){
    const budget = alarmBudgetFor(parOf());
    const remaining = budget - moves;
    if(moves === 1){
      $('srLive').textContent = moveAnnounce + '. ' + t('alarm.triggered', remaining);
    } else {
      $('srLive').textContent = moveAnnounce + '. ' + t('alarm.remaining', remaining);
    }
  } else {
    $('srLive').textContent = moveAnnounce;
  }

  if(moves === 1 && !mergedKeyStep){
    fadeOutMenuMusicOnFirstMove();
    if(isAlarmMode()) startAlarmTrack();
    if(isPursuitMode()) startClock();
  }

  if(isAlarmMode() && moves === 1 && !mergedKeyStep && !won){
    triggerAlarmFlash();
  }

  if(isAlarmMode() && moves > alarmBudgetFor(parOf())){
    busted();
    return;
  }

  if(isPursuitMode() && getTimeLeft() <= 0){
    busted('pursuit');
    return;
  }

  if(won){
    winSequence();
  } else {
    scheduleHand();
  }
}

/* Requirement: alarm mode is a hard fail, not just a reward-tier gate — going
   over budget ends the attempt before it can be solved (police arrive). */
function busted(){
  solvedAnim = true;
  clearHint(); clearHand();
  stopAlarmTrack();
  stopAmbienceBed();  // M5: fade out ambience on busted
  sfx('busted');
  haptic('thudHeavy');
  track('alarm_busted', {
    mode: mode.type, level: mode.type === 'campaign' ? cur + 1 : mode.number,
    moves, par: parOf(), hintsUsed, ...(mode.date && { date: mode.date }),
  });
  setTimeout(() => showBustedSheet(), 260);
}

function showBustedSheet(){
  $('bustedFlag').textContent = t('busted.flag');
  $('bustedTitle').textContent = t('busted.title');
  $('bustedSub').textContent = t('busted.sub');
  showOverlay('bustedOverlay');
  $('srLive').textContent = t('busted.title');
  setTimeout(() => $('bustedRetryBtn').focus(), 100);
}

/* "The alarm just went off" — a brief flash the moment the first piece
   moves in an alarm-mode attempt, so the budget clearly starts counting now. */
function triggerAlarmFlash(){
  const el = $('alarmFlash');
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
  sfx('alarmTrigger');
  haptic('thudHeavy');
  el.addEventListener('animationend', () => el.classList.remove('go'), { once: true });
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
function starStr(n, size = 3){
  let s = '';
  for(let i = 0; i < size; i++) s += i < n ? '★' : '<span class="off">★</span>';
  return s;
}
function chapterOf(idx){ return Math.floor(idx / CHAPTER_SIZE); }

function applyChapterAccent(){
  const accent = mode.type === 'daily' ? '#ffb454' : CHAPTERS[chapterOf(cur)].accent;
  document.documentElement.style.setProperty('--accent', accent);
  // M4: Apply chapter-specific visual class for backgrounds/atmospherics
  const frame = $('board').parentElement;
  frame.classList.remove('chapter-1', 'chapter-2', 'chapter-3', 'chapter-4');
  if(mode.type === 'campaign'){
    const ch = chapterOf(cur);
    frame.classList.add('chapter-' + (ch + 1));
  }
}

/* M6: Show chapter title card when entering a new chapter. */
function showChapterCard(chapterIdx){
  if(mode.type !== 'campaign') return;
  const ch = CHAPTERS[chapterIdx];
  if(!ch) return;

  // Create a transient chapter card overlay
  const card = document.createElement('div');
  card.className = 'chapter-card';
  card.style.cssText = `
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.8);z-index:95;animation:fadeInOut 2.5s ease-in-out forwards;
  `;
  card.innerHTML = `
    <div style="text-align:center;color:#${ch.accent?.slice(1) || 'ffb454'}">
      <div style="font-family:Chakra Petch;font-size:28px;font-weight:700;letter-spacing:.08em;
                  text-transform:uppercase;margin-bottom:8px">${ch.name}</div>
      <div style="font-family:Inter;font-size:13px;color:#8a93a6;letter-spacing:.08em;
                  text-transform:uppercase">Chapter ${chapterIdx + 1}</div>
    </div>
  `;
  document.body.appendChild(card);
  setTimeout(() => card.remove(), 2500);
}

function updateHud(){
  if(mode.type === 'daily'){
    $('hudLevel').textContent = '#' + mode.number;
    $('hudTier').textContent = t('hud.daily');
    $('hudStars').innerHTML = isDone(mode.date) ? starStr(daily().done[mode.date].stars) : starStr(0);
  } else {
    $('hudLevel').textContent = cur + 1;
    $('hudTier').textContent = CHAPTERS[chapterOf(cur)].name;
    $('hudStars').innerHTML = starStr(save.stars[cur] || 0);
  }
  $('hudMoves').textContent = moves;
  $('hudPar').textContent = parOf();
  $('undoBtn').disabled = history.length === 0 || solvedAnim;
  const s3 = $('hudStreak3');
  s3.textContent = `🔥 ${save.streak3}×3★`;
  s3.classList.toggle('on', save.streak3 >= 2 && mode.type === 'campaign');
  updateAlarmHud();
  updateControlsVisibility();
  updateHintBadge();
  $('dailyDot').classList.toggle('on', !isDone(todayStr()));
}

function updateAlarmHud(){
  const row = $('hudAlarmRow');
  const alarm = isAlarmMode();
  $('hudParRow').hidden = alarm;
  if(!alarm){ row.hidden = true; return; }
  row.hidden = false;
  const budget = alarmBudgetFor(parOf());
  const remaining = budget - moves;
  $('hudAlarmBudget').textContent = Math.max(0, remaining);
  row.setAttribute('aria-label', t('alarm.remaining', Math.max(0, remaining)));
  row.classList.toggle('tripped', remaining < 0);
  row.classList.toggle('low', remaining >= 0 && remaining <= Math.max(1, Math.ceil(budget * 0.2)));
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
      mode: mode.type, level: mode.type === 'daily' ? mode.date : cur + 1,
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
  // M6: Show chapter card on first level of each chapter
  const ch = chapterOf(idx);
  if(!save.chaptersCardShown?.[ch]){
    save.chaptersCardShown[ch] = true;
    showChapterCard(ch);
  }
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

function startBoard(){
  pieces = curLevel.p.map(a => ({ r: a[0], c: a[1], len: a[2], dir: a[3] }));
  walls = (curLevel.w ?? []).map(a => [a[0], a[1]]);
  gates = curLevel.g ?? [];
  hitches = curLevel.h ?? [];
  if(hitches.length) console.warn('hitch levels are not ship-ready');
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
  updateHud();
  updateCoach();
  // Mark level 4 explainer as seen once player reaches it
  if(mode.type === 'campaign' && cur === 3) save.level4ExplainerSeen = true;
  // M5: Start chapter-specific ambience for campaign mode
  if(mode.type === 'campaign') startAmbienceBed(chapterOf(cur));
  scheduleHand();
  stopAlarmTrack(); // reset any track from the previous attempt; this attempt's track (if alarm mode) starts on first move
}

function undo(){
  if(!history.length || solvedAnim) return;
  kbRun = -1;
  const entry = history.pop();
  entry.pieces.forEach((q, i) => { pieces[i].r = q.r; pieces[i].c = q.c; });
  decoupledHitches = new Set(entry.decoupled);
  if(!isAlarmMode()) moves = Math.max(0, moves - 1);
  undos++;
  sfx('ui'); haptic('ui');
  track('undo_used', { mode: mode.type, level: mode.type === 'daily' ? mode.date : cur + 1 });
  renderPositions(true);
  updateHud();
  updatePieceAria();
}

function decoupleTow(towIdx){
  if(solvedAnim) return false;
  const hi = hitches.findIndex(h => h.tow === towIdx);
  if(hi === -1) return false;
  if(decoupledHitches.has(hi)) return false;
  pushHistory();
  decoupledHitches.add(hi);
  moves++;
  sfx('hitchClink');
  haptic('ui');
  track('decouple', { mode: mode.type, level: mode.type === 'daily' ? mode.date : cur + 1 });
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
  if(solvedAnim) return;
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
  sfx('ui');
  track('hint_used', { mode: mode.type, level: mode.type === 'daily' ? mode.date : cur + 1 });
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
  } else if(mode.type === 'campaign' && cur === 3 && !save.level4ExplainerSeen){
    el.textContent = t('level4.explainer');
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
  if(!mv) return;
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

/* ================== WIN ================== */
let autoTimer = null;
function winSequence(){
  solvedAnim = true;
  clearHint(); clearHand();
  stopAlarmTrack();
  stopAmbienceBed();  // M5: fade out ambience
  updateHud();
  haptic('success');

  // M4: Win choreography (AAA-PLAN §4)
  // Beat of silence → traffic lights flip → boom gate rises → hero accelerates → letterbox micro-slow-mo
  const hero = board.querySelector('.piece[data-idx="0"]');
  burst();

  // Exit animation: hero accelerates out
  hero.style.transition = 'transform 1.2s cubic-bezier(.2,.4,.8,1)';
  hero.style.transform = `translate(${(N + 3.2) * CELL}px, ${pieces[0].r * CELL}px)`;

  // Gate rises (height increase + glow) + servo sound
  gate.style.transition = 'opacity .8s ease, filter .8s ease';
  gate.style.opacity = '0.3';
  gate.style.filter = 'brightness(2.2) drop-shadow(0 0 20px rgba(255,180,84,0.8))';
  sfx('gateServo');

  // Letterbox effect (subtle vignette during exit)
  const board_el = $('board').parentElement;
  board_el.style.transition = 'filter .6s ease-out .4s';
  board_el.style.filter = 'brightness(0.98)';

  sfx('win');

  const par = parOf();
  const stars = starCountFor(par, moves);
  const timeS = Math.round((Date.now() - levelStart) / 1000);

  isCleanGetaway = false;
  if(save.settings.alarm){
    isCleanGetaway = moves <= par;
    if(isCleanGetaway) track('alarm_clean_getaway', { level: mode.type === 'campaign' ? cur + 1 : mode.number, moves, par, date: mode.date });
  }

  if(mode.type === 'campaign'){
    save.stars[cur] = Math.max(save.stars[cur] || 0, stars);
    save.best[cur] = Math.min(save.best[cur] || Infinity, moves);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, cur + 2));
    save.streak3 = stars === 3 ? save.streak3 + 1 : 0;
    // M3: Heist payout — only pay out on first win or best payout mode
    const prevHeist = save.heists[cur];
    const currentPayout = carPayoutValue(cur, save.settings.mode);
    const shouldPayout = !prevHeist || currentPayout > prevHeist.value;
    if(shouldPayout){
      save.heists[cur] = { mode: save.settings.mode, value: currentPayout, moves };
    }
    persist();
    track('level_win', { level: cur + 1, moves, par, stars, time_s: timeS, undos, hints: hintsUsed, payout: shouldPayout ? currentPayout : 0 });
  } else {
    const res = recordDailyWin(mode.date, moves, par, stars);
    if(res.usedFreeze) toast(t('toast.freeze'));
    track('daily_win', { date: mode.date, number: mode.number, moves, par, stars, time_s: timeS, streak: daily().streak });
    if(save.settings.reminder) setStreakReminder(true, daily().streak);
  }

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
    : t('win.title', { n: cur + 1 });
  $('winMoves').textContent = moves;
  $('winPar').textContent = par;
  $('winBest').textContent = mode.type === 'daily'
    ? (daily().done[mode.date]?.moves ?? moves)
    : save.best[cur];
  $('cleanGetaway').hidden = !isCleanGetaway;
  if(isCleanGetaway) $('cleanGetaway').textContent = t('win.clean');
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
  sfx('win');
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

function renderPeek(lv){
  const holder = $('peekBoard');
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
}

function buildLevelList(){
  buildChapterTabs();
  const holder = $('levelList');
  holder.innerHTML = '';
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

/* ================== SETTINGS ================== */
function applySettings(){
  const s = save.settings;
  // Migrate old boolean alarm to new mode system
  if(typeof s.mode !== 'string'){
    s.mode = s.alarm ? 'heist' : 'relax';
    if(!save.modeUpgradeShown && s.mode === 'relax'){
      save.modeUpgradeShown = true;
      toast(t('toast.modeUpgrade'));
    }
  }
  setSfxVolume(s.sfx);
  setMusicVolume(s.music);
  setAlarmMode(false); // Will be set per-level based on isAlarmMode()
  setHapticsEnabled(s.haptics);
  $('sfxRange').value = s.sfx;
  $('musicRange').value = s.music;
  $('hapticsChk').checked = s.haptics;
  $('colorblindChk').checked = s.colorblind;
  $('autoAdvanceChk').checked = s.autoAdvance;
  $('reminderChk').checked = s.reminder;
  // Update mode UI
  updateModeUI();
}

function wireSettings(){
  $('sfxRange').addEventListener('input', e => { save.settings.sfx = +e.target.value; setSfxVolume(save.settings.sfx); sfx('ui'); persist(); });
  $('musicRange').addEventListener('input', e => { save.settings.music = +e.target.value; setMusicVolume(save.settings.music); persist(); });
  $('hapticsChk').addEventListener('change', e => { save.settings.haptics = e.target.checked; setHapticsEnabled(e.target.checked); haptic('ui'); persist(); });
  $('colorblindChk').addEventListener('change', e => { save.settings.colorblind = e.target.checked; persist(); buildPieces(); });
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      save.settings.mode = newMode;
      setAlarmMode(newMode === 'heist');
      persist();
      updateModeUI();
      updateHud();
      if(!solvedAnim && newMode === 'heist' && moves > 0) startAlarmTrack();
      sfx('ui');
    });
  });
  $('autoAdvanceChk').addEventListener('change', e => { save.settings.autoAdvance = e.target.checked; persist(); });
  $('reminderChk').addEventListener('change', e => {
    save.settings.reminder = e.target.checked; persist();
    setStreakReminder(e.target.checked, daily().streak);
  });
  const restore = () => { toast(save.pro ? t('toast.pro') : t('btn.restore') + ' …'); };
  $('restoreBtn').addEventListener('click', restore);
  $('restoreBtn2').addEventListener('click', restore);
}

function updateModeUI(){
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === save.settings.mode);
  });
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
  $('dailyTitle').textContent = t('daily.title');
  $('dailySub').textContent = t('daily.sub');
  $('labStreak').textContent = t('daily.streak');
  $('labFreezes').textContent = t('daily.freezes');
  $('dailyNote').textContent = t('daily.backfill');
  $('settingsTitle').textContent = t('settings.title');
  $('labSfx').textContent = t('settings.sfx');
  $('labMusic').textContent = t('settings.music');
  $('labHaptics').textContent = t('settings.haptics');
  $('labColorblind').textContent = t('settings.colorblind');
  $('labMode').textContent = t('settings.mode');
  $('modeHeistBtn').textContent = t('mode.heist');
  $('modeRelaxBtn').textContent = t('mode.relax');
  if($('modePursuitBtn')) $('modePursuitBtn').textContent = t('mode.pursuit');
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
  $('bustedSwitchRelaxBtn').textContent = t('btn.relax');
  $('startSubtitle').textContent = t('start.subtitle');
  $('startP1').textContent = t('start.p1');
  $('startP2').textContent = t('start.p2');
  $('startP3').textContent = t('start.p3');
  $('startPlayLabel').textContent = t('start.play');
  $('startNote').textContent = t('start.note');
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
  $('levelsBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); tabChapter = chapterOf(cur); buildLevelList(); showOverlay('levelsOverlay'); });
  $('dailyBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); openDaily(); });
  $('settingsBtn').addEventListener('click', () => { sfx('ui'); playSettingsMusic(); showOverlay('settingsOverlay'); });
  $('themePlayBtn').addEventListener('click', () => { sfx('ui'); toggleThemePlayer(); updateThemeButtonText(); });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => {
    e.target.closest('.overlay').classList.remove('show'); sfx('ui');
    if(['settingsOverlay', 'dailyOverlay', 'garageOverlay', 'levelsOverlay'].includes(e.target.closest('.overlay').id)) stopSettingsMusic();
  }));
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => {
    if(e.target === o && o.id !== 'winOverlay' && o.id !== 'carRevealOverlay' && o.id !== 'bustedOverlay'){
      o.classList.remove('show');
      if(['settingsOverlay', 'dailyOverlay', 'garageOverlay', 'levelsOverlay'].includes(o.id)) stopSettingsMusic();
    }
  }));
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', () => { sfx('ui'); startBoard(); toast(t('toast.reset')); });
  $('bustedRetryBtn').addEventListener('click', () => { sfx('ui'); hideOverlay('bustedOverlay'); startBoard(); setTimeout(() => $('board').focus(), 100); });
  $('bustedSwitchRelaxBtn').addEventListener('click', () => {
    sfx('ui');
    save.settings.mode = 'relax';
    setAlarmMode(false);
    persist();
    hideOverlay('bustedOverlay');
    startBoard();
    setTimeout(() => $('board').focus(), 100);
  });
  $('hintBtn').addEventListener('click', showHint);
  $('skipBtn').addEventListener('click', skipLevel);
  $('replayBtn').addEventListener('click', () => {
    cancelAuto(); sfx('ui');
    proceedOrReveal(() => { hideOverlay('winOverlay'); startBoard(); });
  });
  $('nextBtn').addEventListener('click', async () => {
    if($('nextBtn').dataset.action === 'share'){
      const res = await shareText($('nextBtn').dataset.share);
      track('share_daily', { result: res, date: mode.date });
      if(res === 'copied') toast(t('toast.copied'));
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
  $('calPrev').addEventListener('click', () => { calMonth--; if(calMonth < 0){ calMonth = 11; calYear--; } renderCalendar(); });
  $('calNext').addEventListener('click', () => { calMonth++; if(calMonth > 11){ calMonth = 0; calYear++; } renderCalendar(); });

  document.addEventListener('keydown', e => {
    if(e.key === 'z' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); undo(); }
    if(e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.target.closest('input')){ startBoard(); }
    if(e.key === 'Escape'){
      ['levelsOverlay', 'dailyOverlay', 'settingsOverlay', 'proOverlay', 'garageOverlay'].forEach(hideOverlay);
      stopSettingsMusic();
    }
  });
  window.addEventListener('resize', layout);
  window.addEventListener('pagehide', () => { abandonIfMidLevel(); flush(); });
  board.addEventListener('contextmenu', e => e.preventDefault());
  $('startPlayBtn').addEventListener('click', () => {
    sfx('ui');
    save.introSeen = true;
    persist();
    hideOverlay('startOverlay');
    setTimeout(() => $('board').focus(), 100);
  });
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
    save.settings = Object.assign({ sfx: 1, music: 0.5, haptics: true, colorblind: false, autoAdvance: true, reminder: false, alarm: false }, loaded.settings);
    save.hints = Object.assign({ day: '', left: HINT_TOKENS_PER_DAY }, loaded.hints);
  }
  await loadDaily();
  await initAnalytics();
  applySettings();
  wire();
  wireSettings();
  wirePro();
  layout();
  const startAt = Math.min(Math.min(save.unlocked, save.pro ? LEVELS.length : FREE_LEVELS), LEVELS.length) - 1;
  loadLevel(Math.max(0, startAt));
  startMenuMusic();
  // Show intro on first play
  if(!save.introSeen){
    showOverlay('startOverlay');
    setTimeout(() => $('startPlayBtn').focus(), 100);
  }
})();
