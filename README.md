# Midnight Garage

A premium-feel car-escape puzzle with a heist fiction. Free the red car
before the alarm — or the clock — catches up to you.

Web-native (vanilla HTML/CSS/JS, ES modules), wrapped with Capacitor for the
iOS build. Built against [docs/SEQUENCING-PLAN.md](docs/SEQUENCING-PLAN.md)
and [docs/HEIST-2-PLAN.md](docs/HEIST-2-PLAN.md); see
[docs/PLAN-STATUS.md](docs/PLAN-STATUS.md) for what's implemented vs
deferred.

## Run it

```bash
npm run dev        # zero-dependency static server → http://localhost:8080
```

(ES modules need http; opening `index.html` from `file://` won't work.)

## Game modes

- **Campaign** — 500 levels across 10 chapters (50 each), curved by the
  difficulty model so the whole run gets harder all the way to level 500:
  Night Shift, Neon District, Harbor Freight, Gridlock, Overpass, Freight
  Yard, Customs, Rush Hour, The Syndicate, Vault Row. Chapters 1–2 (100
  levels) are free; 3–10 (400 levels) are Pro Garage.
- **Pacing** — three ways to play any board: **Heist** (default; a
  per-move alarm budget, busting loses no progress but ends the attempt),
  **Pursuit** (a real-time countdown instead of a move budget), and
  **Relaxed** (no fail state, and the only mode where you pick which owned
  car to drive — everywhere else "the job" decides).
- **Daily Puzzle** — one date-seeded board worldwide (`js/generate.js:
  dailyLevel`), identical for every player. Streaks with freeze tokens (1
  earned per 7 dailies, capped at 3) and a Wordle-style emoji share card.
- **Bounty ("Tonight's Mark")** — a nightly curated board cycled
  deterministically by date (`js/bounty-rotation.data.js`, `js/bounty.js`),
  forced into Heist or Pursuit depending on its tier. Clearing under that
  night's reward condition (par / no hints) unlocks a tier-exclusive car.
- **Impound Lot** — a bonus pool of curated boards (`js/impound-lot.data.js`)
  that unlocks once the campaign and Pro Garage are both done.
- **Sandbox** — an in-app level designer for building and playtesting your
  own boards (admin-only; see below).

## Mechanics

- Core loop: slide pieces clear so the horizontal red hero can reach the
  exit row. `js/solver.js` is a BFS solver plus a composite **difficulty
  model** (optimal moves, branching along the solution, counterintuitive
  moves, solution uniqueness) shared by generation, verification, in-game
  hints, and the daily puzzle.
- **Roadworks** — immovable single-cell blockers, never on the exit row.
- **Security gates** — a gate cell opens/closes based on whether any of its
  sensor cells are occupied, XORed against the gate's polarity (interlock
  puzzles).
