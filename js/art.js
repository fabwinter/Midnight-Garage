/* Vehicle + board art (AAA plan §3.0). Authored as SVG on purpose: the DOM
   renderer uses it directly today, and the R1 WebGL layer rasterizes the
   same SVGs into its sprite atlas later — nothing here is throwaway.

   All bodies are drawn horizontally with the FRONT at the right end, in
   100-unit cell coordinates, then rotated as a group for vertical pieces.
   Every traffic piece is a photoreal car/truck (see SEDAN_PHOTOS and
   TRUCK_PHOTOS below) cycled by piece index so a full board reads as
   varied traffic, not clones. There is no procedural fallback body
   anymore — the photo library is the only source of vehicle art. */

import { getLibrary, libraryVersion } from './library.js';

/* Classic hero car: a top-down photoreal render, front at the right end
   (matches the procedural convention above) so it drops in with no flip.
   Only the default/unowned-skin hero uses this — Garage skins use the
   photoreal traffic sedan recolored to the skin's paint (see vehicleSVG). */
const CLASSIC_CAR_IMG = 'assets/cars/classic.webp';

/* Photoreal traffic sedans: same idea as the hero photo, but recolored per
   piece at render time via feColorMatrix hueRotate rather than pre-baking
   one image per palette color. Each entry's hue is its source paint's own
   hue (measured from the art), so the rotation for any target color is
   just targetHue - sourceHue. Traffic pieces cycle through all of them for
   variety; Garage skins always use index 0, whose beam/glow geometry
   (photoHeroExtra below) is tuned to that specific photo's edges.

   `fixed: true` opts a photo out of recoloring entirely — for liveries with
   their own branding (racing stripes, a specific fleet color) hueRotate just
   shifts the whole photo to an arbitrary hue instead of producing something
   that reads as "that car, but blue"; better to show it in its real color on
   every piece than a randomly-tinted stripe. */
// traffic-sedan-2 has a soft shadow fringe baked into its cutout (visible as
// speckle against the dark board) and no clean re-shoot has replaced it yet,
// so it's left out of rotation rather than shipping a visibly dirty edge.
/* One entry per real-world car model — no duplicate models. When the same
   car existed in several source colors, one recolorable cutout was kept and
   the rest deleted; the near-dupes (the wedge, the yellow-striped midship, navy
   GT, striped silver GT, GT3 RS) were pruned in the July '26 pass, and the
   the wedge itself went next — its only cutout had a baked grey shadow strip
   that survived recoloring. Index 0 is the Garage-skin body — keep it a
   clean recolorable cutout.

   Every canvas here is normalized the same way: content cropped to the car,
   front at the RIGHT end, scaled to 97% of the canvas length with the car's
   true aspect ratio preserved (boxy vehicles cap at 97% height instead), and
   centered. No cutout is stretched to fill the box, so cars keep consistent
   relative proportions on the board.

   The generic hatchback body (sedan-13/21/22/24/25 and 26-34) is shot
   as real photos in ~13 factory colors including taxi and police liveries,
   so it's fixed-livery across the board rather than hue-rotated — hueRotate
   was shifting each photo's own baked taillight red along with the body
   paint, which read as a lighting bug (green/purple taillights) rather than
   "recolored car". Real photos any time they exist beats simulating them. */
/* Every entry carries a `color` bucket tag (measured from the art: base
   paint hue plus any distinguishing stripe/livery, not just the name) —
   this is what actually prevents two same-looking cars sharing a level, via
   bucketSequence()'s seeded round-robin below. A level's traffic no longer
   walks this array's raw order at all: array order here is just for human
   readability (roughly grouped by family). Only merge two cars into the
   same bucket when they'd genuinely read as "the same car" at a glance
   (e.g. the two plain red exotics); a stripe, livery, or shape that changes
   the read gets its own bucket even at the same base hue.

   NOTE: sedan-6's cutout shipped mirrored (front at the LEFT — the only
   one violating the normalization described above) and was flipped in
   place in the July '26 job-car pass. Nobody noticed while it was 1 of 23
   traffic cars; as the skin body it became the hero on every campaign
   level, visibly driving backwards out of the exit. It must stay at
   index 0: that slot is the Garage-skin body (see vehicleSVG).

   sedan-13 keeps the shared fitted footprint of its old hatchback family
   (776x343 in the 800x400 canvas): its source photo measured ~12% fatter
   than its shoot-mates and was the real cause of the "colored cars are
   narrower than the white one" bug. The other 8 hatchback colours were
   dropped in July '26 (too much mirror-shine reflection) and replaced by
   the hero cars below doubling as traffic.

   The olive G-wagon (sedan-9) stays dropped: too stubby (~1.7:1) for the
   shared 97%-of-length norm. Same call as the shadowed wedge cutout. */
/* The one and only broken-down-car asset (see vehicleSVG's brokenDown
   branch): a len-2 hitch trailer is always this specific rust-weathered
   sedan, never a random pick off the rotation — "needs a tow" should read
   as a recognizable, consistent car, not just "whichever traffic sedan
   this piece's ordinal happened to land on, but dimmer." Still listed as a
   normal SEDAN_PHOTOS entry too, so it stays in ordinary traffic rotation
   and remains disable-able from the admin library like any other asset. */
const BROKEN_DOWN_SEDAN_PHOTO = { img: 'assets/cars/library-sedans-1785067674835-5-rust-weathered.webp', fixed: true, color: 'rust-weathered' };

