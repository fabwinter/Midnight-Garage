# Asset provenance and rights

The record of where every shipped asset came from and what right we have to
ship it. App Review rarely asks, but Guideline 5.2 puts the burden of proof
on us, and a rightsholder complaint after launch is worse than a rejection
before it. Keep this current — if an asset lands without a row here, it
isn't cleared to ship.

## Music — cleared

All music is owned/licensed by the developer (Fabian Winterbine) with
distribution rights for this app on the App Store and Google Play.
Confirmed 2026-07-30.

Keep the actual licence documents, purchase receipts, or generation-service
terms somewhere retrievable outside this repo — if a claim ever arrives, the
turnaround expected is days, not weeks. Note which of the two applies:

- If any track came from an AI generation service, the cleared right is
  whatever that service's commercial terms grant. Record the service, the
  plan tier at time of generation, and the terms URL — some services grant
  commercial use only on paid tiers, and only from the date of subscription.
- If a track was commissioned or bought outright, record the agreement and
  whether it covers sync in an interactive product (a plain "royalty free"
  music licence sometimes excludes games).

| File | Used for |
|---|---|
| `velvet-glove.m4a` | Start-screen theme, Settings "Theme" button, Heist set list track 1 |
| `clean-getaway.m4a` | Settings / Garage / Daily / Bounty menu music |
| `heist-silver-getaway.m4a` | Heist set list 2 |
| `heist-glovebox-prayer.m4a` | Heist set list 3 |
| `heist-midnight-joyride.m4a` | Heist set list 4 |
| `heist-speeding-away.m4a` | Heist set list 5 |
| `heist-let-them-go.m4a` | Heist set list 6 |
| `heist-chrome-getaway.m4a` | Heist set list 7 |
| `heist-time-is-ticking.m4a` | Heist set list 8 |
| `heist-new-town-somehow.m4a` | Heist set list 9 |
| `heist-cherry-run.m4a` | Heist set list 10 |
| `pursuit-1.m4a` | Pursuit attempt pool |
| `pursuit-2.m4a` | Pursuit attempt pool |
| `pursuit-3.m4a` | Pursuit attempt pool |
| `pursuit-4.m4a` | Pursuit attempt pool |
| `relaxed-velvet-drift.m4a` | Relaxed shuffle pool |
| `relaxed-velvet-midnight-loop.m4a` | Relaxed shuffle pool |
| `relaxed-glassroom-stroll.m4a` | Relaxed shuffle pool |
| `relaxed-velvet-after-midnight.m4a` | Relaxed shuffle pool |
| `relaxed-velvet-after-hours.m4a` | Relaxed shuffle pool |

2026-08-03: the Relaxed pool's 5 tracks were replaced with new AAC/`.m4a`
masters supplied by the developer (same rights coverage as the rest of
this table — owned/licensed by Fabian Winterbine), superseding the old
MP3 files 1:1 by slot; the old `relaxed-*.mp3` files were deleted, not
kept alongside. Verified each via `ffprobe -show_entries
stream=codec_name` (all `aac`, ~130 kbps, 48 kHz stereo) before wiring
`js/audio.js`'s `TRACK_POOLS.relaxed` to the new filenames, then
confirmed in a headless Playwright pass that `startAttemptTrack()` in
Relaxed mode requests the new files with a 200/206 response and no
console errors (real AAC decode still can't be verified in this
sandbox's Chromium — see CLAUDE.md's audio-testing note).

Same day, Pursuit's 4 tracks were **re-encoded** (not replaced — same
underlying recordings, unlike Relaxed) from the original MP3s to AAC via
`ffmpeg -c:a aac -b:a 128k -ar 48000 -ac 2`, matching the Heist set's
measured settings. Durations matched the source MP3s to within ~40 ms
(normal encoder-framing rounding); each output verified via `ffprobe` as
real `aac` at ~131-132 kbps, 48 kHz stereo — then the same headless
Playwright check confirmed Pursuit mode's `startAttemptTrack()` requests
the new `.m4a` files with a 200/206 response and no console errors.
Original MP3s deleted, not kept alongside. **This closes the P1 audio
re-encode item — Heist, Relaxed, and Pursuit are all AAC/`.m4a` now.**

Filenames are deliberately neutral and need not match the tracks' actual
titles; the shipped name is just a path. Track titles are never displayed
in-game, so retitling a song has no code impact.