- **Hitches (tow + trailer)** — a trailer piece starts coupled to its tow:
  dragging the tow slides both by an identical delta, and decoupling costs
  one move (`js/solver.js`'s `legalMoves`/`rate` model this as real compound
  moves, not just UI sugar). Tow and trailer are always placed physically
  adjacent, bumper-to-bumper, same lane (`js/generate.js:
  tryGenerateHitch`). A trailer with length 3 renders as a genuine
  caravan/utility-trailer/boat that **any car** may hitch; a length-2
  trailer is a broken-down car that always renders as the same
  rust-weathered sedan, and only a **tow truck** may pull it — the tow
  piece's own art is forced to the dedicated tow-truck asset whenever it's
  towing a car, regardless of that piece's own length (`js/art.js:
  vehicleSVG`).

## Collection & Garage

Cars are cosmetic hero skins only — no gameplay effect, no purchase gates a
specific car (`js/collection.js`). 54 cars total: 50 **job cars** (5 per
campaign chapter, round-robin assigned across that chapter's levels — clear
a mission and the car you drove becomes yours) and 4 **bounty marks** (one
per rarity tier, earned by clearing that tier's nightly reward condition).
Relaxed mode and the Daily Puzzle are the only places you choose which
owned car to drive.

## Admin tools

Tap the title 5× on the start screen to reveal the admin bar (level/mode
jump input, Level Inspector, Sandbox editor, Asset Library).

- **Sandbox level designer** — place Hero/Car/Truck/Wall/Hitch pieces by
  tap or drag, rotate in place, drag a specific asset straight off the
  library picker. The **Hitch** tool links two adjacent same-orientation
  pieces (tap the tow, then its trailer — tapping either half again
  un-hitches them) and keeps indices consistent across piece deletion and
  invalidates a hitch that's been dragged/rotated out of adjacency. Live
  par/solvability check, plus a duplicate-board warning that flags when the
  current layout's exact piece/wall geometry already matches a shipped
  campaign/bounty/impound board or another of your saved designs. Save,
  playtest, and Export (clipboard JSON) → hand off to
  `tools/promote-sandbox-levels.mjs`.
- **Asset Library** — add/edit/duplicate/rename vehicle art and assign hero
  photos per job car, all persisted client-side and layered over the
  hardcoded art at render time (no redeploy needed to see changes). Upload
  pipeline: remove-background (flood fill), scale (10–300%), rotate,
  brightness/contrast/saturation/hue/colorize, independent non-uniform
  stretch via draggable corner/edge handles, and a horizontal Position
  slider so a 2–3 cell asset (like a trailer) doesn't have to stay
  centered. A faint cell/block reference grid overlays the target canvas
  for sizing. Export Library → `tools/promote-library.mjs` to commit
  changes for real.
- **Level Inspector** — a searchable list of every shipped level with its
  par and feature badges (hitch/gate), with a jump-to-level shortcut.

## Content pipeline

Levels are generated and curated offline, then shipped as static data:

```bash
npm run generate   # tools/generate-levels.mjs → js/levels.data.js
npm run verify     # tools/verify-levels.mjs: re-solve every level (par == optimal),
                    # invariants, chapter bands/floors, cross-pool dedup, daily determinism
```

Other tools worth knowing about:

- `tools/gen-hitch-pool.mjs` / `tools/add-hitch-levels.mjs` — generate and
  splice in hitch-mechanic boards.
- `tools/import-fogleman.mjs` / `tools/score-fogleman-reserve.mjs` /
  `tools/add-fogleman-levels.mjs` — import and curate boards from Michael
  Fogleman's exhaustive Rush Hour database.
- `tools/gen-bounty-pool.mjs` / `tools/gen-impound-pool.mjs` — curate the
  Bounty rotation and Impound Lot pools.
- `tools/extend-to-500.mjs`, `tools/gen-500-native.mjs`,
  `tools/gen-500-bridge.mjs` — the 200→500 level expansion (see
  [docs/LEVELS-500-PLAN.md](docs/LEVELS-500-PLAN.md)).
- `tools/promote-sandbox-levels.mjs` / `tools/promote-library.mjs` — the
  handoff from the in-app Sandbox/Library admin tools into committed code.

## Native shell (Capacitor)

```bash
npm install
npx cap add ios
npm run cap:sync
npm run cap:ios
```

- Haptics map to `UIImpactFeedbackGenerator` via `@capacitor/haptics`
  (`js/haptics.js`); web falls back to `navigator.vibrate`.
- Saves go through `@capacitor/preferences` when present
  (`js/storage.js`), localStorage otherwise. Point the iOS target's
  Preferences at iCloud KV for cloud save (plan 1.2).
- One notification type only — the streak reminder (`js/notify.js`).
- iOS audio session: configure `AVAudioSession` with `.ambient` so the
  game respects the silent switch and mixes with user music (plan 0.4).

## Analytics

`js/analytics.js` batches privacy-clean events (no PII, random device id)
to Supabase REST when `js/config.js` has credentials; otherwise events stay
in a local ring buffer. Schema + funnel starter query:
`supabase/schema.sql`. Instrumented per plan 0.9: session start/end, level
start/win/abandon/skip, hint/undo usage, daily start/win, IAP funnel steps,
share results.

## Localization

UI strings are fully localized to 10 languages (`js/i18n.js`: en, es, fr,
de, it, pt, ja, ko, zh, ru) — flat key/value per locale, `{n}`-style
placeholders, no embedded HTML.

## Monetization

One-time **Pro Garage** IAP: chapters 3–10 (400 levels), unlimited hints,
future cosmetics. Free tier: chapters 1–2 (100 levels) + 3 hint tokens/day.
No interstitials, ever. The web build sandbox-unlocks at the buy button —
that's the StoreKit hook point for the native shell.
