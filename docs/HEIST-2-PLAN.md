# Midnight Garage — Heist 2.0: Full-Lean Implementation Plan

**Audience: the implementing agent.** This document is self-contained — you
should be able to build from it without reading the earlier plans, but the
history lives in [HEIST-PLAN.md](HEIST-PLAN.md), [AAA-PLAN.md](AAA-PLAN.md)
and [SHIP-POLISH-PLAN.md](SHIP-POLISH-PLAN.md). Where this plan contradicts
them, **this plan wins**.

## 0. The direction change (read this first)

The owner has decided to lean fully into the heist narrative to distinguish
the game from Rush Hour clones. Seven directives, verbatim in spirit:

1. **Alarm mode is the default game mode.** The toggle now goes the other
   way: players can switch to a pressure-free **Relax mode**. There is no
   separate "Alarm mode" any more — it IS the game.
2. **New Timer mode**: moving the first car starts a real-time countdown
   sized by difficulty. A pause button with a limited number of pauses lets
   the player study the board without moving pieces.
3. Better sound effects, animations and backgrounds.
4. **Real cars as level wins** — every heist pays out a car for the
   collection, with values that climb as the game progresses.
5. Music and atmospheric sound at AAA quality.
6. New game mechanics for variety, fun, and heist cohesion.
7. Animated start screens, story arcs, and cut scenes.

### What this supersedes

- The old covenant's "no fail states, no real-time pressure in the core"
  is **retired as a default** and survives only as Relax mode. Alarm's
  per-move budget (already shipped as an opt-in hard mode) becomes the
  standard experience.
- HEIST-PLAN §5's "Alarm gates a reward tier, never access" is superseded:
  busting the alarm fails the attempt (this is already how the shipped H2
  code works — the covenant doc was never updated).

### What still stands (do not regress these)

- **Variant A business model**: premium, ad-clean, no gacha, no randomized
  paid items, no energy gates, no pay-to-win. Cars remain skill-earned and
  cosmetic-value only (§4 below keeps "value" out of any spendable economy).
- Every shipped board stays BFS-verified `par == optimal`
  (`tools/verify-levels.mjs` is the gate).
- Intro ramp (levels 1–3) teaches the mechanic before any pressure exists.
- Accessibility floor: reduced-motion parallel presentation, photosensitivity
  limits (< 3 flashes/sec), VoiceOver/keyboard play, colorblind decals.
- Gentleman-thief noir tone — the car is art worth liberating, never
  GTA-style crime (age-rating + featuring posture).

### Prerequisite: SHIP-POLISH P0s

[SHIP-POLISH-PLAN.md](SHIP-POLISH-PLAN.md) P0-1 … P0-6 are ship blockers
that predate this plan (dev levels 201+ crash the chapter system, hitch
half-build, undo refunds the alarm budget, `[hidden]` CSS, hardcoded start
copy, remote fonts — check each; some may already be fixed on main). **Do
P0s first**; several phases below build directly on top of them (M1 extends
the alarm that P0-3 makes honest; M6 replaces the start screen that P0-5
localizes).

---

## 1. Mode architecture (directives 1 + 2)

Three ways to play every level. One shared board engine, one shared solver;
modes differ only in pressure and payout.

| Mode | Pressure | Fail state | Payout modifier |
|---|---|---|---|
| **Heist** (default) | Per-move alarm budget (shipped H2 mechanics) | Busted → retry, no progress | Full car value |
| **Pursuit** (new timer mode) | Real-time countdown from first move | Time up → busted | Full value **+ Hot Streak bonus** (§4.3) |
| **Relax** | None | None — the current no-fail game | Car still earned at reduced "fence price" (e.g. 60% value) |

Design rules:

- **Mode is a global setting** (settings sheet + a quick-switch on the level
  card / pre-level screen), persisted in `save.settings.mode:
  'heist' | 'pursuit' | 'relax'`. Migrate the existing boolean:
  `alarm: true → 'heist'`, `alarm: false → 'heist'` too — the new default is
  Heist for everyone; a one-time "New: modes" toast explains Relax exists.
- **Relax never gates access.** Chapters, stars, dailies, unlocks — all
  reachable in Relax. The only thing pressure buys is car value (§4) and
  bragging-rights badges. This preserves the broad-audience posture under
  the new default.
