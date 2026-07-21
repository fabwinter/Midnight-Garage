/* Audio (plan items 0.4/0.5/0.8): WebAudio SFX from the prototype plus
   licensed music tracks (menu, settings, per-mode attempt track), each
   behind independent volume sliders. The native shell configures the
   audio session to respect the silent switch and mix with user music
   (see capacitor notes in README). */

let AC = null;
let sfxVol = 1;
let musicVol = 0;

// Per-mode attempt track — a pool per mode so repeat attempts don't always
// hear the same loop. Add more files to a pool any time; nothing else needs
// to change.
let gameMode = 'heist';    // 'relaxed' | 'heist' | 'pursuit'
let attemptAudio = null;
let attemptTrackSrc = null;
let attemptActive = false; // true only while a level attempt is in progress
let duckAttempt = false;   // true while menu/tab music has priority over the attempt track
const TRACK_POOLS = {
  heist: ['assets/audio/midnight-in-the-vault.mp3'],
  pursuit: [
    'assets/audio/pursuit-1.mp3',
    'assets/audio/pursuit-2.mp3',
    'assets/audio/pursuit-3.mp3',
    'assets/audio/pursuit-4.mp3',
  ],
  // Instrumental, lower-intensity cousins of the Heist/Pursuit pool — no
  // countdown/budget pressure in this mode, so the music shouldn't imply
  // any either. Same shuffle-without-repeat treatment as Pursuit's pool.
  relaxed: [
    'assets/audio/relaxed-velvet-drift.mp3',
    'assets/audio/relaxed-velvet-midnight-loop.mp3',
    'assets/audio/relaxed-glassroom-stroll.mp3',
    'assets/audio/relaxed-velvet-after-midnight.mp3',
    'assets/audio/relaxed-velvet-after-hours.mp3',
  ],
};
const lastPick = { heist: null, pursuit: null, relaxed: null };   // avoids back-to-back repeats
let curAttemptTrack = null;   // the src chosen for the attempt in progress — stable across duck/resume
const warmed = new Set();     // srcs already nudged to preload, so a pool only warms once per session

/* Relaxed has no per-level tension arc (no alarm budget, no countdown) —
   its music is a continuous, session-long playlist, not a per-attempt
   track. attemptContinuous marks that the current track belongs to that
   playlist: startAttemptTrack() won't cut it off or restart it at a level
   boundary (win/retry/reset/next), and ensureAttemptAudio() lets it play to
   its own natural end (loop=false) and auto-advance to the next pool pick
   instead of looping — see advanceContinuousTrack. continuousPoolMode
   records which TRACK_POOLS key to keep drawing from. */
let attemptContinuous = false;
let continuousPoolMode = null;

/* Picks a new track for a fresh attempt (called from startAttemptTrack
   only — resumeAttemptTrack reuses curAttemptTrack so ducking out to a
   menu and back doesn't swap the song mid-attempt). Never repeats the
   immediately-previous pick when the pool has more than one track. */
function pickTrack(mode){
  const pool = TRACK_POOLS[mode];
  if(!pool || !pool.length) return null;
  if(pool.length === 1) return pool[0];
  let pick;
  do{ pick = pool[Math.floor(Math.random() * pool.length)]; }while(pick === lastPick[mode]);
  lastPick[mode] = pick;
  return pick;
}

/* Nudges the browser to start fetching/buffering every track in a mode's
   pool ahead of an actual attempt. Pursuit shuffles across 4 different
   files (unlike Heist's single, quickly-warm-cached track), so on a slow
   connection the very first attempt after switching to Pursuit can pick a
   track that's still mid-download when the (often short, timer-driven)
   attempt already ends — this makes that "silent because it never
   finished loading" case rare instead of routine. Fire-and-forget: these
   elements are never played, just left to buffer in the background. */
function warmPool(mode){
  const pool = TRACK_POOLS[mode];
  if(!pool) return;
  for(const src of pool){
    if(warmed.has(src)) continue;
    warmed.add(src);
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = 0;
    a.load();
  }
}

/* Plays `audio`, retrying on the next pointerdown/keydown if the browser's
   autoplay policy rejects the call (a real, common failure mode — the very
   first playback attempt on a page often has no qualifying user gesture in
   its call stack yet, e.g. a level that loads underneath an overlay before
   the player has tapped anything). Without a retry, a rejected play() was
   simply silent forever for that attempt. `isStale()` guards against a
   delayed retry (or a delayed resolve of `audio.play()` itself) reviving
   an element that's no longer the current attempt/menu track — e.g. the
   player backed out or switched levels while a retry was still pending. */