**Ship AAC, never Opus** — see CLAUDE.md. Verify with
`ffprobe -show_entries stream=codec_name`; it must say `aac`.

## Vehicle art — NOT cleared, action required

Status: **open risk, tracked here rather than resolved.**

The 71 files in `assets/cars/` are photoreal top-down renders. Filenames and
`color` tags were neutralised on 2026-07-30 (marque words replaced with
body-type words: wedge / roadster / midship / coupe / hatch / offroad /
racer / spyder / hyper). **That was a naming fix only — it changed no
pixels.** Several assets still depict identifiable production vehicles, and
a few carry readable third-party wordmarks. See "Known exposures" below.

Renaming does not reduce legal exposure. It only stops the repo from
documenting the problem on our behalf.

### How complete is this list? It isn't.

Two automated sweeps were attempted over all 71 renders (2026-07-30) and
**neither can certify a file as clean**:

- **Edge-energy detection** (high-pass luminance, tile scoring, flood-fill
  into candidate boxes). Ranked body creases, chrome trim and window frames
  above actual lettering. It surfaced the large text already known
  (`POLICE`, `K-9`, a race number) and buried every small badge.
- **OCR** (Tesseract 5.3.4, sparse-text mode, 4 rotations × 2
  magnifications — plan-view cars carry text at every angle). Roughly 95% of
  its output is letter-soup from panel gaps, engine louvres and speckle
  texture. It *did* hit the real marks, but too garbled for automated
  matching: `Superformance` came out `EASUPERFORMANEE`, the `GTO` badge as
  `OTO`, medallion text as `MEDALLION`/`WEDALLION`, `1Z92` as `1282`. Exact
  searches for `NYC`, `TAXI`, `GIRLING` and `MARCHAL` returned **zero** hits
  on files where all four are plainly legible by eye.

So: a file with no automated hit has not been cleared. The only reliable
check performed so far is direct visual inspection, and that has covered
roughly 20 of 71 assets — turning up marks or badges in about a third of
them, including two found *after* the "none of them have badges" assumption
was recorded. Assume the ~50 un-zoomed assets hide more at a similar rate.

The audit is now costing more than the fix. Replacing the vehicle set with
art drawn from no specific real vehicle both resolves the exposure and ends
the need to prove a negative across 71 photoreal renders.

### Known exposures, worst first

1. **`traffic-sedan-11.webp`** — racing livery carrying readable third-party
   wordmarks (`Superformance`, `GIRLING`, `MARCHAL`), racing roundels, and a
   blue/orange oil-company livery that is a registered mark actively
   licensed by its owner. This is not a silhouette question: there is
   legible third-party branding in a shipped file. Replace or repaint.
2. **`library-sedans-1785067674835-4-yellow-cab.webp`** and
   **`traffic-sedan-24.webp`** — municipal taxi livery with a readable
   `NYC TAXI` wordmark, a medallion roundel, a medallion number and a fare
   line. Protected marks. Replace or repaint to a generic cab livery.
3. **`library-sedans-1785066252701-0-pink-wedge.webp`** — a manufacturer
   badge is still visible on the nose despite the "no badges" intent. Remove
   the badge at minimum.
4. **`hero-hyper-carbon.webp`** — carries a race number and a small visible
   emblem.
4b. **`traffic-sedan-3.webp`** — chrome **model-designation badge** on the
   rear deck, legible when zoomed. Found while evaluating this file as a
   *replacement* for exposure 1, which is how it came to light. Remove the
   badge, or don't promote this one into use.
4c. **`hero-vintage-white.webp`** — two lines of small **dealer-decal text**
   on the engine lid (a shop name and location, as classic-car photography
   often carries). Third-party text. The car is also a highly recognisable
   rounded rear-engine silhouette whose maker does enforce it, so this
   belongs in group 5 as well.
   **Still present as of the 2026-07-31 library promotion** — that update
   overwrote this file with an admin-edited version (recolour/reposition
   via the in-game Library panel) that rotated the composition 180° but
   carries the same decal text, now at the opposite end. Not fixed by that
   edit; still open.