const SEDAN_PHOTOS = [
  { img: 'assets/cars/traffic-sedan-6.webp', hue: 29, color: 'blue' },                 // skin body, recolors
  { img: 'assets/cars/traffic-sedan-13.webp', fixed: true, color: 'white-plain' },
  { img: 'assets/cars/hero-sports-cyan.webp', fixed: true, color: 'cyan-track' },
  { img: 'assets/cars/traffic-sedan-new-lightblue.webp', fixed: true, color: 'blue-plain' },
  { img: 'assets/cars/hero-classic-white-green.webp', fixed: true, color: 'white-green-stripe' },
  { img: 'assets/cars/hero-sedan-green.webp', fixed: true, color: 'green-sedan' },
  { img: 'assets/cars/hero-convertible-brown.webp', fixed: true, color: 'brown' },
  { img: 'assets/cars/hero-fluro-cyan.webp', fixed: true, color: 'cyan-fluro' },
  { img: 'assets/cars/hero-fluro-green.webp', fixed: true, color: 'green-fluro' },
  { img: 'assets/cars/hero-red-exotic.webp', fixed: true, color: 'red' },
  { img: 'assets/cars/hero-fluro-pink.webp', fixed: true, color: 'pink-fluro' },
  { img: 'assets/cars/hero-classic-cream.webp', fixed: true, color: 'cream-coupe' },
  { img: 'assets/cars/hero-muscle.webp', fixed: true, color: 'grey-muscle' },
  BROKEN_DOWN_SEDAN_PHOTO,
  { img: 'assets/cars/hero-spyder-blue.webp', fixed: true, color: 'blue-classic' },
  { img: 'assets/cars/hero-muscle-sage.webp', fixed: true, color: 'green-sage' },
  { img: 'assets/cars/hero-fluro-orange.webp', fixed: true, color: 'orange-fluro' },
  { img: 'assets/cars/hero-fluro-yellow.webp', fixed: true, color: 'yellow-fluro' },
  { img: 'assets/cars/traffic-sedan-7.webp', fixed: true, color: 'white-black-stripe' }, // classic rear-engine coupe
  { img: 'assets/cars/hero-sedan-bronze.webp', fixed: true, color: 'bronze' },
  { img: 'assets/cars/hero-classic-blue-stripe.webp', fixed: true, color: 'blue-white-stripe' },
  { img: 'assets/cars/hero-muscle-grey-stripe.webp', fixed: true, color: 'grey-stripe-muscle' },
  { img: 'assets/cars/library-sedans-1785067674835-6-police.webp', fixed: true, color: 'police' },
  { img: 'assets/cars/library-sedans-1785067674835-7-orange-suv.webp', fixed: true, color: 'Orange-suv' },
  { img: 'assets/cars/library-sedans-1785067674835-12-orange-coupe.webp', fixed: true, color: 'Orange coupe' },
  { img: 'assets/cars/library-sedans-1785067674835-13-red-hatch.webp', fixed: true, color: 'Red mini' },
  { img: 'assets/cars/library-sedans-1785067674835-14-green-hatch.webp', fixed: true, color: 'Green mini' },
  { img: 'assets/cars/hero-canopy-green.webp', fixed: true, color: 'green' },
  { img: 'assets/cars/hero-airtail-blue.webp', fixed: true, color: 'blue' },
  { img: 'assets/cars/hero-airtail-stripe.webp', fixed: true, color: 'white-green-stripe' },
  { img: 'assets/cars/hero-airtail-pink.webp', fixed: true, color: 'pink' },
  { img: 'assets/cars/hero-airtail-red.webp', fixed: true, color: 'red' },
  { img: 'assets/cars/hero-airtail-purple-yellow.webp', fixed: true, color: 'purple-yellow-stripe' },
];

/* Self-propelled len-3 vehicles only — trailers live in TRAILER_PHOTOS and
   are chosen by gameplay role (hitch trailer), never by index accident.
   Same per-entry `color` tagging as SEDAN_PHOTOS, feeding the same
   bucketSequence() round-robin — 8 distinct colours here comfortably
   covers the largest level (6 concurrent trucks measured across all 200
   campaign levels). School bus stays fixed: hue-rotating its big unshaded
   roof panel turns it into a flat featureless block, and a non-yellow
   school bus reads wrong anyway. */
// The dedicated tow-truck asset (see vehicleSVG's towCar branch): only a
// piece hitched to tow a broken-down car (not a genuine trailer) renders
// with this, regardless of that piece's own len/dir — "only tow trucks can
// tow cars" needs one recognizable truck body, not whatever the ordinary
// truck rotation would have picked. Still a normal TRUCK_PHOTOS entry too,
// so it stays in ordinary traffic rotation same as any other truck.
const TOW_TRUCK_PHOTO = { img: 'assets/cars/traffic-truck-4.webp', hue: 358, color: 'red' };

const TRUCK_PHOTOS = [
  { img: 'assets/cars/traffic-truck-3.webp', fixed: true, color: 'silver-tanker' },
  { img: 'assets/cars/traffic-truck-new.webp', fixed: true, color: 'blue-pickup' },
  { img: 'assets/cars/traffic-truck-2.webp', fixed: true, color: 'yellow-bus' },
  { img: 'assets/cars/traffic-truck-1.webp', fixed: true, color: 'green-garbage' },
  { img: 'assets/cars/traffic-truck-new-rusty.webp', fixed: true, color: 'rust-flatbed' },
  { img: 'assets/cars/traffic-truck-new-white.webp', fixed: true, color: 'white-box' },
  TOW_TRUCK_PHOTO,
  { img: 'assets/cars/truck-offroad-pickup-grey.webp', fixed: true, color: 'grey-pickup' },
  { img: 'assets/cars/truck-tanker-steel.webp', fixed: true, color: 'steel-tanker' },
  { img: 'assets/cars/truck-flatbed-green.webp', fixed: true, color: 'green-flatbed' },
  { img: 'assets/cars/truck-panel-orange.webp', fixed: true, color: 'orange-panel' },
  { img: 'assets/cars/truck-mixer-cream.webp', fixed: true, color: 'cream-mixer' },
];

/* Vehicles that cannot move by themselves: only pieces a level marks as a
   hitch trailer render with these (Airstream caravan, wood-deck utility
   trailer, boat — natural material colors, none recolor). */
const TRAILER_PHOTOS = [
  { img: 'assets/cars/traffic-truck-6.webp', fixed: true },
  { img: 'assets/cars/traffic-truck-7.webp', fixed: true },
  { img: 'assets/cars/traffic-truck-8.webp', fixed: true },
];

/* Fire-and-forget background prefetch of every vehicle photo — mirrors
   js/audio.js's warmPool() for music. A level's first render can need 15+
   distinct, previously-unseen photos at once (see the colour-safe picker
   below: up to 14 concurrent sedans, all different), so without this the
   cold-cache image fetches land in the middle of actual gameplay instead
   of during idle time before the player's picked a mode. Never touches
   anything rendered — just nudges the browser to fetch+cache now. */
