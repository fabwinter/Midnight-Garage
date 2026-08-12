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
| `clean-getaway.m4a` | Settings / Garage / Daily / Levels menu music |
| `bounty-almost-see-daylight.m4a` | Bounty tab music (own loop, not `clean-getaway.m4a` — see 2026-08-12 entry) |
| `bounty-almost-see-daylight-2.m4a` | Bounty attempt track (`TRACK_POOLS.bounty`) |
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

### 2026-08-12: Bounty gets its own tab music and attempt track, split out of the shared pools

Two new developer-supplied tracks (same rights coverage as the rest of
this table), both confirmed real AAC via `ffprobe` before wiring
(48 kHz stereo): `bounty-almost-see-daylight.m4a` (22s — a short,
deliberate loop, confirmed with the developer since every other track in
the game runs 85-180s) and `bounty-almost-see-daylight-2.m4a` (128s).

Before this, opening the Bounty tab played the same shared
`clean-getaway.m4a` as every other tab, and a Bounty attempt just played
whichever of the Heist/Pursuit pools matched the mark's forced pacing
(`loadBountyLevel` never puts `'bounty'` in `save.settings.mode` — that
field is always the pacing itself, `'heist'` or `'pursuit'`). Genuinely
new code, not just new files:
- `js/audio.js`: new `TRACK_POOLS.bounty` (one track so far — the
  existing `pool.length === 1` branch in `pickTrack` already handles
  that, no special-casing needed) and a new `bountyAudio` element/
  `playBountyMusic()`/`stopBountyMusic()` pair, shaped like
  `settingsAudio`/`playSettingsMusic()` but `loop = true` since the tab
  track is short enough to visibly run out otherwise (`settingsAudio`
  plays once at 85s and is fine not looping; 22s wouldn't be).
- `js/game.js`: `bountyBtn` now calls `playBountyMusic()` instead of
  `playSettingsMusic()`; the overlay close paths (X, click-outside,
  Escape) and `bountyPlayBtn` now call `stopBountyMusic()` for
  `bountyOverlay` specifically, split out of the shared
  `stopSettingsMusic()` array those all used to share with Levels/
  Garage/Settings. Both `startAttemptTrack(save.settings.mode)` call
  sites (level load, alarm/pursuit rescue) now branch to `'bounty'` when
  `mode.type === 'bounty'`, since `save.settings.mode` alone can't
  distinguish "a Heist-paced bounty" from an ordinary Heist campaign
  attempt. `loadBountyLevel` also unconditionally warms the bounty pool
  (`setGameMode('bounty')`) rather than only whichever pacing pool the
  mark happens to match, so the attempt track is already buffering by
  the time the player taps Play.

Verified headless: wrapped the `Audio` constructor before app code loads
to observe every element actually created and played (the module doesn't
expose its Audio elements otherwise). Confirmed opening the Bounty tab
creates and plays `bounty-almost-see-daylight.m4a` with `loop === true`;
starting the job creates and plays `bounty-almost-see-daylight-2.m4a`
(warmed once, then the real playing element, matching the existing
warm-then-play pattern); closing the tab (X button) pauses it cleanly
after its fade-out. Zero console errors throughout.

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
touches) are still flagged and awaiting replacement art — see the image
reference sheet shared with the developer for the current full list,
tagged R1–R11 and L1–L5 by confidence tier rather than by filename.
`intro-plate.webp` and `pro-plate.webp` were replaced 2026-08-06, see
below.

### 2026-08-06: `intro-plate.webp` and `pro-plate.webp` replaced with commissioned art

