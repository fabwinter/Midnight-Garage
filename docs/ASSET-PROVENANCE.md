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

## Fonts — cleared

`assets/fonts/*.woff2` are OFL-licensed. Ship the licence files alongside
them (tracked in STORE-SHIP-PLAN P0-2).

## Start-screen stills — provenance unrecorded

`assets/start/*.webp`. Same rule as the vehicle art: record the source and
licence before shipping.
