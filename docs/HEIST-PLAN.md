# Midnight Garage — Heist Direction: Implementation Plan

Concrete build plan for the **collection-heist** direction on the **premium
(Variant A) business model**. Companion to [AAA-PLAN.md](AAA-PLAN.md) — this
doc gives the AAA plan's later mechanics (interlocks, hitches, garage,
Gridlock Rescue) a single unifying frame and a locked business model, and
sequences them so each step ships. Grounded in the mechanic experiments and
market/regulatory research done 2026-07 (findings inlined where they drive a
decision).

---

## 1. The decision, in one place

- **Business model: Variant A — premium, ad-clean.** One-time Pro Garage
  IAP + optional *fixed-contents* cosmetic packs. **No gacha, no randomized-
  paid items, no energy/stamina, no ads.** This is a deliberate choice made
  against the 2026 regulatory reality: PEGI's June-2026 interactive-risk
  rules force a **minimum PEGI 16** on any game with paid random items,
  which would fight a broad-audience puzzle game; Variant A has **zero** such
  exposure. Reference case: Monument Valley (premium, artful, non-predatory,
  commercially proven).
- **Heist is a META-FRAME + an OPTIONAL mode — NOT a genre pivot.** The cozy,
  premium, no-fail puzzle core is untouched. We layer a car-collection
  fantasy on top and offer an opt-in countdown mode. We do **not** become a
  real-time action heist game.
- **"Security" = the puzzle mechanics we already validated.** Escalating
  security on higher-value marks is expressed as interlocks, walls, and
  hitches — not a separate action layer. (Measured: interlocks cost the
  solver ~nothing and can add up to +12 par; walls add par only when
  targeted; hitches unlock otherwise-impossible board geometry. See §4.)

### The covenant (unchanged, load-bearing)
No lives. No fail states. No real-time pressure in the core. Nothing
below-par-5 after the intro ramp. The optional Alarm mode **gates a reward
tier, never access** — miss the countdown and you still win, you just don't
earn the "clean getaway" bonus. Every generated board stays BFS-verified
`par == optimal`.

---

## 2. Fiction & tone

Keep the name **Midnight Garage** — the garage *is* the collection. Evolve
the fiction from "free the red car" to: **you're a specialist who liberates
rare, coveted cars from impound lots, private collections and secure
garages — one immaculate job at a time.** Each level's hero car is "the
mark," not always red.

**Tone decision (default, flagged for your sign-off):** play it as a
*stylish gentleman-thief noir* — the car is treated as art worth rescuing,
aspirational not criminal (Lupin / "gone in the night" elegance), **not**
GTA-style crime. This keeps our premium art equity and dodges age-rating and
store-featuring friction. Alternative framings (repo agent, getaway driver)
available if you'd rather — see §9.

---

## 3. Collection system (the retention spine)

The market data is unambiguous that a collection meta is what turns a puzzle
core into a months-long game (hybridcasual puzzle D30 ≈10% *with* a meta vs
near-zero without). Ours is **skill-gated and cosmetic-only** — no RNG, no
pay-to-win.

- **Cars are cosmetic hero skins.** A car changes how `pieces[0]` renders
  (and optionally a matched board palette "set"). **Zero gameplay effect** —
  this is what keeps us out of pay-to-win / F2P territory and keeps the
  puzzle fair.
- **Unlocked by skill milestones we already track** in `save` (stars, best,
  chapter completion, streaks, bounty wins). No new tracking needed for the
  first batch — just a catalog + unlock-check + the garage screen.
- **The Garage home screen** (from AAA-PLAN R6, pulled early because it is
  the spine of Variant A) shows owned cars in a living diorama; empty bays
  advertise the marks you haven't cracked yet — that's the pull.
- **New module `js/collection.js`:** a static car catalog
  `[{ id, name, rarity, unlock: {type,args}, skin }]` + `ownedCars(save)` +
  `checkUnlocks(save)` returning newly-earned cars for the reveal animation.