5. **Recognisable silhouettes with no visible branding.** Lower risk than
   1-4 but not zero, because body shape can itself be protected trade dress
   and several of these marques enforce it: `hero-wedge-green`,
   `hero-midship-red`, `hero-racer-orange`, `hero-hyper-teal`,
   `hero-hyper-champagne`, `hero-roadster-blue`, `hero-coupe-gold`,
   `hero-offroad-orange`, the 12 `*-wedge` library recolours (all one
   model), `traffic-sedan-5` (national-flag racing stripe),
   `traffic-sedan-12`, `traffic-sedan-4`, `traffic-sedan-8`,
   `hero-vintage-white`.

   Mitigating: every render is a **plan view**. Top-down hides the grille,
   badges and profile that carry most of a vehicle's recognisable identity,
   which is a real reduction in similarity — but it does not help where the
   plan view is itself distinctive (an angular wedge with engine louvres, a
   quad-exhaust hypercar tail, a boxy off-roader with roof panels and a
   bonnet-mounted spare).

6. **`*-police.webp` / `traffic-sedan-25.webp`** — generic police livery
   (`POLICE`, `K-9`, `UNIT 345`, a shield emblem). "Police" is descriptive
   and low risk; confirm the shield emblem isn't a real department's.

### Lowest-effort paths to clearing this

- Replace the flagged files with commissioned or generated art drawn from
  no specific real vehicle, and record its provenance here.
- Or keep the renders and repaint/reshape the identifying features: delete
  all legible text and badges, and alter the distinctive body lines on the
  items in group 5.
- Whatever route: record for each file where the image came from and what
  licence covers it. "It was on my drive" is not a provenance record.

### 2026-07-31 addition: 4 of 5 submitted renders added, 1 held

Five new top-down renders were submitted for the sedan pool. Checked each at
full resolution around the nose, headlight and rear-deck areas (the exact
regions that turned up problems in the existing set) before adding anything.

**Added** — no legible text or badges found on close inspection:
- `hero-canopy-green.webp` — mid-engine two-seater, red interior, hex side
  vents. Distinctive silhouette; no mark found on the hood/rear-deck vent.
- `hero-airtail-blue.webp`, `hero-airtail-stripe.webp`, `hero-airtail-pink.webp`
  — three liveries of one shared body (quad round lamps, roof duct, long
  tail, big rear wing). Zoomed both front badge locations on all three;
  found only parking-sensor dots, no emblem.

Source photos arrived portrait (nose up); rotated -90 deg and fit into the
same 800x400 canvas at 97% scale used everywhere else in this pool (the
exact parameters `js/library.js`'s `renderToCanvas` uses for an admin
upload), so these behave identically to a normal admin-added asset at
runtime. Verified in a live board with zero console errors.

### 2026-07-31 addition: 5 truck renders, 4 added (2 retouched), 1 held

Five new top-down truck renders were submitted. Same close-inspection pass
as the sedan batch, at the nose/badge/panel areas — this time it actually
found problems worth fixing rather than just ruling out.

**Added as-is** — no marks found:
- `truck-flatbed-green.webp` — canvas-bed cargo truck, khaki/olive, no badge
  or text anywhere on the cab or bed.
- `truck-tanker-steel.webp` — multi-compartment fuel tanker. Carries a blue
  rectangular hazmat/ADR-style placard with a stacked number code. This is
  a generic regulatory placard, not a brand mark — comparable risk to the
  existing `police` livery already in the pool — so it shipped unedited.

**Added after a retouch** — one small mark each, cleanly removable because
the surrounding surface was uniform enough to patch invisibly:
- `truck-offroad-pickup-grey.webp` — had a chrome oval model-designation
  badge on the tailgate trim. Filled with the trim's own sampled colour
  (flat fill, not a clone from elsewhere, since the trim right around the
  badge is uniformly black) — the styling groove the badge sat in is still
  there (that's original design, not a mark), just the badge itself is
  gone. Checked at 5x zoom afterward; no seam visible.
- `truck-rollback-orange.webp` — a car-carrier/rollback tow truck (this is
  ordinary traffic art, unrelated to `TOW_TRUCK_PHOTO`, the one specific
  file `js/art.js` hardcodes for the hitch-mechanic's dedicated tow role —
  see `traffic-truck-4.webp`). Original carried a full third-party company
  logo (mascot bird + wordmark) on the flatbed panel — a vendor's own
  marketing watermark baked into their stock render, not a manufacturer
  badge. Sampled the panel's flat colour from a confirmed-blank strip
  elsewhere on the same panel and filled the logo's bounding box; the panel
  is CAD-flat-shaded there, so a flat fill matches better than attempting a
  clone-from-elsewhere would.

**Held, not added** — a cement-mixer render carries a manufacturer wordmark
(reads as **HOWO**, the Sinotruk truck brand) directly on the mixer drum.
Unlike the two retouches above, this text sits right at the seam between
the drum and the chassis frame behind it, not on a uniform surface — a
patch there risked a visible mismatch rather than a clean fix, so it was
left out rather than shipped with a shaky edit. Source file wasn't kept;
ask again if it's worth finishing properly (redraw the drum panel rather
than patch around the seam).

