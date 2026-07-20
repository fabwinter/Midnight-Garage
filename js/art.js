/* Vehicle + board art (AAA plan §3.0). Authored as SVG on purpose: the DOM
   renderer uses it directly today, and the R1 WebGL layer rasterizes the
   same SVGs into its sprite atlas later — nothing here is throwaway.

   All bodies are drawn horizontally with the FRONT at the right end, in
   100-unit cell coordinates, then rotated as a group for vertical pieces.
   Every traffic piece is a photoreal car/truck (see SEDAN_PHOTOS and
   TRUCK_PHOTOS below) cycled by piece index so a full board reads as
   varied traffic, not clones. There is no procedural fallback body
   anymore — the photo library is the only source of vehicle art. */

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
const SEDAN_PHOTOS = [
  { img: 'assets/cars/traffic-sedan-6.png', hue: 29 },       // orange hypercar (skin body)
  { img: 'assets/cars/traffic-sedan-3.png', hue: 212 },      // navy classic GT
  { img: 'assets/cars/traffic-sedan-8.png', hue: 90 },       // lime GT3 RS
  // white paint + gray stripe and matte olive-drab are both near-desaturated
  // in the source photo — hueRotate can't manufacture chroma that isn't
  // there, so these stay fixed like the other branded/utility liveries.
  { img: 'assets/cars/traffic-sedan-4.png', fixed: true },   // silver + yellow stripe GT
  { img: 'assets/cars/traffic-sedan-5.png', fixed: true },   // yellow Ferrari, tricolor stripe
  { img: 'assets/cars/traffic-sedan-7.png', fixed: true },   // white classic 911, black stripe
  // the olive G-wagon (sedan-9) was dropped: its source photo is stubby
  // enough (~1.7:1) that fitting it to the shared 97%-of-length norm every
  // other car uses would overflow the cell's height, and shrinking it to
  // fit instead left it visibly shorter than every other piece on the
  // board — same "doesn't belong in rotation" call as the shadowed Countach.
  { img: 'assets/cars/traffic-sedan-11.png', fixed: true },  // Gulf GT40 (numbered race car)
  { img: 'assets/cars/traffic-sedan-12.png', fixed: true },  // silver 300SL
  // generic hatchback body, all real-photo colors (see note above). Every
  // entry here shares the exact same fitted footprint (776x343 within the
  // 800x400 canvas) rather than each being scaled from its own measured
  // bbox — sedan-13's source photo turns out to be from a different shoot
  // than the other twelve (they share identical raw dimensions; it doesn't)
  // and independently measured ~12% "fatter", which is what actually caused
  // the "colored cars are narrower than the white one" bug: it wasn't the
  // colored ones that were wrong, sedan-13 was oversized. A second same-body
  // photo (traffic-sedan-26, meant to be a silver variant) turned out on
  // inspection to be white too — dropped as a duplicate color rather than
  // kept alongside sedan-13.
  { img: 'assets/cars/traffic-sedan-13.png', fixed: true },  // white
  { img: 'assets/cars/traffic-sedan-21.png', fixed: true },  // purple + yellow stripes
  { img: 'assets/cars/traffic-sedan-22.png', fixed: true },  // Biarritz blue
  { img: 'assets/cars/traffic-sedan-24.png', fixed: true },  // yellow taxi
  { img: 'assets/cars/traffic-sedan-25.png', fixed: true },  // police K-9 unit
  { img: 'assets/cars/traffic-sedan-27.png', fixed: true },  // dark green
  { img: 'assets/cars/traffic-sedan-28.png', fixed: true },  // rusted/weathered
  { img: 'assets/cars/traffic-sedan-29.png', fixed: true },  // gunmetal gray
  { img: 'assets/cars/traffic-sedan-30.png', fixed: true },  // teal
  { img: 'assets/cars/traffic-sedan-31.png', fixed: true },  // pink
  { img: 'assets/cars/traffic-sedan-32.png', fixed: true },  // gold
  { img: 'assets/cars/traffic-sedan-33.png', fixed: true },  // orange
  { img: 'assets/cars/traffic-sedan-34.png', fixed: true },  // brown
];