function playWithRetry(audio, targetVol, fadeMs, isStale, onPlaying){
  const attempt = () => {
    if(isStale && isStale()) return;
    audio.play().then(() => {
      if(isStale && isStale()){ audio.pause(); return; }
      fadeIn(audio, targetVol, fadeMs);
      if(onPlaying) onPlaying();
    }).catch(() => {
      document.addEventListener('pointerdown', attempt, { once: true });
      document.addEventListener('keydown', attempt, { once: true });
    });
  };
  attempt();
}

// Menu/theme music
let menuAudio = null;
let settingsAudio = null;
const VELVET_GLOVE = 'assets/audio/velvet-glove.mp3';
const CLEAN_GETAWAY = 'assets/audio/clean-getaway.mp3';

/* The Settings "Play" button is a deliberate, full-length listen to the
   theme — distinct from menuAudio's ambient pre-intro loop of the same
   file, so it gets its own element rather than fighting over one Audio's
   .loop flag and playback position. themePlaying is checked everywhere the
   attempt track would otherwise resume/start, so the theme keeps sole
   possession of the foreground even after Settings is closed and the
   player goes back to Heist/Pursuit/Relaxed; it only hands off (to the
   attempt track if a level's in progress, else the ambient loop) once the
   song actually ends or is stopped — see handOffAfterTheme. */
let themeAudio = null;
let themePlaying = false;
export function isThemePlaying(){ return themePlaying; }

export function setSfxVolume(v){ sfxVol = v; }
export function setMusicVolume(v){
  musicVol = v;
  if(menuAudio) menuAudio.volume = Math.max(0, Math.min(1, v * 0.7));
  if(settingsAudio) settingsAudio.volume = Math.max(0, Math.min(1, v * 0.7));
  if(themeAudio && themePlaying) themeAudio.volume = Math.max(0, Math.min(1, v * 0.7));
  if(attemptAudio && !duckAttempt){
    attemptAudio.volume = Math.max(0, Math.min(1, v));
    if(v === 0) attemptAudio.pause();
    else if(attemptActive && attemptAudio.paused){
      const a = attemptAudio;
      playWithRetry(a, Math.max(0, Math.min(1, v)), 200, () => a !== attemptAudio || duckAttempt);
    }
  }
}

export function setGameMode(mode){
  gameMode = mode;
  warmPool(mode);
}

function ensureAttemptAudio(src){
  if(!attemptAudio || attemptTrackSrc !== src){
    // Fade the old pick out instead of hard .pause()-ing it — a retry
    // that lands on a different pool track (routine for Pursuit's
    // 4-track shuffle) used to cut the old track dead silent on this
    // same line, before the new one had buffered enough to be audible:
    // a real, measurable gap. Now the two genuinely overlap.
    const stale = attemptAudio;
    if(stale){ stale.onended = null; fadeOut(stale, 300).then(() => { stale.pause(); stale.currentTime = 0; }); }
    attemptAudio = new Audio(src);
    attemptAudio.preload = 'auto';
    // Heist/Pursuit: loop the single attempt track for as long as this one
    // attempt runs (stopAttemptTrack ends it on win/bust). Relaxed: play
    // once and hand off to the next pool pick on natural end instead — see
    // advanceContinuousTrack.
    attemptAudio.loop = !attemptContinuous;
    attemptAudio.onended = attemptContinuous ? advanceContinuousTrack : null;
    attemptAudio.volume = 0;
    attemptTrackSrc = src;
  }
  return attemptAudio;
}

/* Called at every level load (fresh level, next-after-win, retry, reset).
   For Heist/Pursuit this picks a fresh track from the mode's pool (never
   the same one twice in a row) and restarts it from the top, same as
   always. For Relaxed, music is a continuous session-long playlist rather
   than a per-level attempt track (see attemptContinuous above) — a level
   boundary must never cut it off or restart it, so this is a no-op
   whenever a Relaxed track is already playing; it only picks+starts one
   the first time (a fresh session, or switching into Relaxed from another
   mode). Stays silent while a tab/menu track has priority (duckAttempt);
   resumeAttemptTrack picks it up once that track closes. Whatever's
   currently audible (the opening/menu theme, most often) keeps playing
   until THIS track actually starts, then hands off — see
   crossfadeOutOtherTracks — so there's never a silent gap between them. */
