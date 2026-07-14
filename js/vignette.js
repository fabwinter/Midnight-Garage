/* Vignette system (M6): wordless narrative with animated SVG scenes and pans.
   Five scenes: before Ch.1 (tarp pull), between Ch.1-2 (container), between Ch.2-3
   (shipment), between Ch.3-4 (buyer list), after 200 (dawn garage + credits).
   Each scene is 2-4 SVG panels, optionally panning horizontally or vertically. */

import { vignetteScenes } from './art.js';

let currentScene = null;
let sceneIndex = 0;
let panProgress = 0;
let panAnimFrame = null;

export function showVignette(sceneNum, callback){
  // sceneNum: 0-4 (before Ch.1, Ch.1-2 gap, Ch.2-3 gap, Ch.3-4 gap, after 200)
  if(!vignetteScenes[sceneNum]) return callback?.();
  sceneIndex = sceneNum;
  currentScene = vignetteScenes[sceneNum];
  panProgress = 0;

  const overlay = document.getElementById('vignetteOverlay');
  if(!overlay) return callback?.();

  const canvas = document.getElementById('vignetteCanvas');
  if(!canvas){
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'vignetteCanvas';
    newCanvas.style.cssText = 'display:block;width:100%;height:100%;cursor:pointer;';
    overlay.appendChild(newCanvas);
  }

  overlay.classList.remove('hidden');
  const el = document.getElementById('vignetteCanvas');
  el.width = window.innerWidth;
  el.height = window.innerHeight;

  // Auto-advance or click-to-advance
  const advanceHandler = () => {
    stopVignette();
    callback?.();
  };

  el.addEventListener('click', advanceHandler);
  animateVignette(el, advanceHandler);
}

function animateVignette(canvas, onComplete){
  if(!currentScene) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;

  // Simple animation: fade in, hold, fade out with pan
  const duration = currentScene.duration || 3000; // 3s default
  const startTime = Date.now();

  function frame(){
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Opacity fade: in, hold, out
    if(progress < 0.1) ctx.globalAlpha = progress * 10;
    else if(progress > 0.9) ctx.globalAlpha = (1 - progress) * 10;
    else ctx.globalAlpha = 1;

    drawScene(ctx, currentScene, progress, canvas.width, canvas.height);

    if(progress < 1){
      panAnimFrame = requestAnimationFrame(frame);
    }
  }
  panAnimFrame = requestAnimationFrame(frame);
}

function drawScene(ctx, scene, progress, w, h){
  // Render scene SVG with optional pan
  if(!scene.svg) return;

  // Pan effect: if scene has panning, apply transform
  if(scene.panDir === 'h'){
    const panX = (scene.panDir === 'h') ? -progress * 100 : 0;
    ctx.save();
    ctx.translate(panX, 0);
  }

  // Draw SVG content (placeholder)
  // For now, draw a simple gradient background with scene label
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#1a2333');
  gradient.addColorStop(1, '#0f1419');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Draw scene label
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffb454';
  ctx.font = 'bold 24px Chakra Petch';
  ctx.textAlign = 'center';
  ctx.fillText(scene.label || `Scene ${sceneIndex + 1}`, w / 2, h / 2);

  ctx.restore?.();
}

function stopVignette(){
  if(panAnimFrame) cancelAnimationFrame(panAnimFrame);
  const overlay = document.getElementById('vignetteOverlay');
  if(overlay) overlay.classList.add('hidden');
}

export function resetVignettes(){
  stopVignette();
  currentScene = null;
  sceneIndex = 0;
  panProgress = 0;
}

export function isVignetteActive(){
  return currentScene !== null;
}
