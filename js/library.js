/* Admin asset library (NEXT-PLAN admin tooling): a persisted, runtime
   override layer on top of art.js's hardcoded SEDAN_PHOTOS/TRUCK_PHOTOS/
   TRAILER_PHOTOS and collection.js's per-car skin.photo — so an admin can
   add, edit, or delete vehicle art (and assign hero art per job-car)
   entirely from the Sandbox's Library panel, with no code change or
   redeploy needed for it to show up in play. This is what lets Claude Code
   step out of "add/remove a car" busywork going forward.

   Storage: one JSON blob in the existing save/localStorage system
   (js/storage.js) — same mechanism as everything else this app persists,
   just a different key so it survives independently of the player's save.
   Every mutating call here re-persists and bumps `version`, which art.js/
   collection.js read to know their cached combined-photo-list needs
   rebuilding (see bucketSequence's cache key in art.js). */

import { load, store } from './storage.js';

const KEY = 'library_v1';

let LIB = {
  sedans: [],       // { img, color, fixed, hue } — same shape as art.js's SEDAN_PHOTOS entries
  trucks: [],       // same shape as TRUCK_PHOTOS
  trailers: [],     // { img, color } — trailers never recolor
  disabledBase: [], // img paths from the hardcoded base arrays to hide from rotation
  heroPhotos: {},   // carId -> img (overrides that car's skin.photo)
};
let version = 0;

export async function loadLibrary(){
  const saved = await load(KEY);
  if(saved) LIB = Object.assign(LIB, saved);
  version++;
  return LIB;
}

export function getLibrary(){ return LIB; }
export function libraryVersion(){ return version; }

async function persist(){
  version++;
  await store(KEY, LIB);
}

export async function addAsset(category, entry){
  LIB[category].push(entry);
  await persist();
}

export async function updateAsset(category, index, patch){
  if(!LIB[category][index]) return;
  Object.assign(LIB[category][index], patch);
  await persist();
}

// A full replace, not a merge — for when the whole entry (img/color/
// fixed/hue) is being recomputed from scratch (the "Edit" flow re-running
// the image pipeline). updateAsset's Object.assign is right for a partial
// patch like Rename's {color}, but wrong here: toggling "Fixed" off during
// an edit needs the old entry's stale `fixed: true` key gone, not merged
// alongside a new `hue`, which Object.assign alone can't do.
export async function replaceAsset(category, index, entry){
  if(!LIB[category][index]) return;
  LIB[category][index] = entry;
  await persist();
}

export async function removeAsset(category, index){
  LIB[category].splice(index, 1);
  await persist();
}

export async function setBaseDisabled(img, disabled){
  LIB.disabledBase = LIB.disabledBase.filter(i => i !== img);
  if(disabled) LIB.disabledBase.push(img);
  await persist();
}

export async function setHeroPhoto(carId, img){
  LIB.heroPhotos[carId] = img;
  await persist();
}

export async function clearHeroPhoto(carId){
  delete LIB.heroPhotos[carId];
  await persist();
}

/* Wipes the whole library back to empty — the intended step right after
   Export Library's JSON has been promoted into the codebase for real (see
   tools/promote-library.mjs): once those assets exist as committed base
   entries, leaving them in the browser's override layer too would show
   every promoted car twice once the new code deploys. */
export async function resetLibrary(){
  LIB = { sedans: [], trucks: [], trailers: [], disabledBase: [], heroPhotos: {} };
  await persist();
}

export function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Same as loadImageFromFile, but for an asset that's already in the library
// (its img is a data: URL string already, not a File) — used by the "Edit"
// flow on an existing card, which re-opens that asset in the same
// add-form/preview pipeline as a fresh upload.
export function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not decode image'));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

/* A real phone photo can be 12+ megapixels; renderToCanvas's own
   previewMaxDim guards each individual render call, but resampling from a
   full-resolution source is itself the expensive part of drawImage (cost
   scales with the SOURCE'S pixel count, not just the destination size) —
   paid on every single slider tick/drag frame if the caller keeps handing
   it the native image. Downscaling once, right after the file loads, and
   reusing that small canvas as the live-preview source for every
   subsequent render (only the final commit uses the true native-res
   image) turns a resample-every-frame cost into a resample-once cost. */
