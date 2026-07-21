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
const CLASSIC_CAR_IMG = 'assets/cars/classic.png';

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
   the rest deleted; the near-dupes (Countach, yellow-striped Ferrari, navy
   GT, striped silver GT, GT3 RS) were pruned in the July '26 pass, and the
   Countach itself went next — its only cutout had a baked grey shadow strip
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
   shared 97%-of-length norm. Same call as the shadowed Countach cutout. */
const SEDAN_PHOTOS = [
  { img: 'assets/cars/traffic-sedan-6.png', hue: 29, color: 'recolor' },              // skin body, recolors
  { img: 'assets/cars/traffic-sedan-13.png', fixed: true, color: 'white-plain' },
  { img: 'assets/cars/traffic-sedan-5.png', fixed: true, color: 'yellow-tricolor' },  // Ferrari, tricolor stripe
  { img: 'assets/cars/hero-mclaren-nobadge.png', fixed: true, color: 'orange-f1' },
  { img: 'assets/cars/hero-sports-cyan.png', fixed: true, color: 'cyan-track' },
  { img: 'assets/cars/traffic-sedan-new-lightblue.png', fixed: true, color: 'blue-plain' },
  { img: 'assets/cars/traffic-sedan-4.png', fixed: true, color: 'silver-yellow-stripe' },
  { img: 'assets/cars/hero-ferrari-nobadge.png', fixed: true, color: 'red' },
  { img: 'assets/cars/traffic-sedan-25.png', fixed: true, color: 'police' },          // K-9 unit
  { img: 'assets/cars/hero-classic-white-green.png', fixed: true, color: 'white-green-stripe' },
  { img: 'assets/cars/hero-sedan-green.png', fixed: true, color: 'green-sedan' },
  { img: 'assets/cars/hero-convertible-brown.png', fixed: true, color: 'brown' },
  { img: 'assets/cars/traffic-sedan-24.png', fixed: true, color: 'yellow-taxi' },
  { img: 'assets/cars/traffic-sedan-11.png', fixed: true, color: 'blue-gulf-race' },  // numbered Gulf GT40
  { img: 'assets/cars/hero-ferrari-red-stripe.png', fixed: true, color: 'carbon-red-stripe' },
  { img: 'assets/cars/hero-fluro-cyan.png', fixed: true, color: 'cyan-fluro' },
  { img: 'assets/cars/hero-jeep-rubicon-nobadge.png', fixed: true, color: 'orange-suv' },
  { img: 'assets/cars/hero-vintage-white.png', fixed: true, color: 'ivory-bug' },
  { img: 'assets/cars/traffic-sedan-3.png', hue: 212, color: 'recolor' },             // navy classic GT
  { img: 'assets/cars/traffic-sedan-12.png', fixed: true, color: 'silver-plain' },    // 300SL
  { img: 'assets/cars/hero-fluro-green.png', fixed: true, color: 'green-fluro' },
  { img: 'assets/cars/hero-cobra-nobadge.png', fixed: true, color: 'blue-white-stripe' },
  { img: 'assets/cars/hero-porsche-nobadge.png', fixed: true, color: 'yellow-911-pale' },
  { img: 'assets/cars/hero-red-exotic.png', fixed: true, color: 'red' },
  { img: 'assets/cars/hero-fluro-pink.png', fixed: true, color: 'pink-fluro' },
  { img: 'assets/cars/hero-classic-cream.png', fixed: true, color: 'cream-coupe' },
  { img: 'assets/cars/hero-muscle.png', fixed: true, color: 'grey-muscle' },
  { img: 'assets/cars/traffic-sedan-28.png', fixed: true, color: 'rust-weathered' },
  { img: 'assets/cars/hero-pagani-nobadge.png', fixed: true, color: 'teal' },
  { img: 'assets/cars/hero-miura-nobadge.png', fixed: true, color: 'blue-classic' },
  { img: 'assets/cars/hero-muscle-sage.png', fixed: true, color: 'green-sage' },
  { img: 'assets/cars/hero-fluro-orange.png', fixed: true, color: 'orange-fluro' },
  { img: 'assets/cars/hero-fluro-yellow.png', fixed: true, color: 'yellow-fluro' },
  { img: 'assets/cars/traffic-sedan-7.png', fixed: true, color: 'white-black-stripe' }, // 911
  { img: 'assets/cars/hero-porsche-911-silver.png', fixed: true, color: 'silver-track' }, // longtail
  { img: 'assets/cars/hero-sedan-bronze.png', fixed: true, color: 'bronze' },
  { img: 'assets/cars/traffic-sedan-8.png', hue: 90, color: 'recolor' },              // lime GT3 RS
  { img: 'assets/cars/hero-classic-blue-stripe.png', fixed: true, color: 'blue-white-stripe' },
  { img: 'assets/cars/hero-muscle-grey-stripe.png', fixed: true, color: 'grey-stripe-muscle' },
  { img: 'assets/cars/hero-countach-nobadge.png', fixed: true, color: 'green-wedge' },
];

/* Self-propelled len-3 vehicles only — trailers live in TRAILER_PHOTOS and
   are chosen by gameplay role (hitch trailer), never by index accident.
   Same per-entry `color` tagging as SEDAN_PHOTOS, feeding the same
   bucketSequence() round-robin — 8 distinct colours here comfortably
   covers the largest level (6 concurrent trucks measured across all 200
   campaign levels). School bus stays fixed: hue-rotating its big unshaded
   roof panel turns it into a flat featureless block, and a non-yellow
   school bus reads wrong anyway. */