/* Self-propelled len-3 vehicles only — trailers live in TRAILER_PHOTOS and
   are chosen by gameplay role (hitch trailer), never by index accident. */
const TRUCK_PHOTOS = [
  { img: 'assets/cars/traffic-truck-1.png', fixed: true },   // garbage truck
  // school bus was hue-rotatable but its roof is one large, almost
  // unshaded panel — hueRotate turns that into a flat, featureless block
  // of whatever the target color is (worst on a piece landing on a purple
  // palette slot), and a non-yellow school bus reads wrong anyway.
  { img: 'assets/cars/traffic-truck-2.png', fixed: true },   // school bus
  { img: 'assets/cars/traffic-truck-3.png', fixed: true },   // tanker
  { img: 'assets/cars/traffic-truck-4.png', hue: 358 },      // tow truck
  { img: 'assets/cars/traffic-truck-5.png', fixed: true },   // chrome tanker
];

/* Vehicles that cannot move by themselves: only pieces a level marks as a
   hitch trailer render with these (Airstream caravan, wood-deck utility
   trailer, boat — natural material colors, none recolor). */
const TRAILER_PHOTOS = [
  { img: 'assets/cars/traffic-truck-6.png', fixed: true },
  { img: 'assets/cars/traffic-truck-7.png', fixed: true },
  { img: 'assets/cars/traffic-truck-8.png', fixed: true },
];

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

/* opts.photoIdx — this piece's ordinal among pieces of the same class
   (sedan / truck / trailer) in the level, so every piece in one level gets
   a different photo. Falls back to the global piece index for callers that
   don't pass it. opts.trailer — this piece is a hitch trailer: len-3 draws
   from TRAILER_PHOTOS (caravan / utility trailer / boat); a len-2 trailer
   is a broken-down car and renders desaturated + dimmed so "needs a tow"
   reads at a glance. */
export function vehicleSVG(idx, len, dir, isHero, opts = {}){
  const skin = isHero ? opts.skin : null;
  const base = skin ? skin.base : (isHero ? PALETTE[0][0] : PALETTE[1 + (idx - 1) % (PALETTE.length - 1)][0]);
  const L = len * H;
  const gid = 'v' + idx + '-' + Math.random().toString(36).slice(2, 7);
  const soft = gid + 's';
  const photoIdx = opts.photoIdx ?? idx;
  const isTrailer = !!opts.trailer && !isHero;
  const sedanPhoto = isHero ? SEDAN_PHOTOS[0] : SEDAN_PHOTOS[photoIdx % SEDAN_PHOTOS.length];
  const truckPhoto = isTrailer
    ? TRAILER_PHOTOS[photoIdx % TRAILER_PHOTOS.length]
    : TRUCK_PHOTOS[photoIdx % TRUCK_PHOTOS.length];
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

     Only ever drawn over art that actually follows classic.png's layout
     (front-right, headlights at this exact spot): the default red hero, or
     a job car with its own bespoke `skin.photo` (see collection.js) built
     to the same spec. A job car without art yet falls back to a recolored
     traffic-sedan photo below, which was never shot to this layout — its
     front end and lack of real headlights are why overlaying a beam here
     used to look wrong for every skinned car, so it's withheld until that
     car's own art lands. */
  const photoHeroExtra = (isHero && (!skin || skin.photo)) ? `
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
    // Job car with no bespoke render yet: same photo body as the classic
    // hero, recolored to the skin's paint via hueRotate (both photos fill
    // the cell edge-to-edge so the positions carry over). No beam/glow
    // overlay here — this traffic-sedan photo was never shot to
    // classic.png's front-right layout, so the beam would sit on the
    // wrong edge of the car; photoHeroExtra already withholds it above.
    // trimSVG's beltline stripe was tuned to the old procedural sedan's
    // silhouette (paint above/below a windshield greenhouse) — this car's
    // canopy runs nearly the full width, so the same stripe cuts across
    // the glass instead of following a body line. Skipping trim here too;
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