All four added trucks: rotated to landscape where needed and fit into the
1200x400 truck canvas at 97% scale (`renderToCanvas`'s truck-category
parameters). Verified in a live board — 3 of 4 directly observed rendering
with zero console errors; the 4th runs the identical code path and was
confirmed correct in the pre-ship composite, just not statistically
sampled before the verification script's own timeout.

### 2026-07-31 addition: 4 more (2 new liveries, 2 re-renders of previously-held vehicles)

Two new liveries of the already-shipped sports car body, plus what turned
out to be fresh renders of the exact two vehicles held earlier this same
day — this time genuinely unmarked. All four added; none needed a retouch.

- `hero-airtail-red.webp`, `hero-airtail-purple-yellow.webp` — same shared
  body as the existing `hero-airtail-*` liveries. Checked both nose-badge
  locations; only parking-sensor dots, same as the earlier three.
- `truck-panel-orange.webp` — same cab as `truck-rollback-orange`, but
  attached to a plain riveted-aluminum box body instead of the branded CAD
  flatbed. Checked the full panel at high zoom: no logo, no text. This is
  a different rear body, not the same file with the mark cropped out.
- `truck-mixer-cream.webp` — the same mixer truck held earlier today for
  the "HOWO" wordmark on its drum. This render's drum was checked
  end-to-end at full resolution: clean. Cab, chute and rear also checked;
  nothing found. Added.

Confirms the earlier calls were about specific renders, not about the
underlying 3D models being unusable — a different export of the same
vehicle can come back clean. Worth re-checking a held vehicle if a new
render of it shows up, rather than assuming it's permanently blocked.

Verified live: 3 of 4 directly observed rendering with zero console errors;
`truck-panel-orange` runs the identical pipeline as the other three,
confirmed correct in the pre-ship composite.

**Held, not added** — a fifth render (purple/yellow) carries a **full
manufacturer crest on the nose** and **the exact model designation spelled
out in text on both rear wing endplates**. This is not a silhouette
judgement call: it is a literal badge plus literal model name, worse than
anything already flagged above. Needs the crest and both instances of text
removed (or the wing endplates repainted blank) before this one ships.
Original file wasn't retained in the repo — ask for it again if it's worth
finishing.

### 2026-08-02: every flagged asset removed from the shipped pool

At the developer's direction, every file named in "Known exposures" above
(groups 1-4c, and the explicitly-named group 5 silhouettes) was deleted
from `assets/cars/` and its `SEDAN_PHOTOS` array entry removed —
24 array entries plus 5 already-orphaned files sharing the same flagged
models, 29 files total. `verify-levels.mjs` still passes (34 sedans
remain, comfortably above the colour-family floor), and a live render
pass confirmed zero console errors and zero failed asset requests
afterward.

Group 5's own text said "the 12 `*-wedge` library recolours" — re-checked
visually while removing these and could only confirm **11**: the 10 files
with `wedge` in the name plus `library-sedans-1785066252701-1-silver-
yellow-stripe.webp`, which turned out to be an unlabeled recolor of the
identical body (same hex vents, same door NACA duct — confirmed by
side-by-side comparison, not assumed). Treat the original "12" as a minor
count error in that entry, not a 12th file still out there unaccounted
for — this was a full re-verification, not a re-statement of the old
number.

**Two things intentionally NOT removed, flagged here for a decision
rather than acted on unilaterally:**