Two new renders supplied by the developer, on the same dark low-poly
background as the originals: an original-design red coupe (X-shaped
taillight lattice, not a match for any real marque's signature) for
`intro-plate.webp`, and a matte-grey coupe with orange wheels for
`pro-plate.webp`. Both vetted the same way as every other addition to
this pool — zoomed crops of the rear bumper/plate area on both, looking
specifically for the kind of embossed plate text the `hero-airtail-*`
retouches (above) needed. Neither carries one; `pro-plate.webp`'s plate
recess is genuinely blank, `intro-plate.webp` has no plate at all in
frame. Neither silhouette reads as a specific real manufacturer.

**Not a drop-in file swap** — `css/game.css`'s `.plate-sheet` rule
(search "Full-bleed art plates" in that file) pins these images to
`background-size: 100% auto` and reserves a fixed 30%-of-width band for
the car via `.plate-spacer{aspect-ratio:1/.30}`, and expects the source
canvas itself to be pre-extended to 2× its width (2048×4096) with the
area below the car filled to avoid a seam once real content scrolls
past the art. The two supplied renders were 2048×2048 squares with the
car already sitting in almost exactly the right band (car spans roughly
5–27% of width vs. the original files' 7–28% — close enough that no
repositioning was needed) but at half the expected canvas height.
Extended each to 2048×4096 by mirror-tiling the render's own lower
background region downward (reflect-repeat, so every seam boundary
matches pixel-for-pixel) rather than flat-filling or attempting to
regenerate the polygon texture — verified with ruled-line overlays at
the CSS's own 7/15/20/25/30.5% marks before shipping, and confirmed
seamless (no visible tiling artifact) at the 50% mirror boundary. Final
live-render check: both sheets screenshotted in a running instance of
the app (intro sheet on first load, Pro Garage popup via a direct
overlay-class toggle) — car correctly banded, content starting at the
right offset, zero console errors, zero failed asset loads.

### 2026-08-12: Admin Library export promoted (`tools/promote-library.mjs`), and a real bug fixed in the promotion pipeline itself

Developer exported the in-game Admin Asset Library and asked for it to be
promoted. 4 sedan entries, all in-place edits (`editOf` set — same file
overwritten, no new array entry): `traffic-sedan-new-lightblue.webp`,
`hero-canopy-green.webp`, and the two files already tracked here as
`-13-red-hatch.webp`/`-14-green-hatch.webp` (originally uploaded as
`-red-mini`/`-green-mini`, see the `RENAMED_STEMS` note in js/library.js).
Plus one base entry disabled with no replacement
(`-15-green-coupe.webp`), whose `SEDAN_PHOTOS` line `promote-library.mjs`
removed.

**Vetted each new image before promoting, same as every other car asset
in this doc:**
- `traffic-sedan-new-lightblue.webp` — generic sedan silhouette, no
  badge visible. Clean.
- `hero-canopy-green.webp` — same wedge/mid-engine design as the
  already-shipped file it replaces (diffed non-trivially different, so a
  real re-render, not a duplicate upload — but same silhouette, same
  clean dashboard with no badge already confirmed in this doc's
  2026-08-04 entry). No new concern.
- `-13-red-hatch.webp` / `-14-green-hatch.webp` — **still Mini
  Cooper-shaped** (round headlight, chrome roof-rail trim, short stubby
  proportions) — diffed against the currently-shipped files and it's the
  same silhouette already there, just re-touched lighting/paint, not a
  new regression. This is the exact exposure `RENAMED_STEMS` already
  flags as "hygiene, not an IP fix — the art itself is still unresolved"
  (see js/library.js). Still open. Promoting this update doesn't make it
  worse, but it doesn't fix it either — flagged to the developer, not
  silently shipped as if it were cleared.

**Real bug found and fixed, not just files promoted:** `tools/
promote-library.mjs` decoded an admin's PNG upload (`canvas.toDataURL
('image/png')` is the only format `js/library.js` ever produces) and
wrote those raw PNG bytes straight to a `.webp`-named path — on both the
new-entry path and the in-place `editOf` path. `tools/optimize-art.mjs`
(the tool whose own header calls itself "the thing to run after
promote-library.mjs") only ever discovers files by a literal `*.png`
extension in `assets/cars/`, so a promoted file that's PNG bytes under a
`.webp` name was invisible to it forever — nothing in the pipeline could
ever catch or fix it after the fact.

This had already happened silently, more than once: scanning every file
in `assets/cars/` by magic bytes (not extension) turned up 9 already-
shipped files that were genuine PNGs mislabeled `.webp` —
`library-sedans-*-13-red-hatch`, `-14-green-hatch`, `-7-orange-suv`,
`traffic-truck-new-white`, and 5 `truck-*` files. Re-encoded all 9 to
real WebP in place (same `sharp .webp({quality:82,effort:6})` settings
`optimize-art.mjs` uses) — 2.82 MB → 316 KB combined, ~89% smaller, with
no visible quality loss at any size the game renders (spot-checked
`truck-tanker-steel.webp` directly). `promote-library.mjs` itself now
encodes through the same `sharp` pipeline on both write paths (new
`encodeWebp()` helper, plus the same oversize cap `optimize-art.mjs`
applies) rather than writing decoded bytes straight through, so this
class of bug can't recur on the next promotion.

**Verified:** dry-run output byte-identical to before the fix (encoding
only happens on a real write); every promoted/re-encoded file confirmed
real WebP by magic bytes; all 4 promoted images decode correctly in a
real browser at their expected 800×400; a 30-level headless playthrough
of the live app hit `hero-canopy-green.webp` mid-rotation with no console
errors or failed requests. `node tools/verify-levels.mjs` still shows
only the pre-existing, unrelated `daily 2026-08-18` failure (isolated via
`git stash` earlier and unaffected by anything here).

**Still to do, not done here:** the orphaned
`library-sedans-1785067674835-15-green-coupe.webp` file itself (its
`SEDAN_PHOTOS` line is gone, but `promote-library.mjs` never deletes the
underlying asset) is left on disk rather than deleted — matching the
tool's own conservative behavior, and because removing shipped art bytes
outright felt like a bigger call than this task asked for. Worth a
cleanup pass if the file is confirmed genuinely unreferenced anywhere
else.

## Fonts — cleared

`assets/fonts/*.woff2` are OFL-licensed. Ship the licence files alongside
them (tracked in STORE-SHIP-PLAN P0-2).

## App icon — cleared, originated in-repo

Every icon asset is generated from one vector source,
[`tools/build-icons.mjs`](../tools/build-icons.mjs) (`npm run icons`) —
there is no binary master to lose track of, and re-running it reproduces
all 26 files. The artwork is original vector geometry drawn against the
`css/game.css` palette (`--red`, `--amber`, `--night`): a top-down hero car
nosing toward the lit exit gate, the gate's ▶ marker taken from the game's
own board (`js/art.js`). No photograph, no traced silhouette, and no real
marque's design cues — deliberately, given the vehicle-art exposure
documented above. Nothing to clear with a third party.

### 2026-08-10: icon redrawn, Android adaptive layers fixed

Replaced the original 2026-08-02 icon, whose car read as a plain red
capsule below ~120px. The rebuild draws the glasshouse as one dark shape
with the painted roof floating inside it, leaving a wide raked windshield,
thin side glass and a small rear screen — which is what an overhead car
actually looks like, and what makes it still read as a car at 29px.
Verified rendered at 180/120/87/60/40/29 under an iOS corner mask.

Fixed at the same time: `mipmap-anydpi-v26/ic_launcher*.xml` wrapped
**both** adaptive layers in `<inset android:inset="16.7%">` (the generator
default that shipped with the Capacitor scaffold), which shrank the
*background* to the 72dp safe zone as well as the foreground. Any launcher
mask wider than 72dp — several OEM masks, plus Android's own parallax
animation — exposed transparent corners. Both layers are now authored at
the true 108dp adaptive canvas with the car and gate held inside the safe
zone by `icon()`'s `scale`, and referenced with no `<inset>`. Confirmed by
compositing the two layers and masking at 72dp, 80dp squircle and 84dp:
no transparent gap at any of them, and nothing important cropped at the
tightest. Legacy `ic_launcher`/`ic_launcher_round` stay 48dp as before.

The iOS master is written square and flattened (`channels: 3`) — Apple
rejects an alpha channel on `AppIcon-512@2x.png` and applies its own
corner mask, so the rounded-corner variant is the web favicon only.

### 2026-08-07: `start-portrait.webp` replaced, new `start-tablet.webp` added

Commissioned art, developer-supplied, after several rejected rounds (see
chat history — a Lamborghini/Ferrari-badged lineup, then Toyota GR
Corolla/Supra/86 replicas with a visible grille badge, then a BMW
twin-kidney grille, each caught and sent back before this version).
Final scene: original-design car lineup (no real-marque silhouette or
badge matched on any vehicle after per-car zoomed verification), a
generic sedan-shaped police cruiser with an illegible fictional door
shield, and a red hero car with a confirmed-clean rear (no plate, no
badge). Supplied pre-cropped to two ratios instead of one:
- `start-portrait.webp` (1530×2720) — phone portrait.
- `start-tablet.webp` (1536×2048, new file) — tablet portrait.

Both go through `#startOverlay`'s simple `background-size:cover` path
(unlike the plate-sheet images above — no canvas-extension or banding
convention applies here). `css/game.css` now picks between them with a
`(orientation:portrait) and (min-width:768px)` breakpoint layered over
the existing orientation query, so phones and tablets each get the ratio
they were rendered for instead of `cover` cropping a mismatched image.
Verified with a headless render at 390×844 (phone), 834×1194 (tablet),
and 844×390 (landscape, to confirm the new breakpoint doesn't leak into
the untouched landscape rule) — each resolved to the expected background
image, both new images render uncropped with the "START" button legible
against the bottom gradient.

**Resolved same day:** developer chose to drop landscape rather than
commission a third ratio, since native builds are portrait-locked
(`Info.plist` / `AndroidManifest.xml`) and landscape was effectively
unreachable already. `start-landscape.webp` (the file carrying the old
flagged "FERRARI" wordmark / Lamborghini Huracáns exposure) is deleted,
and `css/game.css`'s `@media (orientation:landscape)` rule is gone —
`#startOverlay` now sets `start-portrait.webp` unconditionally and
overrides to `start-tablet.webp` at `min-width:768px`, orientation no
longer a factor. Re-verified headless at the same phone/tablet-portrait
widths plus two landscape-aspect widths (844×390, 1194×834) to confirm
no dead reference to the removed file remains — both landscape cases
fall back to whichever art matches width, same as any other wide
viewport.

### 2026-08-11: `start-portrait.webp` and `start-tablet.webp` replaced again — same scene, lineup redesigned after two real findings

Same "Midnight Garage: Escape" underground-garage scene as 2026-08-07, but
a fresh render of the car lineup — the developer sent five successive
revisions of this poster over the course of the day, each checked the
same way (per-car zoomed crops, not a glance at the thumbnail) before
being sent back or cleared:

1. First revision: two cars (dark green, gold) had a honeycomb single-
   frame mesh grille plus a hooked/checkmark LED headlight — Audi's
   current design language, confirmed at the pixel level on both files
   supplied (a 3392×5056 and a 1536×2752 export). Sent back.
2. Second revision: the gold car's grille was fixed (mesh gone, smaller
   plain intake); the dark green car was untouched, same hexagonal mesh
   grille confirmed again in both files. Sent back with the finding
   narrowed to the one remaining car.
3. Developer pushed back rather than iterating blind: pointed out the
   flagged grille has a panel across its middle "unlike anything else"
   and that it's "identical to every other car in the image." Re-checked
   by zooming into six more cars (gold, silver, purple, teal, orange,
   magenta) instead of re-asserting the finding — every one of them
   carried the identical checkmark-headlight / split-mesh-grille face,
   including cars never flagged as Audi-like. **Correction, not a
   re-confirmation:** a design copied selectively onto the one car it's
   imitating is a real trade-dress concern; the same geometry used as the
   invariant base mesh under nine differently-colored recolors of one
   fictional car is this generator's shared template, not a targeted
   replica of one real manufacturer's signature — Audi's actual
   Singleframe grille isn't divided by a body-colored bar the way every
   car in this lineup is. Finding withdrawn.
4. Fourth revision ("fixed headlight"): a single, narrowly-targeted edit
   confirmed via pixel diff against the prior file (one small region
   changed, everything else byte-for-byte close) — the purple car's
   hooked DRL replaced with a plain double-bar strip. Not that it was
   still needed after the withdrawal above, but it's a clean fix.
5. Final pair, this entry: `IMG_3339` (3392×5056, phone-bucket export,
   carries the headlight fix forward — verified) and `IMG_3340`
   (1792×2400, ratio 0.747 — a much closer match to the `min-width:768px`
   tablet slot's 0.75 target than the 0.671 export used in-between, so
   less top/bottom loss under `background-size:cover` on an actual
   iPad-shaped screen). Red hero car's rear re-verified clean in both
   (no plate, no badge) at every stage above — never regressed.

Wired in the same way as 2026-08-07 (no plate-sheet convention, straight
`cover`). Verified headless at 390×844 (phone), 768×1024 and 834×1194
(tablet, both sides of the breakpoint) — correct file selected at each,
full scene visible uncropped, "START" button legible against the bottom
gradient at all three.
