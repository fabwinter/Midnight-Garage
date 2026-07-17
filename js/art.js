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
const SEDAN_PHOTOS = [
  { img: 'assets/cars/traffic-sedan-1.png', hue: 14 },
  { img: 'assets/cars/traffic-sedan-3.png', hue: 212 },
  { img: 'assets/cars/traffic-sedan-6.png', hue: 29 },
  { img: 'assets/cars/traffic-sedan-8.png', hue: 90 },
  { img: 'assets/cars/traffic-sedan-4.png', fixed: true },
  { img: 'assets/cars/traffic-sedan-5.png', fixed: true },
  // white paint + gray stripe and matte olive-drab are both near-desaturated
  // in the source photo — hueRotate can't manufacture chroma that isn't
  // there, so these stay fixed like the other branded/utility liveries.
  { img: 'assets/cars/traffic-sedan-7.png', fixed: true },
  { img: 'assets/cars/traffic-sedan-9.png', fixed: true },
  // GT3 RS's factory sage green is quite desaturated too (~.2-.3), same
  // reasoning as above; the Gulf liveried GT40 is obviously fixed (it's a
  // specific numbered race car, stripes and all).
  { img: 'assets/cars/traffic-sedan-10.png', fixed: true },
  { img: 'assets/cars/traffic-sedan-11.png', fixed: true },
  // silver Aston Martin and a plain white sedan — both near-achromatic.
  { img: 'assets/cars/traffic-sedan-12.png', fixed: true },
  { img: 'assets/cars/traffic-sedan-13.png', fixed: true },
  // Five new colored vehicles: yellow sports cars (fixed livery), generic colors, and striped variant
  { img: 'assets/cars/traffic-sedan-14.png', fixed: true },  // Ferrari (branded)
  { img: 'assets/cars/traffic-sedan-15.png', hue: 48 },       // Porsche (yellow)
  { img: 'assets/cars/traffic-sedan-16.png', hue: 13 },       // orange
  { img: 'assets/cars/traffic-sedan-17.png', hue: 209 },      // navy
  { img: 'assets/cars/traffic-sedan-18.png', fixed: true },   // silverstripe (branded)
];

/* Same idea as SEDAN_PHOTOS but for len-3 pieces (box truck / tanker /
   trailer slot). */
const TRUCK_PHOTOS = [
  { img: 'assets/cars/traffic-truck-1.png', fixed: true },
  { img: 'assets/cars/traffic-truck-2.png', hue: 41 },
  { img: 'assets/cars/traffic-truck-3.png', fixed: true },
  { img: 'assets/cars/traffic-truck-4.png', hue: 358 },
  { img: 'assets/cars/traffic-truck-5.png', fixed: true },
  // Airstream trailer (bare aluminum), wood-deck utility trailer, and a
  // boat — all natural material colors, not paint, so none recolor.
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

/* Determine if a piece can self-propel, based on its length and type.
   Trailers, caravans, and boats (certain truck indices) cannot move by themselves.
   Sedan 14 (Ferrari) is a broken-down car that needs a tow. */
export function isSelfPropelled(idx, len){
  if(len >= 3){
    // Trucks: check if it's a trailer/caravan/boat (indices 5, 6, 7)
    const truckIdx = idx % TRUCK_PHOTOS.length;
    return truckIdx !== 5 && truckIdx !== 6 && truckIdx !== 7;
  }
  // Sedan 14 (Ferrari) is broken-down and needs a tow
  if(idx % SEDAN_PHOTOS.length === 13){  // index 13 is traffic-sedan-14
    return false;
  }
  // All other sedans are self-propelled
  return true;
}

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

export function vehicleSVG(idx, len, dir, isHero, opts = {}){
  const skin = isHero ? opts.skin : null;
  const base = skin ? skin.base : (isHero ? PALETTE[0][0] : PALETTE[1 + (idx - 1) % (PALETTE.length - 1)][0]);
  const L = len * H;
  const gid = 'v' + idx + '-' + Math.random().toString(36).slice(2, 7);
  const soft = gid + 's';
  const sedanPhoto = isHero ? SEDAN_PHOTOS[0] : SEDAN_PHOTOS[idx % SEDAN_PHOTOS.length];
  const truckPhoto = TRUCK_PHOTOS[idx % TRUCK_PHOTOS.length];
  const hueAttr = sedanPhoto.fixed ? '' : ` filter="url(#${gid}hue)"`;
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
  </defs>`;

  /* Hero (classic photo car): tuned to classic.png's actual bumper edges
     (front ~98% across, rear ~1.5%) and headlight height (~16%/84% of the
     cell) — measured from the source art. Two separate cones (one per
     headlight) rather than one merged trapezoid, each blurred so the edge
     reads as light falloff instead of a flat polygon. A tight bright core
     sits right at each lens as the visible "source" the cones grow from.
     (mix-blend-mode:screen was tried for a true additive glow, but at this
     SVG's overflow:visible boundary it produced a visible seam where the
     beam crosses the piece's own viewBox — plain opaque-fading-to-transparent
     reads bright enough against the dark board without that artifact.) */
  const photoHeroExtra = (isHero && !skin) ? `
    <path d="M ${L - 8} 12 L ${L + 185} -8 L ${L + 185} 46 L ${L - 8} 20 Z" fill="url(#${gid}beam2)" filter="url(#${gid}bblur)"/>
    <path d="M ${L - 8} 88 L ${L + 185} 108 L ${L + 185} 54 L ${L - 8} 80 Z" fill="url(#${gid}beam2)" filter="url(#${gid}bblur)"/>
    <ellipse cx="${L - 2}" cy="16" rx="13" ry="10" fill="#fff3c2" opacity=".6" filter="url(#${gid}bblur)"/>
    <ellipse cx="${L - 2}" cy="84" rx="13" ry="10" fill="#fff3c2" opacity=".6" filter="url(#${gid}bblur)"/>
    <circle cx="${L - 3}" cy="16" r="3.2" fill="#fffbe8"/>
    <circle cx="${L - 3}" cy="84" r="3.2" fill="#fffbe8"/>
    <ellipse cx="5" cy="16" rx="6" ry="9" fill="#ff4a3a" opacity=".55" filter="url(#${soft})"/>
    <ellipse cx="5" cy="84" rx="6" ry="9" fill="#ff4a3a" opacity=".55" filter="url(#${soft})"/>
    <ellipse cx="3" cy="50" rx="6" ry="32" fill="#ff3b2e" opacity=".26" filter="url(#${soft})"/>` : '';

  const cb = opts.colorblind && !isHero;
  let body;
  if(isHero && !skin){
    // Classic (default) hero: photoreal render in place of the procedural
    // sedan. Skinned/unlocked cars still use the recolorable sedan below.
    body = `<image href="${CLASSIC_CAR_IMG}" x="0" y="0" width="${L}" height="${H}" preserveAspectRatio="none"/>${photoHeroExtra}`;
  } else if(isHero){
    // Garage skin equipped: same photo body as the classic hero, recolored
    // to the skin's paint via hueRotate, with the beam/glow tuned the same
    // way (both photos fill the cell edge-to-edge so the positions carry
    // over). trimSVG's beltline stripe was tuned to the old procedural
    // sedan's silhouette (paint above/below a windshield greenhouse) — this
    // car's canopy runs nearly the full width, so the same stripe cuts
    // across the glass instead of following a body line. Skipping trim
    // here until it gets a version designed for this car's proportions;
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
