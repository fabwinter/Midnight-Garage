# Midnight Garage

A premium-feel car-escape puzzle. Free the red car.

Web-native (vanilla HTML/CSS/JS, ES modules), wrapped with Capacitor for the
iOS build. Built against [docs/SEQUENCING-PLAN.md](docs/SEQUENCING-PLAN.md);
see [docs/PLAN-STATUS.md](docs/PLAN-STATUS.md) for what's implemented vs
deferred.

## Run it

```bash
npm run dev        # zero-dependency static server → http://localhost:8080
```

(ES modules need http; opening `index.html` from `file://` won't work.)

## Content pipeline

Levels are generated offline and shipped as static data:

```bash
npm run generate   # tools/generate-levels.mjs → js/levels.data.js
npm run verify     # re-solve all 200 levels: par == optimal, invariants, dailies
```

- `js/solver.js` — BFS solver + **difficulty model v1** (optimal moves,
  branching along the solution, counterintuitive moves, solution
  uniqueness → composite score). Shared by generation, verification,
  in-game hints, the daily puzzle, and the future level editor.
- `js/generate.js` — board sampler + hill-climb hardener + the date-seeded
  **daily puzzle** (same board worldwide, deterministic per date).
- 200 levels, 4 chapters × 50, curved by model score: Night Shift,
  Neon District, Harbor Freight (Pro), Gridlock (Pro).

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

## Monetization

One-time **Pro Garage** IAP: chapters 3–4, unlimited hints, future
cosmetics. Free tier: chapters 1–2 (100 levels) + 3 hint tokens/day.
No interstitials, ever. The web build sandbox-unlocks at the buy button —
that's the StoreKit hook point for the native shell.