- **Intro ramp is always Relax** (levels 1–3, regardless of setting), and
  level 4 opens with a one-time animated explainer: "From here, every job
  trips the alarm" (i18n ×10).
- Daily puzzle runs in the player's current mode; busting a daily remains
  retryable and never touches streak logic (SHIP-POLISH P1-3 semantics).

### 1.1 Heist mode (rename + tune, mostly shipped)

The shipped H2 alarm IS this mode. Work remaining:

- Rename user-facing strings from "Alarm mode" to just the game — the HUD
  chip, busted sheet etc. stay; the *settings toggle* becomes the mode
  picker. Remove "alarm" as an opt-in concept from copy in all 10 locales.
- Land SHIP-POLISH P1-1 slack: `budget = par + max(2, ceil(par * 0.25))`.
  "Clean getaway ⚡" badge stays `moves <= par` exactly.
- Land P0-3 (undo doesn't refund budget) and P1-5 (busted sheet offers
  "Switch to Relax" as the quiet secondary action — replaces "Play without
  alarm").

### 1.2 Pursuit mode (the new Timer mode) — full spec

**Trigger.** The clock is armed on level load but starts on the **first
piece move** (same hook as the alarm track's first-move start in
`js/audio.js` / `game.js`). Before the first move the player can study the
board forever — that's the "casing the joint" phase, label it as such in
the HUD ("Casing…" → flips to the countdown on first move).

**Time budget.** Time is a function of par and chapter (later chapters
assume a faster player). Recommended starting values — expose as one table
so tuning is a data change:

```js
// seconds granted = par * perMove[chapter] + base
const PURSUIT = { base: 20, perMove: [12, 10, 9, 8] };   // chapters 1–4
// daily puzzle: perMove 10, base 20
```

A par-10 chapter-1 board ⇒ 140s. Tune from the `pursuit_busted` /
`pursuit_win` analytics events (add both, with `timeLeft`, `paused`,
`pausesUsed` in the payload).

**Pause ("Lay Low").** A dedicated HUD button, **2 uses per attempt**:

- Pausing freezes the countdown and locks all piece input (drag, keyboard,
  flick) — the board stays fully visible. This is deliberate: the value of
  a pause is *thinking time*, so hiding the board (Two Dots-style) would
  defeat the stated purpose.
- Unlimited pause duration; scarcity (2 uses) is the pressure, not a
  per-pause timer. Un-pause via the same button. Backgrounding the app
  auto-consumes a pause if any remain, else the clock keeps running
  (anti-cheese; use the `visibilitychange` handler).
- Visual: board dims 20%, a "LAYING LOW" stamp, timer chip freezes with a
  breathing animation. Pause count shown as two dot pips on the button.
- Undo is allowed in Pursuit (time is the budget, not moves).

**Failure.** Timer hits 0 → the existing busted choreography (police
lights, freeze, sheet) with time-specific copy ("The police arrived").
Retry restarts the clock. Same accessibility treatment as busted today
(alertdialog role, focus management, reduced-motion static gradient).

**HUD.** Replace the Moves/Par chips with `⏱ m:ss` + pause pips; the last
10 seconds tick audibly and the chip pulses red (respect reduced-motion:
color change only). Keep move count available on the win sheet.

**Files:** `js/pursuit.js` (new; clock, pause tokens, visibility handling),
`js/game.js` (mode plumbing, HUD, input lock), `js/audio.js` (ticking
layer, §5), `js/i18n.js`, `js/analytics.js`, `css/game.css`.

**Acceptance (headless Playwright, the repo's established pattern):**
load level → clock shows full budget, not running; first move starts it;
pause → input locked (attempt a drag, assert no piece moved), clock frozen;
2nd pause works, 3rd is refused; clock to 0 (mock timers) → busted sheet;
retry → fresh clock and 2 pauses; win → `pursuit_win` fired with payload.

---

## 2. The collection becomes the score (directive 4)

Today: 12 cosmetic hero skins unlocked by milestones (`js/collection.js`).
The new fantasy: **every level is a job, every job pays out a car, the
garage's total value is your score.**

### 2.1 "Real cars" — the licensing reality (owner sign-off recorded)

Actual manufacturer marques (Porsche, Ferrari…) require per-model licenses;
that's a business negotiation, not a code task, and unlicensed real cars
are a store-takedown risk. **Build: evocative fictional marks** — instantly
readable archetypes with noir names and flavor text, e.g. "Stuttgart
Ghost — a '73 air-cooled legend", "The Yokohama Widow", "Maranello Red".
Renderer and catalog are marque-agnostic, so licensed skins can be slotted
in later as fixed-content packs if the business side ever lands them.

### 2.2 Catalog structure

- **~48 car models** (art in `js/art.js` as SVG variants: silhouette ×
  paint × trim), tiered by chapter: Night Shift pays out beaters and
  workhorses ($2k–15k), Neon District tuners ($15k–80k), Harbor Freight
  classics ($80k–400k), Gridlock exotics/one-offs ($400k–$4M). Value curve
  should feel exponential — the last chapter's marks are worth more than
  chapters 1–3 combined.
- **Level → car mapping is static** (checked into the catalog), so every
  player heists the same car on level 37 — shareable, wiki-able. Chapter
  finales (levels 50/100/150/200) award marquee cars with bespoke art and
  a name-drop in the cut scene (§6).
- Dailies pay out from a rotating "hot list" (date-seeded pick from the
  catalog, dedup against owned; repeat wins pay a small value bump —
  "fenced again").
- The 12 existing milestone cars remain as **special commissions** (a
  separate garage wing) and keep their skin-equip role. New level-win cars
  are collection pieces first; a later phase can make any owned car
  equippable as the hero skin (same `skin` shape).

### 2.3 Value, not currency (load-bearing for Variant A)

Car values sum to a **Garage Value** figure — the game's score and the
leaderboard number. It is **never spendable**: no shop, no upgrades, no
sinks. That keeps us out of virtual-currency territory (regulatory + IAP
review posture) while still giving directive 4 its "increasing value"
fantasy. Mode multipliers: Heist win = 100% ("clean job"), Pursuit win =
100% + Hot Streak (+5% per consecutive un-busted job, cap +50%), Relax =
60% ("fenced cheap"). Replays don't re-pay (badge shows best payout mode).

### 2.4 Payout moment

The win sheet gains a **payout beat** before stars: the car rolls onto a
pedestal (reuse the H0 reveal-queue infra — it already intercepts
auto-advance), odometer-style value ticker rolls up, THEN stars. ≤2s,
tap-skippable, reduced-motion = static card. Garage screen gains: total
value header with ticker, sort by value/chapter/rarity, empty silhouetted
bays with "MARK: Level 37" teasers (the pull).

**Files:** `js/collection.js` (catalog + value + payout logic),
`js/art.js` (car art system — biggest art lift in the plan, see §3),
`js/game.js` (payout beat), `js/storage.js` (`save.heists: {levelIdx:
{mode, value}}`), `js/analytics.js` (`car_payout`), `js/i18n.js` (48 car
names/flavors — keep flavor text short; ×10 locales is 480 strings).

**Acceptance:** win any level in each mode → correct value, correct car,
garage total updates, replay pays nothing new; fresh-profile garage shows
locked silhouettes; leaderboard-ready single integer exists in save.

---

## 3. Sound effects, animations, backgrounds (directive 3)

Lift the concrete specs from AAA-PLAN §3–4 (they were reviewed and
approved; they've just never been sequenced into a build). Priority order:

1. **Vehicle art rebuild first** (AAA-PLAN §3.0 reasoning stands: it's
   renderer-portable SVG and every screenshot uses it). This now doubles
   as the §2.2 catalog art system — one SVG car system serves board pieces
   AND garage collection cards. Do not build them separately.
2. **Win choreography** (AAA-PLAN §4): last move → beat of silence → gate
   rises → hero pulls out with acceleration → letterbox micro-slow-mo →
   payout beat (§2.4) → stars. ≤2.6s, skippable, reduced-motion honored.
3. **Touch feel**: grab lift/shadow, suspension squash, blocked-shove rock
   + alarm chirp from the *blocking* car (the board explains the rule).
4. **Backgrounds**: per-chapter set-dressing as layered DOM/SVG (street
   lamps, neon spill, fog, pre-dawn snow — `docs/mockups/city-scene.html`
   is the approved visual target). Cheap CSS glows now; the WebGL lighting
   layer (AAA R1) stays a later, separate phase — do not block on it.
5. **SFX set** (see §5 for pipeline): per-length engine/rolling loops,
   surface variants per chapter, hitch clink, gate servo, alarm chirp,
   busted stinger, payout cha-ching (tasteful — cash-register is off-tone;
   use a ratchet + velvet thud).

---

## 4. Music & atmosphere (directive 5)

Already in hand: three licensed tracks (`assets/audio/` — Velvet Glove,
Clean Getaway, Midnight in the Vault) with a working per-attempt
lifecycle. Build on it:

- **Adaptive intensity** (AAA-PLAN Signature #2, scoped down): 2–3 stems
  or filter states keyed to solver distance-to-freedom (the solver already
  exposes it for hints) — as the exit clears, the mix opens up; win stinger
  lands on the next bar. In Pursuit, last-10-seconds adds a ticking layer.
- **Ambience beds per chapter** (rain hiss, harbor fog horns, distant
  city) under the existing ambience slider.
- **Convert the WAVs**: `clean-getaway.wav` (16MB) and `velvet-glove.wav`
  (31MB) are unshippable weights — encode to ~128kbps AAC/MP3, keep
  originals out of the bundle (they're already in git; add to a
  non-shipped dir or rely on history). Record license/attribution in
  README before store submission (SHIP-POLISH P2-1).
- Silent-switch, audio-session (`.ambient`), and slider semantics
  unchanged.

**Files:** `js/audio.js` (stem/ducking engine — it already does fades and
ducking; extend, don't rewrite), `assets/audio/` (re-encoded).

---

## 5. New mechanics (directive 6) — heist-cohesive, solver-verified

House rules stand: ≤4 mechanic families, one introduced per chapter, every
family extends the **shared solver** so generator/verifier/hints/daily/
difficulty model inherit it. Status + order of attack:

| Mechanic | Heist fiction | Status | Work |
|---|---|---|---|
| Walls | Roadworks / bollards | ✅ shipped, in 107/200 levels | none |
| Interlocks | Cameras & laser gates — park a car on the sensor to kill the beam | ✅ solver + 2 test levels (H1) | **Productionize**: generator support, difficulty-model rating, a curated mid-game introduction + presence in chapters 3–4 regen |
| Hitches / tow truck | The immobilized mark — booted car only the tow rig can drag | ⚠ half-built, PARKED (P0-2) | Finish to SHIP-POLISH P0-2 spec: solver coupled-set/`inert` state, collision-checked trailer moves, decouple as a solver move. The marquee "not a clone" mechanic — own phase, do not rush |
| One-way lanes | One-way streets — pieces on the lane slide one direction only | 💡 validated in 2026-07 mechanic review | Cheapest new family: legality filter in `legalMoves` (like walls), no state growth. Level data `o: [[r,c,dir]…]` |

That's the cap (walls, interlocks, hitches, one-way = four). The
previously-floated single-tile bike and multi-directional piece stay cut —
single-tile pieces collapse difficulty (measured in the July experiments)
and multi-directional breaks the axis-lock read.

Each mechanic lands with: solver extension + `tools/generate-levels.mjs`
support + `verify-levels.mjs` invariants + board art/affordance + a
3-level teaching sequence + i18n. Regen of the 200-level set happens once
per mechanic phase, re-verified `par == optimal`.

---

## 6. Narrative shell: start screens, story arcs, cut scenes (directive 7)

Keep it **wordless-first** (AAA-PLAN cut "story dialogue" for cost and
localization reasons — 10 locales multiply every sentence). The arc:

- **Animated start screen** (replaces the static `#startOverlay`): the
  garage at night, headlights sweep, title neon flickers on, the mark's
  silhouette under a tarp. Pure CSS/SVG animation, ≤3s to interactive,
  skippable, `introSeen`-gated as today. Localized per P0-5.
- **Story arc = the collection ledger.** Chapter title cards frame the
  four chapters as one escalating job for a mysterious buyer: Night Shift
  (prove yourself) → Neon District (the syndicate notices) → Harbor
  Freight (the big shipments) → Gridlock (the buyer's list, one night).
  One localized sentence per chapter card, no more.
- **Cut scenes: five wordless vignettes** (before ch.1, between chapters,
  after 200): 2–4 layered SVG scenes with camera pans and one beat of
  action each (tarp pulled off, container opens, dawn over the full
  garage). Skippable, replayable from the garage, reduced-motion = static
  frames with crossfade. Finale names the marquee car you just took.
- **Busted/win choreography** (§3) carries the moment-to-moment narrative;
  no additional dialogue systems, no VO.

**Files:** `index.html` (overlay structure), `js/vignette.js` (new, tiny
scene player), `js/art.js` (scene art), `js/i18n.js` (chapter cards).

---

## 7. Phasing — each phase ships independently

Do them in order; every phase ends green on the QA gate (§8).

| Phase | Contents | Directives served |
|---|---|---|
| **M0 — Ship blockers** | SHIP-POLISH P0-1…P0-6 + P1-1/P1-5 (verify each against current main first — some may already be fixed) | prerequisite |
| **M1 — Modes** | Heist-as-default migration + Relax + mode picker + intro-ramp exemption + explainer (§1, §1.1) | 1 |
| **M2 — Pursuit** | Timer mode complete per §1.2 spec | 2 |
| **M3 — The Score** | Car catalog, values, payout beat, garage value, Hot Streak (§2) + vehicle art system rebuild (§3.1 — shared prerequisite) | 4, 3 |
| **M4 — The Look** | Win choreography, touch feel, chapter backgrounds, SFX set (§3) | 3 |
| **M5 — The Sound** | Adaptive stems, ambience beds, re-encodes, Pursuit ticking (§4) | 5 |
| **M6 — The Story** | Animated start, chapter cards, five vignettes (§6) | 7 |
| **M7 — Interlocks live** | Productionize gates into the campaign (§5) | 6 |
| **M8 — One-Way Streets** | New family, cheapest first (§5) | 6 |
| **M9 — The Rig** | Hitches finished to P0-2 spec — marquee mechanic, press beat (§5) | 6 |

M1→M2 are ordered because Pursuit reuses the mode plumbing. M3 before M4
because the art system underlies both. Mechanics last because each forces
a level-set regen — batch disruption late, after the presentation layer
has made the game feel new.

## 8. QA gate (every phase)

Extends the SHIP-POLISH gate — run headless (Playwright +
`/opt/pw-browsers/chromium`), plus real-device pass before any release tag:

1. `node --check` all of `js/`; `node tools/verify-levels.mjs` green.
2. Fresh-profile boot in each of the three modes: intro ramp is
   pressure-free, level 4 explainer once, mode persists across reload.
3. Heist: budget honest under undo; busted → "Switch to Relax" works.
4. Pursuit: full §1.2 acceptance list.
5. Relax: no timer, no busted path reachable, car pays 60%.
6. Payout: values correct per mode, replays pay nothing, garage total
   exact, reveal-queue never skips a first-time car.
7. Daily: each mode; bust → retry → win records streak exactly once.
8. Audio lifecycle regressions (start/stop/duck/slider-never-starts).
9. Reduced-motion + photosensitivity sweep on every new animated surface.
10. All 10 locales spot-checked on every new string surface.
11. Offline boot with network blocked (fonts/audio local).

## 9. Open decisions (owner sign-off; recommended defaults given)

1. **Relax naming** — "Relax mode" vs "Casing mode" (on-theme) vs "Zen".
   *Default: Relax* (owner's word choice; clearest).
2. **Fictional vs licensed cars** — plan assumes fictional archetypes
   (§2.1). Licensed packs remain possible later. *Default: fictional.*
3. **Relax payout rate** — 60% recommended; 100% if any store-review or
   fairness concern outweighs the incentive design. *Default: 60%.*
4. **Pursuit pause count** — 2 per attempt (recommended) vs 3 for the
   first chapter as a ramp. *Default: 2 everywhere; revisit from
   `pursuit_busted` data.*
5. **Existing-player migration** — everyone defaults to Heist with a
   one-time toast (recommended), vs preserving old `alarm:false` players
   in Relax. *Default: everyone → Heist; Relax is one tap away.*