Monetization stays exactly as today: Pro Garage unlocks chapters 3–4 (where
the higher-rarity marks live) + all cosmetics + unlimited hints. Optional
**fixed-contents** livery packs (contents shown before purchase — no
randomness, so no PEGI/odds-disclosure trigger).

### 3b. Job cars ✅ implemented — §2's "the mark, not always red" fiction

H0 shipped with a simpler version of this system: 12 cosmetic reskins of
the *same* red hero, freely equippable by the player at any time. That
never actually delivered §2's founding fiction ("each level's hero car is
*the mark*, not always red") — equipping was pure player preference,
disconnected from what level you were on. Decided (your call, direction
**C** of three floated): **the job decides the car.** Campaign and bounty
levels don't let you pick — you drive whatever the mark is, and clearing
the level is what makes it yours. Player choice moves to *which owned car
you practice in* (Relaxed/Daily/Impound/Sandbox aren't "jobs," so they
keep the free equip), not *which car a mission uses*.

- **20 job cars, five per campaign chapter** (`js/collection.js`'s
  `JOB_CARS`), round-robin-assigned across that chapter's 50 levels
  (`carIdForLevel()`) so each car is the hero in ~10 missions before the
  pool repeats. Unlocked the moment you clear any one of its missions —
  chapter-gating (the existing Pro paywall on chapters 3-4, plus
  `save.unlocked` progress within a chapter) already does the rarity work
  for higher tiers, so no extra meta-condition was needed on top.
- **4 bounty marks unchanged** (`BOUNTY_CARS`) — one per rarity tier,
  unlocked by clearing a "Tonight's Mark" under its nightly reward
  condition. Now also the hero shown *while playing* a bounty of that tier
  (`carIdForBountyTier()`), where previously the bounty board used
  whatever the player had equipped.
- **`heroCarIdForAttempt()`** (js/game.js) is the single resolution point:
  campaign → `carIdForLevel(cur)`, bounty → `carIdForBountyTier(mode.tier)`,
  everything else (Daily/Impound/Sandbox) → `save.equippedCar`. Independent
  of the Heist/Pursuit/Relaxed pacing toggle, which is an orthogonal axis.
- **Art seam, not art yet**: every job car keeps `skin.photo: null` for now
  and renders via the existing hue-rotated-traffic-photo fallback — the
  same rendering H0's 12 reskins always used, so nothing regresses while
  real art lands. Real art drops in car-by-car by setting `skin.photo` to
  a bespoke PNG built to `classic.png`'s conventions (800×400, transparent,
  top-down, front at the right edge, baked headlights) — `js/art.js` then
  switches that car to the bespoke render *and* the beam/glow overlay that
  was previously classic-only. This also fixed the standing bug where
  every non-default skin rendered with no headlights at all: the beam
  overlay's condition had silently excluded every skinned car since H0.
- **Garage screen** now groups tiles by chapter + a "Bounty Marks" section
  instead of one flat list, and equipping a locked-by-job tile mid-mission
  shows a toast (`garage.equip.job`) rather than silently doing nothing —
  the tap still saves the choice for the next non-job session.

---

## 4. "Security" = validated puzzle mechanics

Each maps to a security fiction and to code we've either shipped or
prototyped. Measured effects (controlled experiments, same board, mechanic
on/off):

| Security fiction | Mechanic | Measured effect | Solver cost |
|---|---|---|---|
| Bollards / roadworks | **Walls** (shipped) | +par only when on the solution path; random placement ≈ +0 | shrinks state space |
| Cameras / laser gates | **Interlocks** (prototyped) | avg +0.55 par, up to **+12**; never decreases par | ~free — state stays positions-only |
| Immobilized mark / boot | **Hitches** (prototyped) | never changes an already-solvable par; **unlocks ~43% of boards that are impossible without decoupling** | ~1.78× state (well within budget) |