export function startAttemptTrack(mode){
  attemptActive = true;
  if(mode === 'relaxed' && attemptContinuous && attemptAudio && !attemptAudio.paused
     && TRACK_POOLS.relaxed.includes(attemptTrackSrc)){
    return;
  }
  attemptContinuous = mode === 'relaxed';
  continuousPoolMode = mode;
  curAttemptTrack = pickTrack(mode);
  const src = curAttemptTrack;
  if(!src) return;
  ensureAttemptAudio(src);
  if(duckAttempt) return;
  const a = attemptAudio;
  a.currentTime = 0;
  if(musicVol > 0){
    playWithRetry(a, Math.max(0, Math.min(1, musicVol)), 300,
      () => a !== attemptAudio || duckAttempt || !attemptActive,
      crossfadeOutOtherTracks);
  }
}

/* Relaxed-only: fires when the current playlist track reaches its own
   natural end. Picks the next track (never repeating the one that just
   played) and crossfades into it — the playlist keeps going indefinitely,
   independent of whatever level is loaded, until something actually stops
   it (switching modes, muting, or a genuine stopAttemptTrack). */
function advanceContinuousTrack(){
  if(!attemptContinuous || !attemptActive || duckAttempt) return;
  const next = pickTrack(continuousPoolMode);
  if(!next) return;
  curAttemptTrack = next;
  const a = ensureAttemptAudio(next);
  a.currentTime = 0;
  if(musicVol > 0){
    playWithRetry(a, Math.max(0, Math.min(1, musicVol)), 600, () => a !== attemptAudio || duckAttempt || !attemptActive);
  }
}

/* Hands the foreground to whichever attempt/menu track just started
   playing by fading out whatever else is still audible — called only once
   the new track is confirmed actually playing, not merely requested, so
   the old one never drops to silence before the new one is heard. */
function crossfadeOutOtherTracks(){
  if(menuAudio && !menuAudio.paused){
    fadeOut(menuAudio, 500).then(() => { menuAudio.pause(); menuAudio.currentTime = 0; });
  }
}

/* Called the moment an attempt ends — win, busted, or navigating away. */
export function stopAttemptTrack(){
  attemptActive = false;
  if(attemptAudio && !attemptAudio.paused){
    fadeOut(attemptAudio, 400).then(() => {
      attemptAudio.pause();
      attemptAudio.currentTime = 0;
    });
  }
}

/* Temporarily silences the attempt track so a tab/menu track can play alone;
   resumeAttemptTrack() picks it back up from where it paused. Also used
   directly by the Pursuit pause button (same "hand back the foreground
   later" semantics as a closed tab). */
export function duckAttemptTrack(){
  duckAttempt = true;
  if(attemptAudio && !attemptAudio.paused){
    fadeOut(attemptAudio, 300).then(() => { if(duckAttempt) attemptAudio.pause(); });
  }
}

export function resumeAttemptTrack(){
  // The theme song (Settings' "Play" button) owns the foreground until it
  // ends or is manually stopped — see handOffAfterTheme, which is what
  // actually calls this once that's true. A tab closing in the meantime
  // (e.g. Settings, with the theme still going) must not prematurely hand
  // the attempt track back early and double up on the theme.
  if(themePlaying) return;
  duckAttempt = false;
  if(!attemptActive) return;
  ensureAttemptAudio(curAttemptTrack);   // same track this attempt already picked — no re-roll on resume
  if(attemptAudio.paused && musicVol > 0){
    const a = attemptAudio;
    playWithRetry(a, Math.max(0, Math.min(1, musicVol)), 300, () => a !== attemptAudio || duckAttempt || !attemptActive);
  }
}

/* Menu music playback with fade-in/fade-out. Never competes with a live
   attempt track (any mode) — that track already owns the foreground. */
export function startMenuMusic(){
  if(themePlaying) return;   // theme song has exclusive foreground — see resumeAttemptTrack
  // Checked against actual playback, not the `attemptActive` flag: Heist
  // now marks an attempt active immediately at level load (before the
  // player has necessarily interacted at all — see startBoard), so on a
  // fresh boot the attempt track is typically still pending its own
  // autoplay-gesture retry. Gating on the flag left the opening theme
  // refusing to ever start whenever Heist was the current mode. Once the
  // attempt track genuinely IS playing, crossfadeOutOtherTracks already
  // fades this one out, so the "don't play both" property still holds.
  if(attemptAudio && !attemptAudio.paused) return;
  if(!menuAudio){
    menuAudio = new Audio(VELVET_GLOVE);
    menuAudio.preload = 'auto';
    menuAudio.loop = true;
    menuAudio.volume = 0;
  }
  if(menuAudio.paused || menuAudio._fadeInterval){
    stopSettingsMusic();
    // Only jump back to the start on a genuine stop. A call arriving mid
    // fade-out (e.g. reversing before it's fully silent) should just
    // reverse into a fade-in from wherever the volume currently is, not
    // restart playback position too.
    if(menuAudio.paused){
      menuAudio.currentTime = 0;
      menuAudio.play().catch(() => {});
    }
    fadeIn(menuAudio, musicVol * 0.7, 800);
  }
}

