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

/* Downscales an uploaded image file into a centered "contain" fit on a
   transparent canvas at the app's established per-category size (cars
   800x400, trucks 1200x400 — see art.js's own convention notes), so an
   admin-uploaded photo behaves like every hand-processed one already in
   the library instead of shipping at whatever resolution the source photo
   happened to be (a real problem this app hit before — see git history on
   the hero-* asset resize). Returns a PNG data URL. */
export function fileToDataURL(file, category){
  const [W, H] = category === 'trucks' ? [1200, 400] : [800, 400];
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const scale = Math.min((W * 0.97) / img.width, (H * 0.97) / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