export function downscaleForPreview(img, maxDim = 1000){
  if(Math.max(img.width, img.height) <= maxDim) return img;
  const s = maxDim / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

/* Connected-region flood fill from every border pixel, same idea as the
   cv2 tolerance flood-fill this project's hand-processed photos were cut
   out with (see art.js's asset-history notes) — samples the background
   colour from the top-left corner, then only erases pixels that are both
   within `tolerance` of it AND reachable from the border without crossing
   a non-background pixel. That second part matters: a naive "erase every
   pixel close to this colour" would eat into the car itself wherever its
   paint happens to be a similar shade, exactly the kind of mistake a real
   flood fill (stopping at the car's silhouette) doesn't make. Only
   sensible for a solid/near-solid backdrop — a busy or gradient
   background won't cut cleanly, same limitation the Python pipeline had. */
function floodFillBackground(imageData, width, height, tolerance = 32){
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const br = data[0], bg = data[1], bb = data[2];
  const stack = [];
  for(let x = 0; x < width; x++){ stack.push(x, 0, x, height - 1); }
  for(let y = 0; y < height; y++){ stack.push(0, y, width - 1, y); }
  while(stack.length){
    const y = stack.pop(), x = stack.pop();
    if(x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if(visited[vi]) continue;
    visited[vi] = 1;
    const i = vi * 4;
    if(data[i + 3] === 0) continue;   // already transparent, nothing to spread from
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    if(Math.sqrt(dr * dr + dg * dg + db * db) > tolerance) continue;   // reached the car — stop here
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

/* Rotates a canvas/image by `degrees` about its own center onto a new,
   larger canvas sized to the rotated bounding box (so corners aren't
   clipped) — the margin outside the original rectangle is transparent,
   same as any photo-editor's rotate. */
function rotateCanvas(src, degrees){
  const rad = degrees * Math.PI / 180;
  const w = src.width, h = src.height;
  const newW = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) || 1;
  const newH = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = newW; canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
  return canvas;
}

/* Brightness/contrast/saturation/hue-shift, done as manual per-pixel math
   rather than canvas ctx.filter — canvas 2D `filter` turned out to be a
   silent no-op on at least one real device/browser this shipped to (only
   colorize, which uses globalCompositeOperation instead, actually showed
   any change), so this reimplements the same four adjustments using only
   plain getImageData/putImageData arithmetic — the same primitive
   floodFillBackground already relies on successfully. Saturation and
   hue-rotate are both linear 3x3 colour-matrix transforms — the exact
   matrices below are the exact ones from the CSS Filter Effects spec
   (equivalent to SVG's feColorMatrix type="saturate"/"hueRotate"), so the
   result matches what ctx.filter was supposed to produce. */
function saturateMatrix(sPct){
  const s = sPct / 100;
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

function hueRotateMatrix(deg){
  const a = deg * Math.PI / 180, cosA = Math.cos(a), sinA = Math.sin(a);
  return [
    [0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928],
    [0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.140, 0.072 - cosA * 0.072 - sinA * 0.283],
    [0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072],
  ];
}

function multiplyColorMatrices(a, b){
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for(let i = 0; i < 3; i++) for(let j = 0; j < 3; j++){
    let sum = 0;
    for(let k = 0; k < 3; k++) sum += a[i][k] * b[k][j];
    r[i][j] = sum;
  }
  return r;
}

// Applies brightness, then contrast, then the combined saturate+hue-rotate
// matrix, in place — the same order the old ctx.filter string used, so
// visual results stay consistent with what was intended.
function applyColorAdjustments(imageData, { brightness, contrast, saturation, hue }){
  const needsBrightness = brightness !== 100;
  const needsContrast = contrast !== 100;
  const needsMatrix = saturation !== 100 || hue !== 0;
  if(!needsBrightness && !needsContrast && !needsMatrix) return;

  const bFactor = brightness / 100;
  const cFactor = contrast / 100;
  const matrix = needsMatrix ? multiplyColorMatrices(hueRotateMatrix(hue), saturateMatrix(saturation)) : null;

  const data = imageData.data;
  for(let i = 0; i < data.length; i += 4){
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if(needsBrightness){ r *= bFactor; g *= bFactor; b *= bFactor; }
    if(needsContrast){ r = (r - 127.5) * cFactor + 127.5; g = (g - 127.5) * cFactor + 127.5; b = (b - 127.5) * cFactor + 127.5; }
    if(matrix){
      const nr = matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b;
      const ng = matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b;
      const nb = matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b;
      r = nr; g = ng; b = nb;
    }
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

/* True "colorize" (as opposed to the hue-rotate filter, which just spins
   existing hues around and leaves multi-colored source art multi-colored):
   flattens every opaque pixel onto one target hue/chroma while keeping its
   original luminance, via the canvas spec's 'color' blend mode — blending
   a solid HSL fill over the image at reduced alpha gives a 0-100 "amount"
   dial between the original photo and the fully colorized result. */
function applyColorize(ctx, w, h, hueDeg, amount){
  if(amount <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(100, amount)) / 100;
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = `hsl(${((hueDeg % 360) + 360) % 360}, 65%, 50%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* Renders a loaded image onto the app's established per-category canvas
   size (cars 800x400, trucks 1200x400 — matching every hand-processed
   asset already in the library, so an admin upload behaves the same way
   at runtime instead of shipping at whatever resolution/fit the source
   photo happened to have — a real regression this app hit once already,
   see git history on the hero-* asset resize). scalePercent controls how
   full the fit box is (100 = fills it, matching the old "fit" behaviour;
   above 100 zooms in / crops, since the draw target is a fixed-size
   canvas). stretchX/stretchY apply an independent, centered non-uniform
   multiplier on top of that fit — the "transform handles" in the preview
   drag these two directly instead of going through a slider. Returns a
   canvas, not a data URL yet, so the caller can re-render live as the
   admin drags any slider or handle, only encoding to PNG once they
   actually commit it. If `rectOut` is passed, it's mutated with the final
   {x,y,w,h} placement (in this canvas's own pixel space) so the caller can
   position on-screen transform handles around it.

   `previewMaxDim`, if set, downscales the source before running any of
   the pipeline below — the live preview only ever displays at this
   function's fixed target size (800x400/1200x400), so there's no benefit
   to running a full-resolution flood-fill + canvas filter chain on every
   slider drag tick against a source that might be a 12-megapixel phone
   photo. That was the actual cause of "sliders do nothing": on a
   memory/CPU-constrained mobile browser, repeatedly reprocessing a huge
   image on every touch-drag 'input' event could silently fail partway
   through (an exception the caller never saw), leaving the canvas stuck
   on whatever last render happened to succeed while the slider labels
   kept right on updating. The one-time "Add to library" commit still
   renders at full native resolution (no previewMaxDim) for a crisp edge,
   since that only happens once, not on every drag tick.

   Pipeline order matters: colour correction and colorize run first (so
   background-removal's corner-colour sample sees the corrected colours,
   not the original ones), then background removal (before any downscale,
   so the cutout edge stays crisp instead of picking up a blurry
   half-transparent halo), then rotate (so a removed background leaves the
   new corners cleanly transparent instead of smearing solid backdrop
   colour into them), then the final fit/scale/stretch. */
export function renderToCanvas(img, category, opts = {}, rectOut){
  const {
    removeBackground = false,
    tolerance = 32,
    scalePercent = 97,
    rotate = 0,
    brightness = 100,
    contrast = 100,
    saturation = 100,
    hue = 0,
    colorizeHue = 0,
    colorizeAmount = 0,
    stretchX = 100,
    stretchY = 100,
    previewMaxDim = 0,
  } = opts;
  const [W, H] = category === 'trucks' ? [1200, 400] : [800, 400];

  let srcW = img.width, srcH = img.height;
  if(previewMaxDim && Math.max(srcW, srcH) > previewMaxDim){
    const s = previewMaxDim / Math.max(srcW, srcH);
    srcW = Math.max(1, Math.round(srcW * s));
    srcH = Math.max(1, Math.round(srcH * s));
  }

  const work = document.createElement('canvas');
  work.width = srcW; work.height = srcH;
  const wctx = work.getContext('2d');
  wctx.drawImage(img, 0, 0, srcW, srcH);
  if(brightness !== 100 || contrast !== 100 || saturation !== 100 || hue !== 0){
    const imageData = wctx.getImageData(0, 0, work.width, work.height);
    applyColorAdjustments(imageData, { brightness, contrast, saturation, hue });
    wctx.putImageData(imageData, 0, 0);
  }
  applyColorize(wctx, work.width, work.height, colorizeHue, colorizeAmount);

  if(removeBackground){
    const imageData = wctx.getImageData(0, 0, work.width, work.height);
    floodFillBackground(imageData, work.width, work.height, tolerance);
    wctx.putImageData(imageData, 0, 0);
  }

  const rotated = rotate ? rotateCanvas(work, rotate) : work;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const frac = Math.max(10, Math.min(400, scalePercent)) / 100;
  const fitScale = Math.min((W * frac) / rotated.width, (H * frac) / rotated.height);
  const sx = Math.max(10, Math.min(400, stretchX)) / 100;
  const sy = Math.max(10, Math.min(400, stretchY)) / 100;
  const w = rotated.width * fitScale * sx, h = rotated.height * fitScale * sy;
  const x = (W - w) / 2, y = (H - h) / 2;
  ctx.drawImage(rotated, x, y, w, h);
  if(rectOut) Object.assign(rectOut, { x, y, w, h });
  return canvas;
}