export function stopMenuMusic(){
  if(menuAudio && !menuAudio.paused){
    fadeOut(menuAudio, 800).then(() => {
      menuAudio.pause();
      menuAudio.currentTime = 0;
    });
  }
}

/* Settings/theme menu music. Ducks the attempt track while a tab is open so
   the two never sound at once; closing the tab (stopSettingsMusic) hands
   the foreground back to whichever track should be playing. */
export function playSettingsMusic(){
  if(themePlaying) return;   // theme song has exclusive foreground — see toggleThemePlayer
  if(!settingsAudio){
    settingsAudio = new Audio(CLEAN_GETAWAY);
    settingsAudio.preload = 'auto';
    settingsAudio.loop = false;
    settingsAudio.volume = 0;
  }
  if(settingsAudio.paused){
    stopMenuMusic();
    duckAttemptTrack();
    settingsAudio.currentTime = 0;
    settingsAudio.play().catch(() => {});
    fadeIn(settingsAudio, musicVol * 0.7, 600);
  }
}

export function stopSettingsMusic(){
  if(settingsAudio && !settingsAudio.paused){
    fadeOut(settingsAudio, 400).then(() => {
      settingsAudio.pause();
      settingsAudio.currentTime = 0;
    });
  }
  // A no-op while the theme song is playing — see resumeAttemptTrack.
  resumeAttemptTrack();
}

/* Once the theme song actually stops (natural end or the player pressing
   Pause), hand the foreground to whatever should be making sound now: the
   attempt track if a level is in progress (any of Heist/Pursuit/Relaxed —
   this also covers the player having left Settings and started playing
   again while the song kept going), otherwise the ambient menu loop. */
function handOffAfterTheme(){
  themePlaying = false;
  if(attemptActive) resumeAttemptTrack();
  else startMenuMusic();
}

/* The Settings "Play" button: a deliberate full listen to the theme, not
   ambient backing music — so unlike startMenuMusic's loop, this plays the
   song once through and silences everything else (menu loop, settings
   jingle, the current mode's attempt track) for its whole length, exactly
   as if it were its own attempt track with nothing to duck for. Closing
   Settings and going to play Heist/Pursuit/Relaxed does NOT cut it short
   (see the themePlaying guards on resumeAttemptTrack/startMenuMusic/
   playSettingsMusic above) — it keeps playing across that navigation and
   only hands off once it actually ends or is paused. Returns the new
   playing state so the caller can swap the button's icon. */
export function toggleThemePlayer(){
  if(themePlaying){
    themeAudio.onended = null;
    fadeOut(themeAudio, 300).then(() => themeAudio.pause());
    handOffAfterTheme();
    return false;
  }
  if(!themeAudio){
    themeAudio = new Audio(VELVET_GLOVE);
    themeAudio.preload = 'auto';
    themeAudio.loop = false;
  }
  themePlaying = true;
  stopMenuMusic();
  duckAttemptTrack();   // silences the current mode's attempt track for the song's whole length
  if(settingsAudio && !settingsAudio.paused){ settingsAudio.pause(); settingsAudio.currentTime = 0; }
  themeAudio.currentTime = 0;
  themeAudio.volume = 0;
  themeAudio.onended = handOffAfterTheme;
  playWithRetry(themeAudio, Math.max(0, Math.min(1, musicVol * 0.7)), 300, () => !themePlaying);
  return true;
}

/* Fade helpers for smooth volume transitions. Each audio element tracks its
   own in-flight interval so a new fade always cancels a stale one instead
   of fighting over .volume (e.g. rapid tab open/close). */
function clearFade(audio){
  if(audio._fadeInterval){ clearInterval(audio._fadeInterval); audio._fadeInterval = null; }
}

function fadeIn(audio, targetVol, ms){
  clearFade(audio);
  const startVol = audio.volume;
  const steps = Math.ceil(ms / 16);
  let step = 0;
  audio._fadeInterval = setInterval(() => {
    audio.volume = startVol + (targetVol - startVol) * (step / steps);
    if(++step >= steps){
      audio.volume = targetVol;
      clearFade(audio);
    }
  }, 16);
}

function fadeOut(audio, ms){
  clearFade(audio);
  return new Promise(resolve => {
    const startVol = audio.volume;
    const steps = Math.ceil(ms / 16);
    let step = 0;
    audio._fadeInterval = setInterval(() => {
      audio.volume = startVol * (1 - step / steps);
      if(++step >= steps){
        audio.volume = 0;
        clearFade(audio);
        resolve();
      }
    }, 16);
  });
}

