/* Audio (plan items 0.4/0.5/0.8): WebAudio SFX from the prototype plus an
   optional ambient garage hum, both behind independent volume sliders.
   The native shell configures the audio session to respect the silent
   switch and mix with user music (see capacitor notes in README). */

let AC = null;
let sfxVol = 1;
let musicVol = 0;
let musicNodes = null;
let alarmMode = false;
let alarmAudio = null;
let alarmActive = false;   // true only while a level attempt is in progress
const ALARM_TRACK = 'assets/audio/midnight-in-the-vault.mp3';

// Menu/theme music
let menuAudio = null;
let settingsAudio = null;
const VELVET_GLOVE = 'assets/audio/velvet-glove.wav';
const CLEAN_GETAWAY = 'assets/audio/clean-getaway.wav';

export function setSfxVolume(v){ sfxVol = v; }
export function setMusicVolume(v){
  musicVol = v;
  if(menuAudio) menuAudio.volume = Math.max(0, Math.min(1, v * 0.7));
  if(settingsAudio) settingsAudio.volume = Math.max(0, Math.min(1, v * 0.7));
  if(alarmMode){
    if(alarmAudio){
      alarmAudio.volume = Math.max(0, Math.min(1, v));
      if(v === 0) alarmAudio.pause();
      else if(alarmActive) alarmAudio.play().catch(() => {});
    }
    return;
  }
  if(v > 0) startMusic();
  if(musicNodes) musicNodes.gain.gain.linearRampToValueAtTime(v * 0.05, ac()?.currentTime + 0.4 || 0);
  if(v === 0) stopMusic();
}

/* Alarm mode swaps the procedural garage hum for a licensed ambient track —
   the "clock is running" cue matters more once a per-move budget is live.
   This only flips which track *would* play; actual start/stop is owned by
   startAlarmTrack/stopAlarmTrack so the music tracks level attempts, not
   menus (plan: alarm music per-attempt, not a persistent background loop). */
export function setAlarmMode(enabled){
  alarmMode = enabled;
  if(enabled){
    stopMusic();
  } else {
    stopAlarmTrack();
    if(musicVol > 0) startMusic();
  }
}

/* Called once per level attempt (level load / reset) — restarts the track
   from the top so every attempt gets a fresh run of the loop. */
export function startAlarmTrack(){
  alarmActive = true;
  if(!alarmMode) return;
  if(!alarmAudio){
    alarmAudio = new Audio(ALARM_TRACK);
    alarmAudio.preload = 'auto';
    alarmAudio.loop = true;
  }
  alarmAudio.currentTime = 0;
  alarmAudio.volume = Math.max(0, Math.min(1, musicVol));
  if(musicVol > 0) alarmAudio.play().catch(() => {});
}

/* Called the moment an attempt ends — win, busted, or navigating away. */
export function stopAlarmTrack(){
  alarmActive = false;
  if(alarmAudio){ alarmAudio.pause(); alarmAudio.currentTime = 0; }
}

/* Menu music playback with fade-in/fade-out. */
export function startMenuMusic(){
  if(!menuAudio){
    menuAudio = new Audio(VELVET_GLOVE);
    menuAudio.preload = 'auto';
    menuAudio.loop = true;
    menuAudio.volume = 0;
  }
  if(menuAudio.paused){
    menuAudio.currentTime = 0;
    menuAudio.play().catch(() => {});
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

/* Settings/theme menu music. */
export function playSettingsMusic(){
  if(!settingsAudio){
    settingsAudio = new Audio(CLEAN_GETAWAY);
    settingsAudio.preload = 'auto';
    settingsAudio.loop = false;
    settingsAudio.volume = 0;
  }
  if(settingsAudio.paused){
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
}

export function toggleThemePlayer(){
  if(!menuAudio) menuAudio = new Audio(VELVET_GLOVE);
  if(menuAudio.paused){
    menuAudio.play().catch(() => {});
    fadeIn(menuAudio, musicVol * 0.7, 300);
  } else {
    fadeOut(menuAudio, 300).then(() => menuAudio.pause());
  }
}

/* Fade helpers for smooth volume transitions. */
function fadeIn(audio, targetVol, ms){
  const steps = Math.ceil(ms / 16);
  let step = 0;
  const interval = setInterval(() => {
    audio.volume = targetVol * (step / steps);
    if(++step >= steps){
      audio.volume = targetVol;
      clearInterval(interval);
    }
  }, 16);
}

function fadeOut(audio, ms){
  return new Promise(resolve => {
    const startVol = audio.volume;
    const steps = Math.ceil(ms / 16);
    let step = 0;
    const interval = setInterval(() => {
      audio.volume = startVol * (1 - step / steps);
      if(++step >= steps){
        audio.volume = 0;
        clearInterval(interval);
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

/* Ambient hum: two detuned saws through a slow-wobbling lowpass. Barely
   there by design; adaptive music (board-state driven) is a v1.5 item. */
function startMusic(){
  if(musicNodes) return;
  const c = ac(); if(!c) return;
  const gain = c.createGain(); gain.gain.value = musicVol * 0.05;
  const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220; filter.Q.value = 2;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
  const lfoGain = c.createGain(); lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(filter.frequency); lfo.start();
  const oscs = [55, 55.4, 110.3].map(freq => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    o.connect(filter); o.start();
    return o;
  });
  filter.connect(gain).connect(c.destination);
  musicNodes = { gain, filter, lfo, oscs };
}

function stopMusic(){
  if(!musicNodes) return;
  try{
    musicNodes.oscs.forEach(o => o.stop());
    musicNodes.lfo.stop();
    musicNodes.gain.disconnect();
  }catch(e){}
  musicNodes = null;
}
