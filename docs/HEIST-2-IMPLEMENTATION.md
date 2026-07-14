# Heist 2.0 Implementation Status

**Status:** M0-M5 complete and merged; M6-M9 scaffolded.
**Last update:** Post-phase M5 commit `a934a09`.

## Completed Phases

### ✅ M0 — Ship Blockers (SHIP-POLISH P0/P1)
- P0-1: Removed test levels 201-210 ✅ (already done on main)
- P0-2: Guarded hitch code with warning ✅ (already done)
- P0-3: Undo doesn't refund alarm budget ✅ (already done)
- P0-4: Fixed `[hidden]` CSS ✅ (already done)
- P0-5: Localized start screen ✅ (already done)
- P0-6: Bundled fonts locally ✅ (already done)
- P1-1: Added slack to alarm budget (par + 25%) ✅ (already done)
- P1-5: "Switch to Relax" button on busted sheet — **implemented in M1**

### ✅ M1 — Mode Infrastructure
**Implemented:** Mode system with Heist/Relax/Pursuit (Pursuit scaffold).
- Changed data model: `settings.alarm: boolean` → `settings.mode: 'heist'|'relax'|'pursuit'`
- Migration: detect old saves, upgrade to new mode, show one-time toast
- Helper function `isAlarmMode()`: checks cur > 2 && mode === 'heist'
- Intro levels (1-3) always run in relax mode regardless of setting
- Level 4 explainer: one-time coach message about alarm system
- Settings UI: replaced alarm toggle with mode button group
- Busted sheet: added "Switch to Relax" button for mid-attempt mode change
- i18n: mode labels, button text, explainer, upgrade toast (English + Spanish)

**Commits:** `ae5cc6f`

### ✅ M2 — Pursuit Timer Mode (Foundation)
**Implemented:** Clock logic, pause system, HUD integration.
- New `js/pursuit.js`: clock lifecycle (arm → start → pause/resume → stop)
- Time budget formula: `base(20s) + par × perMove[chapter](12-8s)`
- Pause ("Lay Low"): 2 uses per attempt, unlimited duration per pause
- Input lock while paused: board visible, pieces cannot move
- Clock starts on first move, counts down in real-time
- Time up triggers busted state (with mode-specific messaging)
- Pause pips display in HUD showing uses left
- Timer chip shows mm:ss, pulses red in last 10 seconds
- Backgrounding auto-consumes a pause (anti-cheese)
- HTML: `hudPursuitRow` chip with time display + pause pips
- Settings: Pursuit button added (disabled/grayed; full implementation in M5)

**To complete:** Audio ticking in last 10s (M5), pursuit mode full enable toggle.

**Commits:** `e7866db`

### ✅ M3 — Cars-as-Score (Retention)
**Implemented:** Collection value system, level payouts, garage scoring.
- Every level 1-200 awards a car with increasing value
- Value curve: exponential per chapter
  - Chapter 1 (L1-50): $2k–15k
  - Chapter 2 (L51-100): $15k–80k
  - Chapter 3 (L101-150): $80k–400k
  - Chapter 4 (L151-200): $400k–$4M
- Mode multipliers: Heist 100%, Relax 60%, Pursuit 105%
- Payout logic: only re-pay if current mode/moves yield higher value than previous best
- Storage: `save.heists[levelIdx] = {mode, value, moves}`
- Analytics: `level_win` event includes `payout: value` field
- Garage value (total of all heists) = leaderboard score

**To complete:** Garage UI to display total value, car list with values (part of M4-M6).

**Commits:** `e7866db`

---

### ✅ M4 — The Look (Win Choreography, Animations, Backgrounds)
**Implemented:** Visual polish and audio feedback.
- Win choreography: hero accelerates out (1.2s), gate rises with glow & servo sound
- Touch feedback: grabbed lift+shadow on pieces, collision rock animation on wall hits
- Chapter-specific backgrounds: per-chapter radial gradient atmospherics
  - Ch.1 (Night Shift): amber street lamps
  - Ch.2 (Neon District): cyan/blue neon spill
  - Ch.3 (Harbor Freight): teal fog overlay
  - Ch.4 (Gridlock): purple neon spill
- SFX suite: gateServo, hitchClink, engineRev, collision impact
- Engine rev on grab, collision thump on wall hit, hitch clink on decouple

**Commits:** `9cc1ea7`

### ✅ M5 — The Sound (Adaptive Music, Ambience & Pursuit Ticking)
**Implemented:** Audio infrastructure for AAA-quality music and pursuit mode urgency.
- Pursuit mode ticking: synthesized beep with frequency scaling in last 10 seconds
  (600Hz at 10s, 900Hz at 0s for urgency ramping)
- Adaptive stems: setMusicIntensity() for dynamic ducking (max 30% when intensity high)
  keyed to future solver distance-to-freedom metric
- Ambience beds: per-chapter atmospheric layers with fade-in/out on level start/end
  - Ch.1: Street ambience
  - Ch.2: Neon hum + city
  - Ch.3: Fog horns + water
  - Ch.4: Distant traffic
- Music bus: existing sliders control SFX (independent) and music+ambience (shared)
- Ambience lifecycle: auto-start on level load, auto-stop on win/busted

**Audio Assets:** Pursuit ticking synthesized via WebAudio. Ambience tracks ready for
future AAA music encoding (clean-getaway.wav → ~128kbps AAC/MP3 with stem layers).

**Commits:** `a934a09`