- **`library-sedans-1785067674835-12-orange-coupe.webp`** and
  **`-15-green-coupe.webp`** — visually confirmed to share the exact
  body/silhouette just removed for `hero-coupe-gold` (compared side by
  side). Group 5's text never named these two specifically by filename,
  only `hero-coupe-gold` itself, so they were left in place rather than
  swept in by inference. If the concern that got `hero-coupe-gold`
  removed applies to its shape generally, it applies to these two as
  well — worth a decision either way rather than an inconsistency by
  accident.
- **`library-sedans-1785067674835-6-police.webp`** — generic police
  livery. This was always framed as low-risk/"confirm the shield emblem
  isn't a real department's," not as a flagged exposure, so it wasn't
  included in this removal pass. Still worth that one confirmation check
  before considering the vehicle-art risk fully closed out.

### What needs replacing

Every filename below is gone from both `assets/cars/` and the pool.
Body-type description included so a commissioned or generated
replacement can be briefed without needing to see the original (which,
by design, is no longer in the repo to look at):

| Removed file | Body type | Why it was flagged |
|---|---|---|
| `traffic-sedan-11.webp` | racing GT coupe | readable third-party wordmarks + a registered racing livery |
| `library-sedans-1785067674835-4-yellow-cab.webp` | municipal taxi liveried sedan | readable NYC TAXI wordmark + medallion |
| `library-sedans-1785066252701-0-pink-wedge.webp` | angular mid-engine wedge supercar | manufacturer badge visible on nose |
| `hero-hyper-carbon.webp` | quad-exhaust hypercar | race number + small emblem |
| `hero-vintage-white.webp` | rounded rear-engine classic | dealer-decal text + recognisable maker silhouette |
| `hero-midship-red.webp` | mid-engine supercar, glazed engine cover | recognisable maker silhouette |
| `hero-racer-orange.webp` | central-driving-position track car, roof snorkel | recognisable maker silhouette |
| `hero-hyper-teal.webp` | quad-exhaust hypercar | recognisable maker silhouette |
| `hero-hyper-champagne.webp` | mid-engine hypercar | recognisable maker silhouette |
| `hero-roadster-blue.webp` | open roadster, four fender bulges | recognisable maker silhouette — registered trade dress body |
| `hero-coupe-gold.webp` | classic rear-engine coupe | recognisable maker silhouette |
| `library-sedans-1785066252701-1-silver-yellow-stripe.webp` | angular wedge supercar | same flagged body as the pink-wedge above |
| `library-sedans-1785067674835-1-aqua-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785067674835-2-yellow-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785067674835-3-silver-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785067674835-8-blue-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785067674835-9-gold-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785067674835-11-green-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785070794205-0-purple-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785070794205-1-bronze-wedge.webp` | angular wedge supercar | same flagged body |
| `library-sedans-1785070794205-2-pink-pale-wedge.webp` | angular wedge supercar | same flagged body |
| `traffic-sedan-5.webp` | national-flag racing stripe over a coupe | recognisable maker silhouette + livery |
| `traffic-sedan-12.webp` | classic gullwing coupe | recognisable maker silhouette |
| `traffic-sedan-8.webp` | track-focused coupe, lime | recognisable maker silhouette |
| `traffic-sedan-24.webp` *(already unused)* | municipal taxi liveried sedan | second copy of the NYC TAXI exposure |
| `traffic-sedan-3.webp` *(already unused)* | GT coupe | chrome model-designation badge |
| `traffic-sedan-4.webp` *(already unused)* | modern longtail GT | recognisable maker silhouette |
| `hero-wedge-green.webp` *(already unused)* | angular wedge supercar | same flagged body as the 11 recolors above, the original non-recolor |
| `hero-offroad-orange.webp` *(already unused)* | boxy off-roader, bonnet-mounted spare | recognisable maker silhouette |

29 files, but far fewer distinct designs than that — two genuine
many-to-one commissions in there:
- The **11 wedge-body files** (10 named `*-wedge` plus
  `library-sedans-1785066252701-1-silver-yellow-stripe.webp`, confirmed
  the same body above) are recolors of one model — **one replacement
  design covers all 11.**
- **`hero-hyper-teal.webp`** and **`hero-hyper-champagne.webp`** are two
  colors of the same hypercar body (same maker, same quad-exhaust/
  teardrop-cabin shape) — **one replacement design covers both.**
- The taxi livery (`library-sedans-1785067674835-4-yellow-cab.webp` and
  the already-orphaned `traffic-sedan-24.webp`) is one design needed
  twice over, not two designs.