function ac(){
  if(!AC){
    try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
  }
  if(AC && AC.state === 'suspended') AC.resume();
  return AC;
}

function env(g, t, a, d, peak){
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak * sfxVol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

export function sfx(kind){
  if(sfxVol <= 0) return;
  const c = ac(); if(!c) return;
  const t = c.currentTime;
  if(kind === 'slide'){
    const buf = c.createBuffer(1, c.sampleRate * 0.09, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.1;
    const g = c.createGain(); env(g, t, 0.005, 0.09, 0.10);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  } else if(kind === 'snap'){
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.07);
    const g = c.createGain(); env(g, t, 0.004, 0.09, 0.22);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.12);
  } else if(kind === 'thud'){
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const g = c.createGain(); env(g, t, 0.003, 0.12, 0.3);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.15);
  } else if(kind === 'deny'){
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 110;
    const g = c.createGain(); env(g, t, 0.004, 0.06, 0.06);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.08);
  } else if(kind === 'ui'){
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 520;
    const g = c.createGain(); env(g, t, 0.003, 0.05, 0.08);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.07);
  } else if(kind === 'win'){
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.5);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = c.createGain(); env(g, t, 0.02, 0.6, 0.12);
    o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + 0.7);
    [0, 4, 7, 12, 16].forEach((st, i) => {
      const tt = t + 0.42 + i * 0.09;
      const oo = c.createOscillator(); oo.type = 'triangle';
      oo.frequency.value = 440 * Math.pow(2, (st - 9) / 12) * 1.5;
      const gg = c.createGain(); env(gg, tt, 0.008, 0.34, 0.14);
      oo.connect(gg).connect(c.destination); oo.start(tt); oo.stop(tt + 0.4);
    });
  } else if(kind === 'star'){
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1180;
    const g = c.createGain(); env(g, t, 0.004, 0.22, 0.1);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25);
  } else if(kind === 'hint'){
    // gentle two-note ping, quieter than 'star' — advice, not reward
    [[880, 0], [1175, 0.09]].forEach(([hz, dt]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
      const g = c.createGain(); env(g, t + dt, 0.005, 0.14, 0.07);
      o.connect(g).connect(c.destination); o.start(t + dt); o.stop(t + dt + 0.18);
    });
  } else if(kind === 'gate'){
    // quick electronic chirp — an interlock gate just changed state
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.07);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = c.createGain(); env(g, t, 0.004, 0.08, 0.08);
    o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + 0.1);
  } else if(kind === 'decouple'){
    // metallic clunk distinct from the every-move 'snap': noise burst + low drop
    const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 2;
    const ng = c.createGain(); env(ng, t, 0.003, 0.06, 0.25);
    src.connect(f).connect(ng).connect(c.destination); src.start(t);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    const g = c.createGain(); env(g, t, 0.004, 0.13, 0.28);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.16);
  } else if(kind === 'fanfare'){
    // car-reveal moment — brighter and longer than 'win', which the win
    // sheet has usually just played seconds earlier
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) => {
      const tt = t + i * 0.11;
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = 523.25 * Math.pow(2, st / 12);
      const g = c.createGain(); env(g, tt, 0.01, i === 6 ? 0.7 : 0.3, 0.13);
      o.connect(g).connect(c.destination); o.start(tt); o.stop(tt + (i === 6 ? 0.8 : 0.36));
    });
    const shimmer = c.createOscillator(); shimmer.type = 'sine'; shimmer.frequency.value = 2093;
    const sg = c.createGain(); env(sg, t + 0.66, 0.02, 0.9, 0.05);
    shimmer.connect(sg).connect(c.destination); shimmer.start(t + 0.66); shimmer.stop(t + 1.6);
  } else if(kind === 'alarmTrigger'){
    // short rising two-note blip — "the alarm just went off"
    [0, 0.12].forEach((dt, i) => {
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(i === 0 ? 660 : 880, t + dt);
      const g = c.createGain(); env(g, t + dt, 0.006, 0.11, 0.16);
      o.connect(g).connect(c.destination); o.start(t + dt); o.stop(t + dt + 0.14);
    });
  } else if(kind === 'busted'){
    // alternating two-tone siren, ~1s — "the police just arrived"
    for(let i = 0; i < 6; i++){
      const dt = i * 0.16;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = i % 2 === 0 ? 500 : 720;
      const g = c.createGain(); env(g, t + dt, 0.01, 0.15, 0.14);
      o.connect(g).connect(c.destination); o.start(t + dt); o.stop(t + dt + 0.17);
    }
  }
}

