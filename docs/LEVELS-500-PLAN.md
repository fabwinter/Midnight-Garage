# LEVELS-500 PLAN — 200 → 500 campaign levels

Goal: grow the campaign from 200 levels (4 chapters × 50) to 500 (10
chapters × 50), keeping play interesting and *increasingly* challenging in
all three pacing modes (Relaxed / Heist / Pursuit) — without breaking the
invariants the whole content pipeline rests on (par == optimal, verified
offline, shipped static).

## 0. Where difficulty actually comes from (audit)

Two levers exist today, and they are not the same thing:

1. **Par (optimal moves).** Our own generator's honest ceiling is ~par 40
   (measured — see tools/generate-levels.mjs BANDS comment). Above that we
   import from Fogleman's exhaustively-enumerated database.
   Supply audit of tools/data/fogleman-boards.txt (1,024 boards):
   - par 38–40: 572 boards, **all unused**
   - par 41+: 448 boards, 184 consumed (20 Gridlock splice, 64 Bounty,
     100 Impound) → **264 remaining**, but thin at the very top
     (only ~8 boards above par 55, and Bounty's legendary bucket already
     took the 56–60s).
   Conclusion: par alone cannot carry six more chapters of escalation.
   The top tier must be *rationed*, and the middle chapters must escalate
   on a second axis.

2. **Mechanics.** The solver already supports more than the campaign uses:
   - Walls — used (126/200 levels).
   - Hitches (tow + trailer, decouple) — used in exactly 8 Neon District
     levels; never more than one hitch per board.
   - **Interlock gates (sensors/polarity) — fully implemented in
     js/solver.js AND rendered by js/game.js (gateSVG, gates state), but
     used by ZERO campaign levels.** A finished mechanic sitting on the
     shelf. No generator exists for it (js/generate.js has none).

The established chapter pattern (ch2 debuts hitches, ch4 debuts Fogleman
monsters) is the template: **each new chapter raises the par band a notch
AND adds one twist**, so escalation comes from both levers and no two
chapters feel like "the same thing but slower".

## 1. The six new chapters

CHAPTER_SIZE stays 50. Bands overlap slightly on par because the mechanic
carries part of the load; `d` (model score) still orders levels within a
chapter.

| # | Name (working) | Par band | Twist that carries it | Source |
|---|----------------|----------|----------------------|--------|
| 5 | Overpass | 23–28 | Wall-dense boards (roadworks everywhere); tighter Heist slack begins | generator (in supply) |
| 6 | Freight Yard | 25–30 | **Multi-hitch**: two tow/trailer pairs per board, forced decouple ordering | generator + new multi-hitch pool |
| 7 | Customs | 27–32 | **Gates debut** (the shelf mechanic): sensor-linked barriers | generator + NEW gate pool |
| 8 | Rush Hour | 30–38 | Density: 14–16 pieces, walls + occasional hitch/gate cameo, breadth-boosted harden | generator (breadth run) |
| 9 | The Syndicate | 38–46 | Fogleman mid-tier; first taste of imported monsters as the norm | 572-board par 38–40 pool + par 41–46 remainder |
| 10 | Vault Row | 45–60 | Fogleman top tier; the campaign's true endgame | par 45+ remainder (rationed) |

Fogleman budget check: ch9–10 need 100 boards. Supply: 572 (38–40) +
264 (41+) = 836 unclaimed. Take ~100, leave the rest as reserve for future
Bounty rotation refreshes and Impound expansions — the plan explicitly does
NOT strip-mine the reserve.

## 2. Mode-by-mode escalation (the part that isn't just harder boards)

The three modes share boards; pressure comes from their budgets. Both
formulas live in js/game.js and were tagged "v1 — tune from funnel data".