const TRUCK_PHOTOS = [
  { img: 'assets/cars/traffic-truck-3.png', fixed: true, color: 'silver-tanker' },
  { img: 'assets/cars/traffic-truck-new.png', fixed: true, color: 'blue-pickup' },
  { img: 'assets/cars/traffic-truck-2.png', fixed: true, color: 'yellow-bus' },
  { img: 'assets/cars/traffic-truck-1.png', fixed: true, color: 'green-garbage' },
  { img: 'assets/cars/traffic-truck-5.png', fixed: true, color: 'chrome-tanker' },
  { img: 'assets/cars/traffic-truck-new-rusty.png', fixed: true, color: 'rust-flatbed' },
  { img: 'assets/cars/traffic-truck-new-white.png', fixed: true, color: 'white-box' },
  { img: 'assets/cars/traffic-truck-4.png', hue: 358, color: 'recolor' },   // tow truck
];

/* Vehicles that cannot move by themselves: only pieces a level marks as a
   hitch trailer render with these (Airstream caravan, wood-deck utility
   trailer, boat — natural material colors, none recolor). */
const TRAILER_PHOTOS = [
  { img: 'assets/cars/traffic-truck-6.png', fixed: true },
  { img: 'assets/cars/traffic-truck-7.png', fixed: true },
  { img: 'assets/cars/traffic-truck-8.png', fixed: true },
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

function bucketize(pool){
  const buckets = {};
  pool.forEach(entry => (buckets[entry.color] ??= []).push(entry));
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

const sequenceCache = new Map(); // "poolName:seed:libVersion" -> resolved pick order

function bucketSequence(poolName, seed){
  const key = poolName + ':' + seed + ':' + libraryVersion();
  const cached = sequenceCache.get(key);
  if(cached) return cached;
  const buckets = bucketize(poolName === 'sedan' ? combinedSedanPhotos() : combinedTruckPhotos());

  const names = Object.keys(buckets);
  const start = seedHash(seed, poolName) % names.length;
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
   broken-down car and renders desaturated + dimmed so "needs a tow" reads
   at a glance. */
export function vehicleSVG(idx, len, dir, isHero, opts = {}){
  const skin = isHero ? opts.skin : null;
  const base = skin ? skin.base : (isHero ? PALETTE[0][0] : PALETTE[1 + (idx - 1) % (PALETTE.length - 1)][0]);
  const L = len * H;
  const gid = 'v' + idx + '-' + Math.random().toString(36).slice(2, 7);
  const soft = gid + 's';
  const seed = opts.seed ?? 0;
  const photoOrd = opts.photoOrd ?? 0;
  const isTrailer = !!opts.trailer && !isHero;
  // Computed unconditionally (cheap — memoized per seed) even though heroes
  // don't use them, so the unused branch below never indexes into null.
  const sedanSeq = bucketSequence('sedan', seed);
  const truckSeq = bucketSequence('truck', seed);
  // opts.photoOverride: the Sandbox's car/truck picker pins an exact asset
  // to one piece instead of letting the colour-safe rotation pick — used
  // nowhere else (real levels always want the rotation's variety).
  const override = opts.photoOverride ? { img: opts.photoOverride, fixed: true } : null;
  const sedanPhoto = override ?? (isHero ? SEDAN_PHOTOS[0] : sedanSeq[photoOrd % sedanSeq.length]);
  const truckPhoto = override ?? (isTrailer
    ? combinedTrailerPhotos()[photoOrd % combinedTrailerPhotos().length]
    : truckSeq[photoOrd % truckSeq.length]);
  const brokenDown = isTrailer && len < 3;
  const hueAttr = brokenDown ? ` filter="url(#${gid}broke)"` : (sedanPhoto.fixed ? '' : ` filter="url(#${gid}hue)"`);
  const hueAttr2 = truckPhoto.fixed ? '' : ` filter="url(#${gid}hue2)"`;

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
      <feColorMatrix type="hueRotate" values="${hueRotationFor(base, sedanPhoto.hue || 0)}"/>
      <feColorMatrix type="saturate" values="${satScaleFor(base)}"/>
    </filter>
    <filter id="${gid}hue2">
      <feColorMatrix type="hueRotate" values="${hueRotationFor(base, truckPhoto.hue || 0)}"/>
      <feColorMatrix type="saturate" values="${satScaleFor(base)}"/>
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
  } else if(len >= 3){
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

/* Interlock gate (camera/laser) symbol: a simple circle with crosshair.
   Overlaid on the board grid at gate cell positions. */
export function gateSVG(x, y, size = 30){
  return `<g opacity="0.85">
    <circle cx="${x}" cy="${y}" r="${size * 0.4}" fill="none" stroke="#00ffcc" stroke-width="2"/>
    <line x1="${x - size * 0.25}" y1="${y}" x2="${x + size * 0.25}" y2="${y}" stroke="#00ffcc" stroke-width="1.5"/>
    <line x1="${x}" y1="${y - size * 0.25}" x2="${x}" y2="${y + size * 0.25}" stroke="#00ffcc" stroke-width="1.5"/>
    <circle cx="${x}" cy="${y}" r="${size * 0.08}" fill="#00ffcc"/>
  </g>`;
}

/* Hitch coupling indicator: a tow-rope line connecting tow vehicle to trailer.
   Shows which pieces are currently coupled. */
export function hitchSVG(x1, y1, x2, y2, size = 4){
  return `<g opacity="0.75">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff9e5c" stroke-width="${size}" stroke-dasharray="${size * 3},${size * 2}" stroke-linecap="round"/>
    <circle cx="${x1}" cy="${y1}" r="${size * 1.2}" fill="#ff9e5c" opacity="0.9"/>
    <circle cx="${x2}" cy="${y2}" r="${size * 1.2}" fill="#ff9e5c" opacity="0.9"/>
  </g>`;
}