That leaves 12 remaining files each depicting a genuinely distinct
silhouette or livery: the racing-GT-with-branded-livery
(`traffic-sedan-11`), the GTO-badged coupe (`traffic-sedan-3`), the
vintage rounded rear-engine classic (`hero-vintage-white`), the midship
supercar (`hero-midship-red`), the central-driving-position racer
(`hero-racer-orange`), the four-fender-bulge roadster
(`hero-roadster-blue`), the classic rear-engine coupe (`hero-coupe-gold`),
the national-flag race-stripe coupe (`traffic-sedan-5`), the gullwing
coupe (`traffic-sedan-12`), the lime track coupe (`traffic-sedan-8`), the
modern longtail GT (`traffic-sedan-4`), and the off-roader
(`hero-offroad-orange`).

**Net: roughly 15 replacement designs cover all 29 removed files** (1
wedge + 1 hypercar + 1 taxi + 12 one-offs) — not 29, and not a round
number worth treating as more precise than "about 15."

### 2026-08-04: a second Ferrari/Lambo sweep of the *remaining* pool — one real finding, one over-call corrected

Prompted by the developer asking specifically about any Ferrari/
Lamborghini look-alikes still left in `assets/cars/` after the removal
above. Two files were initially flagged by silhouette alone
(`hero-airtail-*` × 5 as "Ferrari 488/458 Spider", `hero-canopy-green`
as "Lamborghini") — the developer pushed back, correctly. Re-examined at
pixel level rather than re-asserting the first read:

- **The `hero-airtail-*` body is not a Ferrari 488/458.** Round
  headlights rule it out outright (the 488/458 Spider's are angular);
  it also carries a fixed rear wing the real car doesn't have. Silhouette
  match was a thumbnail-scale pattern-match, not a verified one — kept as
  a design, no replacement needed.
- **`hero-canopy-green` is not conclusively Lamborghini either** —
  proportions differ and (see below) there's no badge, contrary to what
  was first claimed.
- **The one thing that *did* hold up:** a ~10×10px yellow shield badge on
  the steering-wheel hub, found via pixel-level crop-and-zoom (not
  assumed) on 4 of the 5 `hero-airtail-*` colorways (blue, pink,
  purple-yellow, stripe — **not** red, confirmed absent there after a
  targeted check, not skipped) and on `hero-convertible-brown`. `hero-
  canopy-green`'s dash was re-checked at the same zoom specifically for
  this correction and is genuinely clean — the original badge claim on
  that file was wrong.

**Fixed by retouch, not replacement** — these badges are real marks but
tiny and isolated, so the same in-place-patch approach as the truck
retouches above (2026-07-31 entry) applied cleanly:
- `hero-airtail-blue.webp`, `-purple-yellow.webp`, `-stripe.webp`: flat
  fill sampled from a ring around the badge (dark, fairly uniform hub
  material — a ring average matched cleanly).
- `hero-airtail-pink.webp`, `hero-convertible-brown.webp`: the ring
  method picked up dark spoke shadows and left a visible grey smudge on
  the lighter cream hub — redone as a clone-stamp from a same-material
  patch directly above the badge instead. Both re-verified clean after.
- All five verified at three scales (badge-tight crop, full-car crop,
  and a live headless render through 10 board resets) before the real
  files were overwritten — zero console errors, zero failed asset loads.
- `hero-airtail-red.webp` needed no edit — confirmed by direct pixel
  inspection that no badge is visible on that colorway at all, not an
  oversight.

**Still open, unchanged by this correction:** `start-portrait.webp` /
`start-landscape.webp` (legible "FERRARI" wordmark, three recognizable
Lamborghini Huracáns, a scene-level exposure no silhouette argument
touches), `intro-plate.webp` (a photoreal Ferrari Enzo), and `pro-
plate.webp` (a Porsche 718 Cayman GT4) are all still flagged and still
awaiting replacement art — see the image reference sheet shared with the
developer for the current full list, tagged R1–R11 and L1–L5 by
confidence tier rather than by filename.

## Fonts — cleared

`assets/fonts/*.woff2` are OFL-licensed. Ship the licence files alongside
them (tracked in STORE-SHIP-PLAN P0-2).

## Start-screen stills — provenance unrecorded

`assets/start/*.webp`. Same rule as the vehicle art: record the source and
licence before shipping.