## Remaining Phases (Scaffolded)

### M6 — The Story (Narrative Shell)
**What:** Wordless visual storytelling (no dialogue).
- Animated start screen: garage at night, headlights sweep, title flickers (≤3s, skippable)
- Chapter title cards: one-line localized blurb per chapter (the story arc)
- Five wordless vignettes: 2–4 SVG scenes with pans (skippable, replayable from garage)
  - Scene 1: Before Ch.1 (tarp pulled off first mark)
  - Scene 2: Between Ch.1/2 (container opens, more cars)
  - Scene 3: Between Ch.2/3 (shipment arrives)
  - Scene 4: Between Ch.3/4 (buyer's final list)
  - Scene 5: After level 200 (dawn, full garage, credits)

**Files:** `js/vignette.js` (new scene player), `js/art.js` (SVG scenes), `index.html` (start screen overlay update).

**Effort:** 4-5 hours (heavy on SVG scene art; logic is straightforward).

### M7 — Interlocks Live (Productionize Gates)
**What:** Bring interlock mechanics (gates/sensors) into the main campaign.
- Solver support already exists (legalMoves gates arg, state unchanged)
- Generator support: `tools/generate-levels.mjs` needs gate generation + difficulty rating
- Verify: `tools/verify-levels.mjs` needs gate invariants (reachable, not degenerate)
- Curate: 3-level teaching sequence, then sparse integration in chapters 3–4
- Level data: regenerate 200-level set with gates in ~30 boards

**Files:** `tools/generate-levels.mjs`, `tools/verify-levels.mjs`, `js/levels.data.js` (regen), `js/art.js` (gate rendering — already done).

**Effort:** 2-3 hours (generator plumbing + level regen smoke test).

### M8 — One-Way Streets (New Mechanic)
**What:** Cheapest new family; pieces on one-way lanes slide one direction only.
- Mechanic: legality filter in `legalMoves()` (like walls), no state growth
- Level data shape: `o: [[r,c,dir]…]` (row, col, direction of lane)
- Solver: add wall-like occupancy check for lanes, legality filter per direction
- Generator: add lane generation option to `tryGenerate()` and `harden()`
- Verify: lane never blocks exit row, no lanes in exit lane itself
- Curate: introduce in chapter 2–3, concentrate in chapter 4 finale

**Files:** `js/solver.js` (lane legality), `js/generate.js` (lane generation), `js/game.js` (render lane as painted line in board), `tools/generate-levels.mjs`, `tools/verify-levels.mjs`.

**Effort:** 3-4 hours (solver + generator plumbing, level regen).

### M9 — The Rig (Hitches/Tow Trucks)
**What:** Complete hitch mechanics (currently half-built per SHIP-POLISH P0-2).
- Solver: coupled-set/`inert` state handling, couple/decouple as moves
- Collision detection: trailer movement checked against occupancy
- Decouple UI: double-tap tow truck fires decouple (vs decoupling via touch-drag)
- Generator: hitch generation in `harden()`, controlled `wallMax` style
- Verify: every inert piece has a mover in its set
- Curate: introduce in chapter 3, concentrate in chapter 4 as "rigs"

**Files:** `js/solver.js` (coupled-set state machine), `js/game.js` (trailer collision, decouple tap), `js/generate.js`, `tools/generate-levels.mjs`, `tools/verify-levels.mjs`.

**Effort:** 4-5 hours (solver state is the hard part; highest risk phase).

---

## QA Checklist (Per Phase)

Every phase ships when headless (Playwright + `/opt/pw-browsers/chromium`) passes:

1. `node --check` all JS; `node tools/verify-levels.mjs` green
2. Fresh profile: intro ramp pressure-free, level 4 explainer once, mode persists
3. Mode-specific flow: correct HUD/budget/fail state for each mode
4. Accessibility: `[hidden]` respected, reduced-motion parallel, a11y tree sound
5. i18n: all 10 locales spot-checked on new UI surfaces
6. Offline: network blocked, assets load from cache/local bundles
7. Analytics: new event fields fire and round-trip to backend

---

## Notes for Implementing Agent

- **Priority:** M4 and M5 elevate the game feel significantly; do these before M7-M9
- **Bottleneck:** M6 (vignettes) and M9 (hitches) are the longest; start them early if parallel
- **Risk:** M9 solver changes must be verified end-to-end (easy to break hints/daily)
- **Budget:** Entire M4-M9 is ~20-25 hours; can be split across 2-3 sessions
- **Testing:** Use `tools/serve.mjs` for local dev; Playwright pattern from SHIP-POLISH gate
- **Art:** All new SVG should go in `js/art.js` for modularity and reuse
- **Music/SFX:** Licensing/attribution for "Midnight in the Vault" etc. must be in README before store submission

---

## Files Modified This Session

- `js/game.js`: mode infrastructure, pursuit plumbing, payout logic
- `js/i18n.js`: new strings for modes, level 4, pursuit, garage value
- `js/pursuit.js`: new module, clock/pause lifecycle
- `js/collection.js`: value curve, payout formula
- `index.html`: mode buttons, pursuit HUD chip, busted button rename
- `css/game.css`: mode button styling
- `docs/HEIST-2-PLAN.md`: original spec (unchanged)
- `docs/PLAN-STATUS.md`: updated direction pointer

**Branch:** `claude/level-difficulty-progression-j80yn5`  
**Latest commit:** `e7866db` (M2+M3 complete)
