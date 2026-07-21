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

/* Renders a loaded image onto the app's established per-category canvas
   size (cars 800x400, trucks 1200x400 — matching every hand-processed
   asset already in the library, so an admin upload behaves the same way
   at runtime instead of shipping at whatever resolution/fit the source
   photo happened to have — a real regression this app hit once already,
   see git history on the hero-* asset resize). scalePercent controls how
   much of the canvas the car fills (the established convention is 97);
   removeBackground runs floodFillBackground first. Returns a canvas, not
   a data URL yet, so the caller can re-render live as the admin adjusts
   the scale slider or toggles background removal, only encoding to PNG
   once they actually commit it. */
export function renderToCanvas(img, category, { removeBackground = false, scalePercent = 97 } = {}){
  const [W, H] = category === 'trucks' ? [1200, 400] : [800, 400];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  if(removeBackground){
    // Process at the source's own resolution first — flood-filling after
    // it's already been downscaled onto the small target canvas would
    // blur the silhouette edge into a fuzzy halo of half-transparent
    // pixels; doing it at full resolution keeps that edge crisp.
    const src = document.createElement('canvas');
    src.width = img.width; src.height = img.height;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0);
    const imageData = sctx.getImageData(0, 0, img.width, img.height);
    floodFillBackground(imageData, img.width, img.height);
    sctx.putImageData(imageData, 0, 0);
    const frac = Math.max(10, Math.min(100, scalePercent)) / 100;
    const scale = Math.min((W * frac) / img.width, (H * frac) / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const frac = Math.max(10, Math.min(100, scalePercent)) / 100;
    const scale = Math.min((W * frac) / img.width, (H * frac) / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  return canvas;
}
