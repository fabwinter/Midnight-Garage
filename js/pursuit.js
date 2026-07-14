/* Pursuit mode (HEIST-2-PLAN M2): real-time countdown timer, pause logic, audio ticking.
   Clock arms on level load, starts on first move. Pause ("Lay Low") costs a limited
   resource (2 per attempt); backgrounding auto-consumes a pause if any remain. */

export const PURSUIT_BUDGET = {
  base: 20,  // seconds
  perMove: [12, 10, 9, 8],  // per-chapter multipliers: chapters 1–4
};

let clockActive = false;
let clockRunning = false;
let timeRemaining = 0;
let pausesUsed = 0;
let maxPauses = 2;
let tickingAudio = null;
let lastTickTime = 0;
let lastTickSoundTime = 0;  // tracks when last tick sound played

export function initPursuit(){
  // Set up visibility change handler for pause auto-consumption
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function armClock(par, chapterIdx){
  clockActive = true;
  clockRunning = false;
  pausesUsed = 0;
  const budget = Math.ceil((PURSUIT_BUDGET.base + par * PURSUIT_BUDGET.perMove[chapterIdx]) * 1000);
  timeRemaining = budget;
  lastTickTime = Date.now();
  updateClockDisplay();
}

export function startClock(){
  if(!clockActive) return;
  clockRunning = true;
  animate();
}

export function stopClock(){
  clockRunning = false;
}

export function pauseClock(){
  if(!clockActive || pausesUsed >= maxPauses) return false;
  clockRunning = false;
  pausesUsed++;
  updateClockDisplay();
  return true;
}

export function resumeClock(){
  if(!clockActive) return;
  clockRunning = true;
  lastTickTime = Date.now();  // reset animation loop
  animate();
}

export function isPausedOut(){
  return pausesUsed >= maxPauses;
}

export function getTimeLeft(){
  return Math.max(0, Math.ceil(timeRemaining / 1000));
}

export function getPausesLeft(){
  return maxPauses - pausesUsed;
}

export function isClockRunning(){
  return clockRunning;
}

function handleVisibilityChange(){
  if(document.hidden && clockActive && clockRunning && pausesUsed < maxPauses){
    pauseClock();
  }
}

function animate(){
  if(!clockRunning) return;
  const now = Date.now();
  const elapsed = now - lastTickTime;
  lastTickTime = now;
  timeRemaining -= elapsed;

  if(timeRemaining <= 0){
    timeRemaining = 0;
    clockRunning = false;
    stopTickingAudio();
    return;
  }

  updateClockDisplay();

  // Tick audio in last 10 seconds
  const secondsLeft = getTimeLeft();
  if(secondsLeft <= 10){
    playTick(secondsLeft);
  } else {
    stopTickingAudio();
  }

  requestAnimationFrame(animate);
}

function updateClockDisplay(){
  const chip = document.getElementById('hudPursuitRow');
  if(!chip) return;

  const secs = getTimeLeft();
  const mins = Math.floor(secs / 60);
  const displayStr = `${mins}:${String(secs % 60).padStart(2, '0')}`;

  const timeEl = document.getElementById('hudPursuitTime');
  if(timeEl) timeEl.textContent = displayStr;

  const pausesEl = document.getElementById('pursuitPauses');
  if(pausesEl){
    pausesEl.innerHTML = Array(maxPauses).fill(0).map((_, i) =>
      `<span class="pause-pip ${i < pausesUsed ? 'used' : ''}"></span>`
    ).join('');
  }

  // Pulse red in last 10 seconds
  if(secs <= 10){
    chip.classList.add('critical');
  } else {
    chip.classList.remove('critical');
  }
}

function playTick(secondsLeft){
  const now = Date.now();
  // One tick per second in last 10s
  if(now - lastTickSoundTime < 900) return;
  lastTickSoundTime = now;

  // Intensity increases as time runs out: higher frequency, shorter interval
  // At 10s: ~600Hz, low urgency. At 0s: ~900Hz, high urgency
  const freq = 600 + (10 - secondsLeft) * 30;
  playPursuitTick(freq);
}

function stopTickingAudio(){
  // Ticking audio is synthesized, nothing to stop
}

function playPursuitTick(frequency){
  const AC = typeof window !== 'undefined' && window.AudioContext ? new window.AudioContext() : null;
  if(!AC) return;
  const c = AC;
  const t = c.currentTime;

  // Quick beep: rising pitch for urgency
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(frequency, t);
  o.frequency.linearRampToValueAtTime(frequency + 100, t + 0.08);

  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + 0.1);
}

export function resetPursuit(){
  clockActive = false;
  clockRunning = false;
  pausesUsed = 0;
  timeRemaining = 0;
  stopTickingAudio();
}
