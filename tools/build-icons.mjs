#!/usr/bin/env node
// Regenerates every app-icon asset from one vector source.
//
//   node tools/build-icons.mjs        (or: npm run icons)
//
// Outputs, all derived from icon() below so they can never drift apart:
//   assets/icon.svg                                  web favicon (rounded)
//   ios/.../AppIcon.appiconset/AppIcon-512@2x.png    1024, square, opaque
//   android/.../mipmap-*/ic_launcher.png             legacy square
//   android/.../mipmap-*/ic_launcher_round.png       legacy round
//   android/.../mipmap-*/ic_launcher_foreground.png  adaptive fg (car only)
//   android/.../mipmap-*/ic_launcher_background.png  adaptive bg (scene)
//
// The Android sizes below are the *legacy* launcher sizes, which is what
// this project's adaptive-icon XML expects: it wraps both layers in
// `<inset android:inset="16.7%">`, scaling a legacy-sized drawable down
// into the 108dp canvas's 72dp safe zone. Keep the sizes as-is unless you
// also rewrite mipmap-anydpi-v26/*.xml.
//
// Artwork: hero car nosing toward the lit exit gate, dark parking level
// behind it. Original vector work — nothing here is traced from or
// derived from any real vehicle (see docs/ASSET-PROVENANCE.md).

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Palette matches css/game.css :root — --red, --amber, --night.
const RED = '#ff3b4e', AMBER = '#ffb454';

// Body outline, shared by the fill, the clip and the stroke so the three
// can't drift. Nose right (toward the gate), tail left.
const BODY = `M 118 402 Q 118 356 190 356 L 610 356 Q 732 356 796 386
              Q 830 402 830 512 Q 830 622 796 638 Q 732 668 610 668
              L 190 668 Q 118 668 118 622 Z`;

const defs = `
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#171d2a"/>
    <stop offset=".55" stop-color="#0e121b"/>
    <stop offset="1" stop-color="#070910"/>
  </linearGradient>
  <radialGradient id="gateGlow" cx="100%" cy="50%" r="70%">
    <stop offset="0" stop-color="${AMBER}" stop-opacity=".5"/>
    <stop offset=".42" stop-color="${AMBER}" stop-opacity=".13"/>
    <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff96a0"/>
    <stop offset=".2" stop-color="${RED}"/>
    <stop offset=".7" stop-color="#dd1a2f"/>
    <stop offset="1" stop-color="#8a0c18"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6d80a0"/>
    <stop offset=".45" stop-color="#222d40"/>
    <stop offset="1" stop-color="#161d2b"/>
  </linearGradient>
  <linearGradient id="blockGlass" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#2a3346"/>
    <stop offset="1" stop-color="#1a2130"/>
  </linearGradient>
  <linearGradient id="noseLight" x1=".42" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${AMBER}" stop-opacity="0"/>
    <stop offset="1" stop-color="#ffdca8" stop-opacity=".55"/>
  </linearGradient>
  <filter id="soft" x="-45%" y="-45%" width="190%" height="190%">
    <feGaussianBlur stdDeviation="30"/>
  </filter>
  <filter id="tight" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
  <clipPath id="bodyClip"><path d="${BODY}"/></clipPath>
`;

const car = `
<g>
  <ellipse cx="480" cy="596" rx="352" ry="132" fill="#000" opacity=".45" filter="url(#soft)"/>
  <g fill="#080a10">
    <rect x="200" y="330" width="112" height="54" rx="21"/>
    <rect x="200" y="640" width="112" height="54" rx="21"/>
    <rect x="630" y="330" width="112" height="54" rx="21"/>
    <rect x="630" y="640" width="112" height="54" rx="21"/>
  </g>
  <path d="${BODY}" fill="url(#carBody)"/>

  <!-- Greenhouse: one dark shape with the painted roof floating inside it,
       leaving a windshield, a rear screen and a side-glass strip down each
       flank. Cutting it as two separate trapezoids instead reads as a
       bowtie once the icon is scaled down. -->
  <rect x="348" y="402" width="330" height="220" rx="56" fill="url(#glass)"/>
  <path d="M 392 442 Q 392 418 428 418 L 540 418 Q 574 422 586 452
           L 586 572 Q 574 602 540 606 L 428 606 Q 392 606 392 582 Z"
        fill="url(#carBody)"/>
  <rect x="406" y="430" width="152" height="26" rx="13" fill="#fff" opacity=".13"/>

  <!-- Warm spill from the gate: makes the car read as driving into the
       light rather than parked beside a decorative stripe. -->
  <g clip-path="url(#bodyClip)"><rect width="1024" height="1024" fill="url(#noseLight)"/></g>

  <path d="${BODY}" fill="none" stroke="#000" stroke-opacity=".42" stroke-width="9"/>
  <path d="M 196 374 L 608 374 Q 716 374 774 400" fill="none"
        stroke="#fff" stroke-opacity=".3" stroke-width="13" stroke-linecap="round"/>
  <rect x="700" y="504" width="104" height="9" rx="5" fill="#fff" opacity=".12"/>

  <g fill="#fff4d2">
    <rect x="790" y="398" width="34" height="48" rx="16"/>
    <rect x="790" y="578" width="34" height="48" rx="16"/>
  </g>
  <rect x="128" y="478" width="16" height="68" rx="8" fill="#ff7c88" opacity=".85"/>
</g>`;

