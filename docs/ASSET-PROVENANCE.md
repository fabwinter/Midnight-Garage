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
| `pursuit-1..4.mp3` | Pursuit attempt pool (still MP3 — pending AAC re-export) |
| `relaxed-*.mp3` (5) | Relaxed shuffle pool (still MP3 — pending AAC re-export) |

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

**Held, not added** — a fifth render (purple/yellow) carries a **full
manufacturer crest on the nose** and **the exact model designation spelled
out in text on both rear wing endplates**. This is not a silhouette
judgement call: it is a literal badge plus literal model name, worse than
anything already flagged above. Needs the crest and both instances of text
removed (or the wing endplates repainted blank) before this one ships.
Original file wasn't retained in the repo — ask for it again if it's worth
finishing.

## Fonts — cleared

`assets/fonts/*.woff2` are OFL-licensed. Ship the licence files alongside
them (tracked in STORE-SHIP-PLAN P0-2).

## Start-screen stills — provenance unrecorded

`assets/start/*.webp`. Same rule as the vehicle art: record the source and
licence before shipping.