Key insight this bought us: our puzzle move-count ceiling is ~40 and hard to
raise. Security mechanics give difficulty an **orthogonal axis** — a rarer
mark = more interlocks/walls/hitches on a harder board + a tighter optional
Alarm budget. The *challenge envelope* keeps expanding without needing any
single board to exceed par 40.

### Solver extensions (precise)
- **Interlocks** (`solver.js`): `legalMoves` gains an optional `gates` arg:
  `[{ sensors:[[r,c]…], gate:[r,c], polarity }]`. A move whose entered cell
  is a `gate` is legal iff (any sensor cell occupied) XOR polarity. **BFS
  state representation is unchanged** (still the offsets array), so
  `analyzeShape`/`harvestShape`/`solve`/hints all keep working — only the
  edge-legality function changes. Level data gains optional `g`.
- **Hitches** (`solver.js`): pieces gain an optional coupled-set id + an
  `inert` flag (inert pieces generate no self-moves — they move only as part
  of a coupled set; couple/decouple are extra actions costing one move).
  State grows to `[…offsets, mode, trailerOffset]` per rig. Level data gains
  optional `h`. This is the biggest solver change; its own phase.

Both extensions are additive and gated behind the new data fields, so all
200 existing levels and the daily puzzle are untouched (byte-identical) until
we choose to use them.

---

## 5. Optional Alarm mode (the opt-in countdown)

Honors your "switch on/off countdown" instinct **without breaking the
covenant**, because it gates reward, not access.

- **Per-move budget by default** (turn-based): budget = a function of par
  (e.g. `par` for platinum, `par + slack` for gold). Each move decrements.
  Reach the exit within budget → **clean getaway** bonus (extra star/badge,
  and for bounties, the car). Over budget → **normal win, no bonus** — you
  never lose the level or the car you were owed by skill. Turn-based keeps it
  a *logic* puzzle: you can still think forever.
- **Real-time variant available as a spicier toggle** ("Pursuit"), same
  reward-gating, for players who want a literal clock. Default off. Flagged
  in §9 as a your-call default.
- Reuses existing star/analytics/HUD infra. New event
  `alarm_clean_getaway`. New module `js/alarm.js` (or folded into `game.js`).

---

## 6. Bounties (rotating skill challenges)

Reuses the **daily-puzzle infrastructure already built** (`daily.js`,
date-seeded `dailyLevel`, streak/calendar storage).