export function warmVehiclePhotos(){
  const all = [
    CLASSIC_CAR_IMG,
    ...combinedSedanPhotos().map(p => p.img),
    ...combinedTruckPhotos().map(p => p.img),
    ...combinedTrailerPhotos().map(p => p.img),
  ];
  for(const src of all){
    const img = new Image();
    img.src = src;
  }
}

/* Colour-safe traffic photo picker (fixes: two same-coloured cars landing
   on one board — see the July '26 bug report). The old scheme walked
   SEDAN_PHOTOS in a fixed cyclic order, offset per level by a seed; that
   only rotates a SHARED order, so it can't stop two same-coloured entries
   ~8 apart from both landing in one level's window once that level needs
   more than ~8 cars. Campaign levels go up to 14 concurrent sedans and 6
   concurrent trucks (measured across all 200 levels), which is well past
   what any fixed rotation can guarantee.

   bucketSequence() instead groups entries by their `color` tag and, for a
   given level seed, visits every bucket ONCE in a seed-shuffled order
   before repeating any bucket — i.e. round-robin across colours, not
   across raw array slots. With 36 sedan buckets and 8 truck buckets, both
   comfortably above the measured per-level maximums, every level's first
   pass through this sequence draws each car from a DIFFERENT colour bucket,
   so no level can show the same colour twice. (Only if a level ever needed
   more traffic pieces than there are buckets would a colour repeat — and
   even then it'd be the least-recently-used colour, maximally spread out.)
   Different seeds shuffle both the bucket visiting order and which member
   of each bucket comes first, so distinct levels don't all reach for the
   same "first" car — while the same level keeps the same seed and so looks
   identical across replays/undos, matching the surrounding design intent. */
