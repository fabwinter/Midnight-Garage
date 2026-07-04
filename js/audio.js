/* Audio (plan items 0.4/0.5/0.8): WebAudio SFX from the prototype plus an
   optional ambient garage hum, both behind independent volume sliders.
   The native shell configures the audio session to respect the silent
   switch and mix with user music (see capacitor notes in README). */

let AC = null;
let sfxVol = 1;
let musicVol = 0;
let musicNodes = null;

export function setSfxVolume(v){ sfxVol = v; }
export function setMusicVolume(v){
  musicVol = v;
  if(v > 0) startMusic();
  if(musicNodes) musicNodes.gain.gain.linearRampToValueAtTime(v * 0.05, ac()?.currentTime + 0.4 || 0);
  if(v === 0) stopMusic();
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