- A bounty = a seeded-or-curated board + a win condition ("≤par", "no
  hints", "Alarm intact") + a specific car reward.
- "Tonight's mark" slot on the home screen; completing it awards a
  collection car. Ties into Game Center leaderboards (already planned).
- New module `js/bounty.js`. No new backend — bounties are deterministic
  from date + a checked-in curation list, same as the daily.

---

## 7. Codebase impact (file-by-file)

| File | Change |
|---|---|
| `js/solver.js` | interlock `gates` arg on `legalMoves`; hitch coupled-set/`inert` in state + `solve`/`analyzeShape` |
| `js/generate.js` | generate & harvest boards with gates/hitches; keep wall support |
| `js/levels.data.js` | regenerated with new mechanics in later chapters (optional `g`/`h` fields) |
| `js/game.js` | render gates/alarms/tow-hitches; Alarm-mode countdown + HUD; garage screen wiring; car-skin apply on hero |
| `js/art.js` | new SVGs: camera/laser gate, alarm meter, tow truck, collection-car skins |
| `js/collection.js` *(new)* | car catalog + owned/unlock logic |
| `js/bounty.js` *(new)* | rotating mark definitions + reward hooks |
| `js/alarm.js` *(new, or in game.js)* | budget tracking + clean-getaway resolution |
| `js/storage.js` | `save.cars`, `save.bounties` |
| `js/analytics.js` | `car_unlock`, `bounty_complete`, `alarm_clean_getaway` |
| `js/i18n.js` | strings for garage, bounties, alarm, car names (×10 languages) |
| `tools/verify-levels.mjs` | invariants for gates (reachable, not degenerate) & hitches (inert piece has a mover) |
| `supabase/schema.sql` | (optional) bounty leaderboard columns — no PII, same posture as 0.9 |

---

## 8. Phased sequencing (each phase ships)

Same discipline as the original plan: one marketable beat per phase.

| Phase | Focus | Ships | New solver work? |
|---|---|---|---|
| **H0 — The Garage** ✅ shipped | Re-narrativize; build garage collection screen; ~12 cosmetic cars unlocked by *existing* milestones; car-skin applies to hero | "Collect the cars" — the retention hook, zero new puzzle tech | none |
| **H1 — Security Gates** ✅ shipped | Interlocks (cameras/laser gates): solver arg, generator, verify, a themed set of levels | "The garage fights back" — first security mechanic (cheapest) | interlocks (free) |
| **H2 — The Alarm** | Optional per-move Alarm mode, reward-gating; clean-getaway bonus; settings toggle | "Beat the alarm" — the opt-in countdown | none |
| **H3 — The Rig** | Hitches + tow truck (inert marks): solver coupled-set/inert, generator, verify, a themed chapter | "Some cars can't drive themselves" — the marquee mechanic | hitches (~1.8× state) |
| **H4 — Bounties** | Nightly mark on daily infra; rare-car rewards; leaderboard tie-in | "A new mark every night" — recurring pull | none |

H0 is deliberately first and mechanic-free: it's the highest-retention,
lowest-risk piece and makes the whole game feel like the new direction
immediately. Solver-heavy phases (H1, H3) are spaced so each gets its own
verify hardening.

---

## 9. Open decisions (H0 resolved)

1. **Tone/naming** — *stylish gentleman-thief noir*. Agreed.
2. **Alarm default basis** — **per-move**, real-time "Pursuit" off by default.
   Agreed (built when H2 starts).
3. **Car cosmetic scope** — hero-only reskin (`{base, dark, glass, trim}`).
   Agreed.
4. **First car roster** — 12 marks shipped, mapped to existing milestones
   (chapter clears, star streaks, daily streaks, par-or-under, Pro purchase,
   full completion). See `js/collection.js`.
   *(Superseded — see §3b: the roster and its unlock model were reworked
   to "the job decides the car," growing to 20 job cars + 4 bounty marks.
   Item 3's scope decision still stands unchanged.)*

H0 shipped `b6f001c`: garage screen, 12 cosmetic hero skins, reveal-queue
UX that intercepts the win-sheet's Next/Replay tap so a new-car moment is
never silently auto-advanced past. Verified end-to-end via headless
Playwright (locked garage → solve → win → reveal → dismiss → advance →
reopen garage → equip → hero renders new skin in gameplay), zero JS errors
across the full smoke suite.

H1 shipped (`528bfd0`):
- Solver: `legalMoves()` gates arg, state-representation unchanged
- Rendering: cyan crosshair gate symbols on board
- 2 test interlock levels (201–202) with gates blocking hero until sensors activated
- Hints respect gate constraints
- Verified end-to-end (all smoke tests pass)
- Deferred: algorithmic level generation with gates, full-chapter curation

H2 (Alarm mode) up next — optional per-move budget countdown, gating a
"clean getaway" bonus (reward) not access (covenant intact).

---

## 10. Explicitly still cut (reaffirmed under Variant A)

No gacha / loot boxes / card packs / prize wheels (PEGI-16 trigger). No
energy or stamina gates. No ads beyond the (still-deferred) opt-in rewarded
hint refill. No pay-to-win — cars are cosmetic, full stop. No real-time
pressure in the core loop. No more than the four validated mechanic families
(base, walls, interlocks, hitches).