function seedHash(seed, salt){
  let h = (Math.imul(seed | 0, 2654435761) ^ 0) >>> 0;
  for(let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/* Strict per-level colour dedup (July '26 "no double-ups" pass). The
   per-entry `color` tag above is finer than a human calls "a colour" —
   it distinguishes liveries/models (e.g. 'blue-race-stripe' vs 'blue-classic'
   vs 'Blue wedge') that all still read as "a blue car" at a glance. That
   finer tag remains the bucket key for VARIETY (no two identical liveries
   back to back — see bucketize below), but the actual same-colour
   guarantee groups tags into one of these 12 basic-colour families first,
   so bucketSequence never lets two members of the SAME family both appear
   in one level (until it's genuinely forced to, see the round-robin
   fallback) — a family is exactly the granularity a player judges "does
   this look the same colour as that one" at, no finer.
   Whichever family the hero's own skin hex lands in is excluded from
   traffic's rotation entirely for that level (see vehicleSVG's heroFamily
   plumbing) — "no light-blue traffic if the hero is light blue" from a
   single hex, no tagging required on the hero side. */
export const COLOR_FAMILIES = ['red','orange','yellow','green','teal','blue','purple','pink','brown','white','black','grey'];

// One representative hex per family — the hue-rotate TARGET for the
// handful of hue-rotatable entries (garage-skin sedan body, lime GT3 RS,
// tow truck): their actual rendered colour now comes from whichever
// family the round-robin assigns them, instead of drifting with board
// position, so they participate in the same exclusion as every fixed
// photo instead of being invisible to it.
const FAMILY_HEX = {
  red: '#ff4d4d', orange: '#ff9a3d', yellow: '#f5d442', green: '#5fbf4a',
  teal: '#2fb5b0', blue: '#4a7dff', purple: '#9a5bd6', pink: '#e85fa8',
  brown: '#8a5a34', white: '#e9e9e3', black: '#26262a', grey: '#8a929c',
};

// Checked token-by-token, first hit wins — every existing tag is either a
// single colour word or a hyphenated "basecolor-livery/model" string where
// the base paint is always the FIRST recognizable colour word (matches how
// these tags were authored, see the SEDAN_PHOTOS comment above).
const TAG_KEYWORD_FAMILY = [
  ['white', 'white'], ['cream', 'white'], ['ivory', 'white'],
  ['black', 'black'],
  ['silver', 'grey'], ['chrome', 'grey'], ['grey', 'grey'], ['gray', 'grey'],
  ['gold', 'yellow'], ['yellow', 'yellow'],
  ['orange', 'orange'],
  ['rust', 'brown'], ['brown', 'brown'], ['bronze', 'brown'], ['tan', 'brown'],
  ['green', 'green'], ['lime', 'green'], ['sage', 'green'],
  ['teal', 'teal'], ['cyan', 'teal'], ['aqua', 'teal'],
  ['blue', 'blue'],
  ['purple', 'purple'],
  ['pink', 'pink'],
  ['red', 'red'],
];

// The odd tag with no colour word in it at all — called out explicitly
// rather than silently falling through the keyword scan.
const TAG_FAMILY_OVERRIDE = { police: 'black' };

export function familyFromTag(tag){
  const key = (tag || '').toLowerCase();
  if(TAG_FAMILY_OVERRIDE[key]) return TAG_FAMILY_OVERRIDE[key];
  const tokens = key.split(/[^a-z]+/).filter(Boolean);
  for(const tok of tokens){
    const hit = TAG_KEYWORD_FAMILY.find(([kw]) => tok.includes(kw));
    if(hit) return hit[1];
  }
  return 'grey'; // shouldn't happen for any current tag — safe neutral fallback
}

// Classifies a raw hero skin hex into the same 12-family taxonomy, so the
// hero (which has no `color` tag, just a hex) can be excluded from
// traffic's rotation on equal footing.
export function familyFromHex(hex){
  const hue = hexHue(hex), sat = hexSat(hex);
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const light = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  if(sat < 0.12) return light > 0.78 ? 'white' : (light < 0.22 ? 'black' : 'grey');
  if(hue < 15 || hue >= 345) return 'red';
  if(hue < 45) return sat < 0.35 ? 'brown' : 'orange';
  if(hue < 68) return 'yellow';
  if(hue < 165) return 'green';
  if(hue < 195) return 'teal';
  if(hue < 255) return 'blue';
  if(hue < 300) return 'purple';
  return 'pink';
}

function bucketize(pool){
  const buckets = {};
  pool.forEach(entry => (buckets[entry.color] ??= []).push(entry));
  return buckets;
}

// Same idea, but grouped by the coarser family instead of the exact tag —
// this is the bucket bucketSequence actually round-robins across, so two
// entries that are technically different liveries (different `color` tags)
// but the same basic colour can't both land in one level.
export function bucketizeByFamily(pool){
  const buckets = {};
  pool.forEach(entry => (buckets[familyFromTag(entry.color)] ??= []).push(entry));
  return buckets;
}

/* Admin library (js/library.js) additions/removals layer on top of the
   hardcoded arrays above at lookup time — nothing here is baked in at
   module load, so an admin adding or deleting an asset from the Sandbox's
   Library panel takes effect on the very next render, no reload needed.
   `disabledBase` lets an admin retire one of the hardcoded entries above
   without deleting code — it's just filtered out of rotation. */
function combinedPool(basePool, category){
  const lib = getLibrary();
  const disabled = new Set(lib.disabledBase);
  return [...basePool.filter(e => !disabled.has(e.img)), ...(lib[category] || [])];
}
function combinedSedanPhotos(){ return combinedPool(SEDAN_PHOTOS, 'sedans'); }
function combinedTruckPhotos(){ return combinedPool(TRUCK_PHOTOS, 'trucks'); }
function combinedTrailerPhotos(){ return combinedPool(TRAILER_PHOTOS, 'trailers'); }

/* Read accessors for the Sandbox's Library panel and car/truck picker
   (js/game.js) — the hardcoded arrays above are module-private, so this is
   the only way that UI can see what's in rotation. `category` is
   'sedans' | 'trucks' | 'trailers' throughout, matching js/library.js's
   own shape. */
export function basePhotos(category){
  if(category === 'sedans') return SEDAN_PHOTOS;
  if(category === 'trucks') return TRUCK_PHOTOS;
  return TRAILER_PHOTOS;
}
export function combinedPhotos(category){
  if(category === 'sedans') return combinedSedanPhotos();
  if(category === 'trucks') return combinedTruckPhotos();
  return combinedTrailerPhotos();
}

const sequenceCache = new Map(); // "poolName:seed:excludeFamilies:libVersion" -> resolved pick order

/* excludeFamilies (array of family names, order-insensitive) is left out of
   the rotation for this level entirely — used to keep the hero's own
   colour, and (for trucks) whatever families the sedans already claimed,
   out of traffic's picks. If excluding would leave NO family to draw from
   (only possible once a level's own vehicle count exceeds the 12-family
   ceiling — see the campaign's largest boards), the exclusion is dropped
   rather than crashing on an empty sequence; a forced repeat of the hero's
   or a sibling class's colour is a much smaller problem than no traffic
   art at all. */
export function bucketSequence(poolName, seed, excludeFamilies = []){
  const excludeKey = [...excludeFamilies].sort().join(',');
  const key = poolName + ':' + seed + ':' + excludeKey + ':' + libraryVersion();
  const cached = sequenceCache.get(key);
  if(cached) return cached;
  const buckets = bucketizeByFamily(poolName === 'sedan' ? combinedSedanPhotos() : combinedTruckPhotos());

  const exclude = new Set(excludeFamilies);
  let names = Object.keys(buckets).filter(f => !exclude.has(f));
  if(!names.length) names = Object.keys(buckets);
  const start = names.length ? seedHash(seed, poolName) % names.length : 0;
  const order = names.slice(start).concat(names.slice(0, start));

  const seq = [];
  for(let round = 0; ; round++){
    let addedAny = false;
    for(const name of order){
      const bucket = buckets[name];
      if(round >= bucket.length) continue;
      const rot = seedHash(seed, name) % bucket.length;
      seq.push(bucket[(rot + round) % bucket.length]);
      addedAny = true;
    }
    if(!addedAny) break;
  }
  sequenceCache.set(key, seq);
  return seq;
}

// The families the first `count` picks of a sequence actually land on —
// used to cross-exclude sedans' colours from the truck sequence so a
// same-family sedan and truck can't both appear in one level either.
export function familiesUsedBy(seq, count){
  const out = new Set();
  for(let i = 0; i < count && i < seq.length; i++) out.add(familyFromTag(seq[i].color));
  return out;
}

/* Truck's own family space is tiny (7 families across its 8 tags) next to
   sedan's (up to 12) — sedans alone can plausibly claim every one of
   truck's 7 colours on a big board. Excluding all of them would starve
   the truck sequence down to zero candidates, which used to fall back to
   NO exclusion at all (see bucketSequence's own empty-names fallback) —
   silently dropping even the hero exclusion, worse than not trying. This
   only adds a "nice to have" exclusion (a family sedans already used)
   while there's still enough headroom left for `needed` truck picks to
   stay collision-free; once adding one more would starve it, it stops,
   so a `mustExclude` (the hero's own family) always survives intact and
   `needed` slots are always satisfiable from what's left. */
export function boundedExclude(mustExclude, niceToExclude, poolFamilies, needed){
  const relevant = new Set(poolFamilies);
  const result = new Set([...mustExclude].filter(f => relevant.has(f)));
  for(const fam of niceToExclude){
    if(!relevant.has(fam) || result.has(fam)) continue;
    if(relevant.size - result.size - 1 < needed) break;
    result.add(fam);
  }
  return [...result];
}

function hexHue(hex){
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if(d === 0) return 0;
  let h;
  if(max === r) h = ((g - b) / d) % 6;
  else if(max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueRotationFor(targetHex, sourceHue){
  return ((hexHue(targetHex) - sourceHue) % 360 + 360) % 360;
}

function hexSat(hex){
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/* hueRotate alone can't reproduce a muted/dark target like the
   midnight-phantom skin from a vividly-painted source photo — it only
   rotates hue, so a saturated photo stays saturated at any angle. Scale
   saturation toward the target's own (relative to the photos' typical
   ~.75 paint saturation) so low-chroma skins don't come out neon. */
function satScaleFor(targetHex){
  return Math.max(0.3, Math.min(1.3, hexSat(targetHex) / 0.75));
}

export const PALETTE = [ // [base, dark, glass-tint] — 0 reserved for hero red
  ['#ff4d5e','#b3111f','#41151d'],
  ['#37c8ab','#177a67','#0e2f2b'],
  ['#5b8dff','#2a4fc4','#14203f'],
  ['#ffb340','#c47a10','#3c2a0c'],
  ['#b07cff','#6f3ad0','#291743'],
  ['#7ed957','#3f9427','#1d3313'],
  ['#ff8a5c','#c9502a','#3d1c10'],
  ['#4fd2f0','#1f8fb0','#0f2c37'],
  ['#f26fb1','#bb3679','#3a1229'],
  ['#c9d36a','#8b9430','#2d3113'],
  ['#8fa2bd','#57687f','#1e2530'],
  ['#ffd84d','#d1a213','#3b3106'],
  ['#67e0c2','#2b9c82','#123128'],
  ['#d98cff','#9b45d6','#2f1440'],
];

const H = 100;

/* Roof decals for color-blind mode — one distinct pattern per paint color,
   reads as livery variety rather than an accessibility toggle. */
function decal(idx, cx, cy){
  const ink = 'rgba(255,255,255,.5)';
  switch((idx - 1) % 5){
    case 0: return `<rect x="${cx-9}" y="${cy-15}" width="6.5" height="30" rx="3" fill="${ink}"/>
                    <rect x="${cx+3}" y="${cy-15}" width="6.5" height="30" rx="3" fill="${ink}"/>`;
    case 1: return `<circle cx="${cx-8}" cy="${cy}" r="5" fill="${ink}"/><circle cx="${cx+7}" cy="${cy-8}" r="5" fill="${ink}"/><circle cx="${cx+7}" cy="${cy+8}" r="5" fill="${ink}"/>`;
    case 2: return `<path d="M ${cx-9} ${cy-10} L ${cx+1} ${cy} L ${cx-9} ${cy+10} M ${cx+2} ${cy-10} L ${cx+12} ${cy} L ${cx+2} ${cy+10}" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 3: return `<circle cx="${cx}" cy="${cy}" r="9.5" fill="none" stroke="${ink}" stroke-width="5.5"/>`;
    default: return `<rect x="${cx-3}" y="${cy-11}" width="6" height="22" rx="3" fill="${ink}"/>
                     <rect x="${cx-11}" y="${cy-3}" width="22" height="6" rx="3" fill="${ink}"/>`;
  }
}

/* opts.photoOrd — this piece's 0-based ordinal among pieces of the same
   class (sedan / truck / trailer) in the level; opts.seed — the level's
   photo seed (see levelPhotoSeed in js/game.js). Together they index into
   this seed's colour-safe bucketSequence() (see above) rather than a raw
   array slot, so every piece in one level gets a different photo AND a
   different colour. Both default to 0 for callers that don't pass them.
   opts.trailer — this piece is a hitch trailer: len-3 draws from
   TRAILER_PHOTOS (caravan / utility trailer / boat); a len-2 trailer is a
   broken-down car, always the same BROKEN_DOWN_SEDAN_PHOTO (never the
   rotation), and renders desaturated + dimmed so "needs a tow" reads at a
   glance. opts.towCar — this piece is the tow half of a hitch pulling a
   broken-down car (as opposed to a genuine trailer): only a tow truck may
   do that, so it always renders as TOW_TRUCK_PHOTO regardless of its own
   len — a car may hitch a genuine trailer freely, but towing another CAR
   takes a tow truck. */
export function vehicleSVG(idx, len, dir, isHero, opts = {}){
  const skin = isHero ? opts.skin : null;
  const L = len * H;
  const gid = 'v' + idx + '-' + Math.random().toString(36).slice(2, 7);
  const soft = gid + 's';
  const seed = opts.seed ?? 0;
  const photoOrd = opts.photoOrd ?? 0;
  const isTrailer = !!opts.trailer && !isHero;
  const towCar = !!opts.towCar && !isHero;
  const heroBaseHex = skin ? skin.base : (isHero ? PALETTE[0][0] : opts.heroBase);
  const heroFamily = heroBaseHex ? familyFromHex(heroBaseHex) : null;
  // opts.sedanNeeded/opts.truckNeeded — how many of each slot this level's
  // board actually has (see buildPieces in js/game.js). The truck pool's
  // own family space is tiny (7, next to sedan's 12) and its need is small
  // (measured max 6) — always satisfiable from just the hero exclusion, so
  // it's allocated FIRST and unconstrained. Sedan's sequence then steers
  // away from whatever families trucks just claimed too — not just hero vs
  // traffic — bounded so it never claims so much of sedan's own (much
  // roomier, but also much more heavily drawn-on) family space that there's
  // nowhere left for sedan's own needed picks to land; see boundedExclude
  // above. Allocating the tightly-constrained pool first and letting the
  // roomier one absorb the reservation avoids the reverse order's failure
  // mode: sedan (up to 14 needed) can easily claim every one of truck's 7
  // families before truck gets a turn, forcing truck to collide on
  // effectively every pick instead of just the handful the 12-family
  // ceiling makes genuinely unavoidable. Computed unconditionally (cheap —
  // memoized per seed) even though heroes don't use them, so the unused
  // branch below never indexes into null.
  const heroExclude = heroFamily ? [heroFamily] : [];
  const truckSeq = bucketSequence('truck', seed, heroExclude);
  const sedanFamilies = Object.keys(bucketizeByFamily(combinedSedanPhotos()));
  const truckFamiliesUsed = familiesUsedBy(truckSeq, opts.truckNeeded ?? 0);
  const sedanExclude = boundedExclude(heroExclude, truckFamiliesUsed, sedanFamilies, opts.sedanNeeded ?? 0);
  const sedanSeq = bucketSequence('sedan', seed, sedanExclude);
  // opts.photoOverride: the Sandbox's car/truck picker pins an exact asset
  // to one piece instead of letting the colour-safe rotation pick — used
  // nowhere else (real levels always want the rotation's variety).
  const override = opts.photoOverride ? { img: opts.photoOverride, fixed: true } : null;
  const brokenDown = isTrailer && len < 3;
  const sedanPhoto = override ?? (isHero ? SEDAN_PHOTOS[0] : (brokenDown ? BROKEN_DOWN_SEDAN_PHOTO : sedanSeq[photoOrd % sedanSeq.length]));
  const truckPhoto = override ?? (isTrailer
    ? combinedTrailerPhotos()[photoOrd % combinedTrailerPhotos().length]
    : (towCar ? TOW_TRUCK_PHOTO : truckSeq[photoOrd % truckSeq.length]));
  const hueAttr = brokenDown ? ` filter="url(#${gid}broke)"` : (sedanPhoto.fixed ? '' : ` filter="url(#${gid}hue)"`);
  const hueAttr2 = truckPhoto.fixed ? '' : ` filter="url(#${gid}hue2)"`;
  // Hue-rotatable, non-hero entries (garage-skin sedan body, lime GT3 RS,
  // tow truck) render at their assigned family's representative hex rather
  // than an idx-derived PALETTE colour, so their ACTUAL rendered colour
  // participates in the same exclusion as every fixed photo. towCar/
  // override/brokenDown bypass the sequence's own exclusion, so as a last
  // resort nudge off the hero's family if it lands there anyway.
  function familyTargetHex(colorTag){
    let fam = familyFromTag(colorTag);
    if(heroFamily && fam === heroFamily) fam = COLOR_FAMILIES[(COLOR_FAMILIES.indexOf(fam) + 1) % COLOR_FAMILIES.length];
    return FAMILY_HEX[fam];
  }
  const sedanBase = isHero ? heroBaseHex : familyTargetHex(sedanPhoto.color);
  const truckBase = isHero ? heroBaseHex : familyTargetHex(truckPhoto.color);

  const defs = `
  <defs>
    <linearGradient id="${gid}beam2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff6d8" stop-opacity=".85"/>
      <stop offset=".35" stop-color="#ffe9b8" stop-opacity=".4"/>
      <stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/>
    </linearGradient>
    <filter id="${soft}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="${gid}bblur" filterUnits="userSpaceOnUse" x="-40" y="-100" width="${L + 350}" height="300"><feGaussianBlur stdDeviation="4.5"/></filter>
    <filter id="${gid}hue">
      <feColorMatrix type="hueRotate" values="${hueRotationFor(sedanBase, sedanPhoto.hue || 0)}"/>
      <feColorMatrix type="saturate" values="${satScaleFor(sedanBase)}"/>
    </filter>
    <filter id="${gid}hue2">
      <feColorMatrix type="hueRotate" values="${hueRotationFor(truckBase, truckPhoto.hue || 0)}"/>
      <feColorMatrix type="saturate" values="${satScaleFor(truckBase)}"/>
    </filter>
    <filter id="${gid}broke">
      <feColorMatrix type="saturate" values="0.18"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="0.72"/><feFuncG type="linear" slope="0.72"/><feFuncB type="linear" slope="0.72"/>
      </feComponentTransfer>
    </filter>
  </defs>`;

  /* Hero (classic photo car): geometry measured from the normalized
     classic.png (front bumper at x≈193/200; headlight blades are swept-back
     strips whose lens area centers at (174,18)/(174,82), angled ~24° toward
     the nose). The soft glow ellipse lies along each blade, the bright core
     sits on the blade's forward half, and each beam cone's base line follows
     the blade before fanning out past the bumper. Two separate cones (one
     per headlight) rather than one merged trapezoid, each blurred so the
     edge reads as light falloff instead of a flat polygon.
     (mix-blend-mode:screen was tried for a true additive glow, but at this
     SVG's overflow:visible boundary it produced a visible seam where the
     beam crosses the piece's own viewBox — plain opaque-fading-to-transparent
     reads bright enough against the dark board without that artifact.)

     Drawn for EVERY hero, whatever its body art: classic.png, a bespoke
     `skin.photo` render, or the recolored SEDAN_PHOTOS[0] fallback — all
     three follow the same normalization (front at the right end, ~97% of
     the canvas length), so the beam anchors land close enough on each.
     A job-car pass briefly withheld this for fallback heroes on the theory
     that the traffic photo wasn't shot to classic.png's layout; that shipped
     as "the hero has no headlights" on every campaign level, because with
     jobs deciding the car, the fallback IS the common case until bespoke
     art lands. The mark must always read as the car with its lights on —
     on the board. opts.headlights=false opts back out for the two static-
     display contexts (garage tiles, the car-reveal sheet): those are
     collection-card shots of the paint job, not a night-driving moment, and
     the beam/glow read as clutter rather than mood at a small, still size. */
  const photoHeroExtra = (isHero && opts.headlights !== false) ? `
    <path d="M ${L - 23} 14 L ${L + 185} -8 L ${L + 185} 46 L ${L - 11} 30 Z" fill="url(#${gid}beam2)" filter="url(#${gid}bblur)"/>
    <path d="M ${L - 23} 86 L ${L + 185} 108 L ${L + 185} 54 L ${L - 11} 70 Z" fill="url(#${gid}beam2)" filter="url(#${gid}bblur)"/>
    <ellipse cx="${L - 26}" cy="18" rx="15" ry="4.5" transform="rotate(24 ${L - 26} 18)" fill="#fff3c2" opacity=".55" filter="url(#${gid}bblur)"/>
    <ellipse cx="${L - 26}" cy="82" rx="15" ry="4.5" transform="rotate(-24 ${L - 26} 82)" fill="#fff3c2" opacity=".55" filter="url(#${gid}bblur)"/>
    <circle cx="${L - 19}" cy="22" r="3" fill="#fffbe8"/>
    <circle cx="${L - 19}" cy="78" r="3" fill="#fffbe8"/>
    <ellipse cx="10" cy="16" rx="5" ry="7" fill="#ff4a3a" opacity=".55" filter="url(#${soft})"/>
    <ellipse cx="10" cy="84" rx="5" ry="7" fill="#ff4a3a" opacity=".55" filter="url(#${soft})"/>
    <ellipse cx="7" cy="50" rx="5" ry="30" fill="#ff3b2e" opacity=".24" filter="url(#${soft})"/>` : '';

  const cb = opts.colorblind && !isHero;
  let body;
  if(isHero && !skin){
    // Classic (default) hero: photoreal render in place of the procedural
    // sedan. Skinned/unlocked cars still use the recolorable sedan below,
    // unless they've got their own bespoke art — see the branch above.
    body = `<image href="${CLASSIC_CAR_IMG}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"/>${photoHeroExtra}`;
  } else if(isHero && skin.photo){
    // Job car with its own render, built to classic.png's exact layout
    // (front-right, headlights baked in) — no hueRotate needed, the art
    // already carries its final paint, and photoHeroExtra's beam overlay
    // lines up the same way it does on the classic hero.
    body = `<image href="${skin.photo}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"/>${photoHeroExtra}`;
  } else if(isHero){
    // Job car with no bespoke render yet: SEDAN_PHOTOS[0] recolored to the
    // skin's paint via hueRotate, plus the same beam/glow overlay as every
    // other hero (the photo is normalized front-right like classic.png, so
    // the anchors carry over — see photoHeroExtra above).
    // trimSVG's beltline stripe was tuned to the old procedural sedan's
    // silhouette (paint above/below a windshield greenhouse) — this car's
    // canopy runs nearly the full width, so the same stripe cuts across
    // the glass instead of following a body line. Skipping trim here;
    // paint color alone still distinguishes every unlocked skin.
    body = `<image href="${sedanPhoto.img}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"${hueAttr}/>${photoHeroExtra}`;
  } else if(len >= 3 || towCar){
    body = `<image href="${truckPhoto.img}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"${hueAttr2}/>${cb ? decal(idx, L * 0.5, 50) : ''}`;
  } else {
    body = `<image href="${sedanPhoto.img}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"${hueAttr}/>${cb ? decal(idx, L * 0.5, 50) : ''}`;
  }

  const W = dir === 'h' ? L : H, Ht = dir === 'h' ? H : L;
  const g = dir === 'h' ? `<g>${body}</g>` : `<g transform="translate(${H},0) rotate(90)">${body}</g>`;
  return `<svg viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none" aria-hidden="true">${defs}${g}</svg>`;
}

/* Roadworks tile (immovable "wall" pieces): hazard-striped frame + traffic
   cone. Deliberately flat and squarish — reads as "can't move" at a glance,
   unmistakably not a vehicle. */
export function wallSVG(i){
  const gid = 'w' + i + '-' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${H} ${H}" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <pattern id="${gid}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="16" height="16" fill="#26210f"/>
      <rect width="8" height="16" fill="#ffb454"/>
    </pattern>
  </defs>
  <rect x="6" y="6" width="88" height="88" rx="13" fill="#141924"/>
  <rect x="6" y="6" width="88" height="88" rx="13" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="2"/>
  <rect x="12" y="12" width="76" height="76" rx="9" fill="none" stroke="url(#${gid})" stroke-width="9" opacity=".85"/>
  <path d="M50 28 L63 72 L37 72 Z" fill="#e8762e"/>
  <path d="M50 28 L63 72 L37 72 Z" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2"/>
  <rect x="42" y="50" width="16" height="7" rx="3" fill="#f5ede0"/>
  <rect x="30" y="70" width="40" height="8" rx="4" fill="#c95f22"/>
  </svg>`;
}

/* ---------- board set-dressing (injected into the gridlines SVG) ----------
   Cheap DOM-era lighting: lamp pools, posts, manhole, painted exit dashes.
   Replaced by real point lights in the R1 WebGL layer; the geometry stays. */

export function dressingSVG(CELL, EXIT_ROW, accent){
  const s = CELL * 6;
  const y = EXIT_ROW * CELL + CELL / 2;
  let dashes = '';
  for(let x = CELL * 0.12; x < s - CELL * 0.7; x += CELL * 0.54){
    dashes += `<rect x="${x}" y="${y - CELL * 0.03}" width="${CELL * 0.34}" height="${CELL * 0.06}" rx="${CELL * 0.03}" fill="${accent}" opacity=".28"/>`;
  }
  const lamp = (x, yy, flip) => `
    <rect x="${x - CELL * 0.03}" y="${flip ? yy - CELL * 0.34 : yy}" width="${CELL * 0.06}" height="${CELL * 0.34}" fill="#2b3345"/>
    <rect x="${x - CELL * 0.09}" y="${(flip ? yy - CELL * 0.34 : yy + CELL * 0.28)}" width="${CELL * 0.18}" height="${CELL * 0.09}" rx="${CELL * 0.03}" fill="#1c2230"/>
    <circle cx="${x}" cy="${flip ? yy - CELL * 0.34 : yy}" r="${CELL * 0.07}" fill="#cfe0ff" opacity=".95" class="mg-lamp-bulb"/>
    <circle cx="${x}" cy="${flip ? yy - CELL * 0.34 : yy}" r="${CELL * 0.2}" fill="#9db8e8" opacity=".45" filter="url(#gdsoft)" class="mg-lamp-bulb"/>`;
  /* Decorative only — steady green, ambiance not gameplay state. A live
     red/green signal keyed to the exit lane is the R1 WebGL renderer's
     job (solve-proximity lighting, AAA-PLAN.md §3.2); this cheap DOM pass
     just needs the streetlight vocabulary on the board. */
  const signal = (x, yy) => `
    <rect x="${x - CELL * 0.02}" y="${yy}" width="${CELL * 0.04}" height="${CELL * 0.16}" fill="#39435a"/>
    <rect x="${x - CELL * 0.065}" y="${yy - CELL * 0.19}" width="${CELL * 0.13}" height="${CELL * 0.2}" rx="${CELL * 0.03}" fill="#151b28" stroke="#39435a" stroke-width="${Math.max(1, CELL * 0.014)}"/>
    <circle cx="${x}" cy="${yy - CELL * 0.09}" r="${CELL * 0.035}" fill="#54e69a" class="mg-signal-bulb"/>
    <circle cx="${x}" cy="${yy - CELL * 0.09}" r="${CELL * 0.09}" fill="#54e69a" opacity=".35" filter="url(#gdsoft)" class="mg-signal-bulb"/>`;
  return `
  <defs>
    <radialGradient id="gdpool" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#9db8e8" stop-opacity=".22"/>
      <stop offset=".55" stop-color="#7b98cf" stop-opacity=".08"/>
      <stop offset="1" stop-color="#7b98cf" stop-opacity="0"/>
    </radialGradient>
    <filter id="gdsoft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${CELL * 0.05}"/></filter>
  </defs>
  <ellipse cx="${CELL * 2.55}" cy="${CELL * 0.55}" rx="${CELL * 1.9}" ry="${CELL * 1.4}" fill="url(#gdpool)"/>
  <ellipse cx="${CELL * 4.7}" cy="${CELL * 5.2}" rx="${CELL * 2.05}" ry="${CELL * 1.55}" fill="url(#gdpool)"/>
  ${dashes}
  <circle cx="${CELL * 3.52}" cy="${CELL * 4.34}" r="${CELL * 0.15}" fill="#0d1119" stroke="#242d3e" stroke-width="2"/>
  <circle cx="${CELL * 3.52}" cy="${CELL * 4.34}" r="${CELL * 0.10}" fill="none" stroke="#242d3e" stroke-width="1.2" opacity=".7"/>
  <path d="M ${CELL * 0.5} ${CELL * 4.62} l 0 ${-CELL * 0.26} l ${-CELL * 0.08} ${CELL * 0.08} m ${CELL * 0.08} ${-CELL * 0.08} l ${CELL * 0.08} ${CELL * 0.08}"
        stroke="#ffffff" stroke-opacity=".06" stroke-width="${CELL * 0.05}" fill="none" stroke-linecap="round"/>
  ${lamp(CELL * 2.52, CELL * 0.06, false)}
  ${lamp(CELL * 4.72, CELL * 5.94, true)}
  ${signal(CELL * 0.14, CELL * 2)}`;
}

/* Interlock gate: a top-down boom barrier filling its cell. The striped
   arm hangs from the pivot post and physically blocks the lane; the
   `.gate-open` class (js/game.js: updateGates) swings it aside and
   shrinks it via CSS rotate/scale — top-down foreshortening for "arm
   raised" — and crossfades the post lamp red→green (see .gate[data-gi]
   rules in css/game.css). Geometry lives in viewBox units so the same
   markup serves the game board and the Sandbox at any cell size. */
export function gateSVG(axis = 'h'){
  /* Drawn for a horizontal-passage gate: the arm lies ACROSS the lane it
     guards, so a gate letting traffic through left-right has a
     top-to-bottom arm. A vertical-passage gate is the same barrier rotated
     a quarter turn — one transform rather than a second hand-built
     drawing, so the arm/post/lamp can never drift apart between the two. */
  const turn = axis === 'v' ? ' transform="rotate(90 50 50)"' : '';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g${turn}>
    <rect x="43" y="16" width="14" height="80" rx="7" fill="rgba(0,0,0,.35)"/>
    <g class="gate-arm">
      <rect x="45" y="12" width="10" height="82" rx="5" fill="#f2f5fa" stroke="rgba(8,12,20,.6)" stroke-width="1.6"/>
      <rect x="46.2" y="26" width="7.6" height="14" fill="#ff4d5e"/>
      <rect x="46.2" y="54" width="7.6" height="14" fill="#ff4d5e"/>
      <rect x="46.2" y="82" width="7.6" height="10" fill="#ff4d5e"/>
    </g>
    <rect x="41" y="3" width="18" height="18" rx="5" fill="#1c2433" stroke="#3a465e" stroke-width="2"/>
    <circle class="lamp lamp-closed" cx="50" cy="12" r="4.6" fill="#ff4d5e" stroke="rgba(255,77,94,.35)" stroke-width="4"/>
    <circle class="lamp lamp-open" cx="50" cy="12" r="4.6" fill="#3dffa0" stroke="rgba(61,255,160,.35)" stroke-width="4"/>
  </g></svg>`;
}

/* Interlock trigger pad: the floor marking on a gate's sensor cell —
   previously sensors weren't rendered at all in the live game, so the
   tutorial talked about a "sensor cell" the player couldn't see.
   Two layers crossfaded by `.sensor-on` (updateGates): the dim resting
   marking, and a lit version shown while a vehicle covers the cell.
   Polarity picks the visual language: a pressure plate (park HERE to
   open — teal target) vs a tripwire (keep this cell CLEAR — amber
   circle-slash; its lit layer goes red for "tripped"). */
export function sensorSVG(polarity){
  const pad = (color, icon, cls, fillAlpha) => `<g class="${cls}">
    <rect x="9" y="9" width="82" height="82" rx="14" fill="${color}" fill-opacity="${fillAlpha}" stroke="${color}" stroke-width="3" stroke-dasharray="11 8"/>
    <path d="M22 9h-8a5 5 0 0 0-5 5v8M78 9h8a5 5 0 0 1 5 5v8M9 78v8a5 5 0 0 0 5 5h8M91 78v8a5 5 0 0 1-5 5h-8" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
    ${icon}
  </g>`;
  if(polarity){
    const slash = c => `<circle cx="50" cy="50" r="16" fill="none" stroke="${c}" stroke-width="4"/>
      <line x1="39" y1="61" x2="61" y2="39" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      ${pad('#ffb454', slash('#ffb454'), 'sensor-base', '0.05')}
      ${pad('#ff5b6b', slash('#ff5b6b'), 'sensor-lit', '0.16')}
    </svg>`;
  }
  const target = c => `<circle cx="50" cy="50" r="16" fill="none" stroke="${c}" stroke-width="4"/>
    <circle cx="50" cy="50" r="5" fill="${c}"/>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    ${pad('#2fe3bd', target('#2fe3bd'), 'sensor-base', '0.05')}
    ${pad('#3dffa0', target('#3dffa0'), 'sensor-lit', '0.16')}
  </svg>`;
}

/* Hitch coupling indicator: a tow-rope line connecting tow vehicle to trailer.
   Shows which pieces are currently coupled. Same <svg> wrapper fix as
   gateSVG above — the coordinates here are already absolute board pixels
   (matching the .hitch div's own CELL*6 x CELL*6 box), so no viewBox is
   needed for them to land correctly. */
export function hitchSVG(x1, y1, x2, y2, size = 4){
  return `<svg width="100%" height="100%" aria-hidden="true"><g opacity="0.75">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff9e5c" stroke-width="${size}" stroke-dasharray="${size * 3},${size * 2}" stroke-linecap="round"/>
    <circle cx="${x1}" cy="${y1}" r="${size * 1.2}" fill="#ff9e5c" opacity="0.9"/>
    <circle cx="${x2}" cy="${y2}" r="${size * 1.2}" fill="#ff9e5c" opacity="0.9"/>
  </g></svg>`;
}