// Parked blockers, cropped by the frame — says "traffic jam" at a glance,
// deliberately low-contrast so the hero car stays the subject.
const blocker = (x, y, w, h) => `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="52" fill="#1b2231"/>
    <rect x="${x + 16}" y="${y + h * 0.3}" width="${w - 32}" height="${h * 0.34}" rx="22" fill="url(#blockGlass)"/>
  </g>`;

const scene = `
  <g stroke="#3b4762" stroke-width="9" stroke-linecap="round" opacity=".42"
     stroke-dasharray="48 40">
    <path d="M 84 316 H 880"/>
    <path d="M 84 708 H 880"/>
  </g>
  ${blocker(330, 30, 152, 262)}
  ${blocker(556, 30, 152, 226)}
  ${blocker(330, 732, 152, 262)}
  ${blocker(596, 768, 152, 226)}
  <rect width="1024" height="1024" fill="url(#gateGlow)"/>
  <rect x="930" y="150" width="34" height="724" rx="17" fill="${AMBER}" opacity=".6" filter="url(#tight)"/>
  <rect x="936" y="164" width="22" height="696" rx="11" fill="#ffdca8"/>
  <!-- the board's own gate marker (js/art.js draws a ▶ on the live gate) -->
  <path d="M 872 462 L 872 562 L 926 512 Z" fill="${AMBER}"/>
`;

// layer: 'all' | 'background' (scene, no car) | 'foreground' (car, no scene)
// scale: shrinks the *content* about the centre while the floor stays
//   full-bleed. Android adaptive icons only guarantee the middle 72 of the
//   108dp canvas survives masking, so the adaptive layers draw at 72/108
//   to keep the car and the gate inside that safe zone; the floor gradient
//   carries the rest of the canvas so a wider OEM mask reveals more art,
//   never a transparent corner.
// sized=false drops width/height so the SVG scales to whatever box it is
// dropped into — what a favicon needs. sharp reads the viewBox either way.
function icon({ rounded = false, layer = 'all', scale = 1, sized = true } = {}) {
  const r = rounded ? ' rx="230"' : '';
  const clip = rounded ? ' clip-path="inset(0 round 230px)"' : '';
  const plate = layer === 'foreground'
    ? ''
    : `<rect width="1024" height="1024"${r} fill="url(#floor)"/>`;
  const body = layer === 'foreground' ? car : (layer === 'background' ? scene : scene + car);
  const fit = scale === 1
    ? body
    : `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${body}</g>`;
  const dim = sized ? ' width="1024" height="1024"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"${dim}>
<defs>${defs}</defs>
${plate}
<g${clip}>${fit}</g>
</svg>`;
}

const svgBuf = (opts) => Buffer.from(icon(opts));
// density: nudges resvg's rasterisation up so the blur filters and the
// 1px-scale gradients don't band when the output is small.
const render = (opts, size) =>
  sharp(svgBuf(opts), { density: 384 }).resize(size, size).png({ compressionLevel: 9 });

async function write(file, pipeline) {
  mkdirSync(dirname(file), { recursive: true });
  await pipeline.toFile(file);
  return file;
}

// Legacy launcher icons are 48dp; adaptive-icon layers are 108dp. Emitting
// the adaptive layers at their real size is what lets mipmap-anydpi-v26/
// *.xml reference them directly, with no <inset> wrapper — see the note at
// icon()'s `scale`.
const DENSITY = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const LEGACY_DP = 48, ADAPTIVE_DP = 108, SAFE = 72 / 108;
const RES = 'android/app/src/main/res';
const written = [];

// --- web favicon: rounded, since it's shown unmasked in a browser tab ---
writeFileSync('assets/icon.svg', icon({ rounded: true, sized: false }));
written.push('assets/icon.svg');

// --- iOS: one 1024 master, square and fully opaque (Apple rejects alpha
//     and applies its own corner mask) ---
written.push(await write(
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  render({ rounded: false }, 1024).flatten({ background: '#0b0e14' }),
));

// --- Android ---
for (const [dpi, mult] of Object.entries(DENSITY)) {
  const legacy = Math.round(LEGACY_DP * mult);
  const adaptive = Math.round(ADAPTIVE_DP * mult);

  written.push(await write(`${RES}/mipmap-${dpi}/ic_launcher.png`,
    render({}, legacy).flatten({ background: '#0b0e14' })));

  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${legacy}" height="${legacy}">
       <circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="#fff"/></svg>`);
  written.push(await write(`${RES}/mipmap-${dpi}/ic_launcher_round.png`,
    render({}, legacy).composite([{ input: circle, blend: 'dest-in' }])));

  written.push(await write(`${RES}/mipmap-${dpi}/ic_launcher_background.png`,
    render({ layer: 'background', scale: SAFE }, adaptive).flatten({ background: '#0b0e14' })));
  written.push(await write(`${RES}/mipmap-${dpi}/ic_launcher_foreground.png`,
    render({ layer: 'foreground', scale: SAFE }, adaptive)));
}

console.log(`wrote ${written.length} icon files`);