- **Relaxed** — unchanged mechanically (that's its contract). Its
  challenge curve *is* the par curve, and stars still require par-level
  play. No work beyond making sure star thresholds stay derived from par.

- **Heist** — today: `budget = par + max(2, ceil(par × 0.25))`. Flat 25%
  slack forever means late chapters get *relatively easier* (a par-50
  board hands you 13 spare moves). Change slack to a per-chapter taper:
  25% (ch1–4, unchanged — no regression for shipped content), then
  23% / 21% / 19% / 17% / 16% / 15% for ch5–10. Implement as a
  per-chapter `heistSlack` field in CHAPTERS so the data file, not code,
  owns the curve.

- **Pursuit** — today: `1 second per par move`, 3 pause tokens. This
  formula *breaks* at high par: 55 seconds to execute 55 optimal moves
  leaves literally zero think time; nobody clears Vault Row in Pursuit.
  New formula: `time = ceil(par × 1.0) + thinkBonus(chapter)`, where
  thinkBonus is 0 for ch1–4 (again, shipped content unchanged) and grows
  with board complexity (roughly +0.25s per par move above 30, defined
  per-chapter in CHAPTERS alongside heistSlack). Pause tokens stay 3.
  Both curves get an analytics checkpoint (see §5) before being declared
  final — the "tune from funnel data" promise finally gets cashed.

## 3. Generator work (tools/ + js/generate.js)

1. **Gate generator** — `tryGenerateGate()` in js/generate.js +
   `tools/gen-gate-pool.mjs`, mirroring the existing hitch pool pattern
   (gen-hitch-pool.mjs → add-hitch-levels.mjs). Solver verification is
   free — solve() already handles gates. This is the only genuinely new
   generator code in the plan.
2. **Multi-hitch pool** — extend tryGenerateHitch to place 2 hitches with
   a solver check that decouple order actually matters (reject boards
   where both hitches are ignorable).
3. **Breadth run for ch8** — the measured lesson from the last calibration
   was that breadth (more seeds) beats depth: rerun harden+harvestShape
   sharded with ~3× seeds targeting the 30–38 band specifically.
4. **BANDS/CHAPTERS extension** — new bands table (6 rows), INTRO
   unchanged, CHAPTER accent colors + heistSlack + pursuitThink fields.
5. **Splice scripts stay the pattern** — gates and multi-hitch land via
   add-*-levels.mjs splices exactly like hitches did, so a from-scratch
   `npm run generate` remains reproducible stage by stage.

## 4. Systems that key off chapter count (must-touch list)

- **js/collection.js** — job cars are *5 per chapter, derived from
  CHAPTER_SIZE arithmetic*. Six new chapters ⇒ 30 new job cars (names,
  tiers, pacing gates). Art debt is now cheap: the admin asset library +
  promote-library.mjs workflow feeds skin.photo without code changes.
  Ship chapters with placeholder recolors first; hero art can trickle in.
- **Pro gating** — today ch1–2 free, ch3–4 Pro (`i >= 2 && !save.pro`,
  FREE_LEVELS). Decision needed (default proposal: free stays ch1–2, all
  new chapters are Pro — pure added value for the existing purchase, no
  repricing).
- **i18n.js** — 6 chapter names × 10 locales, mode-tip strings for the
  two new mechanics (gates tutorial toast, multi-hitch hint).
- **verify-levels.mjs** — already re-solves everything; add invariants:
  gate levels must be unsolvable-without-triggering-gate (twist is real),
  multi-hitch boards must fail under wrong decouple order, and campaign ∩
  bounty ∩ impound key-dedupe (levelKey) so a Fogleman board never ships
  in two places.
- **levels.data.js size** — 500 levels ≈ 60 KB raw; no perf concern
  (assets dwarf it), no pagination needed.
- **Daily / Bounty / Impound** — untouched by design; they draw from
  their own pools. The only interaction is the shared-reserve rationing
  rule in §1.

## 5. Rollout: three shippable waves

Each wave is independently releasable, verified, and includes its mode
scaling — never ship boards ahead of their pressure curves.

- **Wave 1 (200→300): ch5 Overpass + ch6 Freight Yard.**
  Multi-hitch pool, heistSlack taper, CHAPTERS data model change, 10 job
  cars. Lowest-risk wave — no new mechanic code, only generator config.
- **Wave 2 (300→400): ch7 Customs + ch8 Rush Hour.**
  Gate generator (the one real code lift), pursuitThink term, breadth
  run, 10 job cars, gate tutorial strings.
- **Wave 3 (400→500): ch9 Syndicate + ch10 Vault Row.**
  Fogleman curation (ration the top tier), endgame framing, final 10 job
  cars, funnel-data pass on both mode formulas across ch5–8 before
  locking ch9–10 budgets.

Per-wave definition of done: `npm run generate`-reproducible (or splice
scripts committed), `node tools/verify-levels.mjs` green including new
invariants, headless playthrough smoke (one level per new chapter × all
three modes), i18n complete, job cars visible in garage.

## 6. Risks / open questions

- **Gate runtime has zero shipped mileage.** Renderer + solver exist but
  no player has ever touched one; Wave 2 needs a real playtest pass, and
  the sandbox editor should gain gate placement so boards can be
  hand-checked before the chapter lands.
- **Top-tier scarcity is real** (8 boards above par 55 remain). Vault Row's
  final stretch leans on par 45–55 + gates/walls variants rather than
  promising sixty par-60 boards that don't exist.
- **Pursuit formula for par 50+** is a first proposal; the analytics
  checkpoint in Wave 3 is load-bearing, not optional.
- **30 job cars is the biggest content lift** (names/tiers/art), not the
  levels themselves — the asset library exists precisely to spread that
  work out.
