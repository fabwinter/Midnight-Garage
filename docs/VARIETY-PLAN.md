# VARIETY-PLAN: many more gate + hitch levels across the campaign

Status: **partially shipped.** Written 2026-07-25 for hand-off to another
agent; §1's counts below are the starting point that hand-off audited, kept
as history — see [§10](#10-delivered-status-2026-07-25-pass) for what
actually landed. Read [CLAUDE.md](../CLAUDE.md) first; every invariant it
lists applies to this work, and the "in-place replacement" rule is the
backbone of the whole plan.

## 1. Where things stand today (audited, not guessed)

Counts in shipped `js/levels.data.js` (500 levels, 10 chapters × 50):

| Feature | Levels | Where |
|---|---|---|
| Roadworks walls (`w`) | 346 | everywhere — already plenty of variety |
| Hitches (`h`) | **8** | Neon District 1, Harbor Freight 3, Gridlock 4 — **chapters 5–10 have zero** |
| Interlock gates (`g`) | **0** | nowhere |

Bounty rotation (61 boards) and Impound Lot (100 boards): zero hitches,
zero gates — all plain Fogleman imports. The Daily is generated on the fly
from `tryGenerate` (no features).

Gate history, so nobody re-derives it: Phase H1 built **full engine
support** for interlock gates — `js/solver.js` models them
(`{sensors:[[r,c],…], gate:[r,c], polarity}`; a move entering the gate
cell is legal iff `anySensorOccupied XOR polarity`), `js/game.js` renders
them (`gateSVG`, `updateGates` dim/chirp), hints/replays/verify all pass
`lv.g` through, and the Level Inspector already has a gate badge+filter.
Two hand-made test gate levels existed briefly and were removed in the P0
cleanup (`7b4255b`). What has **never existed**: a gate generator, gate
levels in shipped data, gate-specific verify invariants, a first-time gate
tutorial, and a Sandbox gate tool.

Hitch mechanics were just corrected (commits `b0d8983` + `4949094`):
a trailer can never move on its own (coupled or decoupled — it's dead
weight until re-hitched), and double-tap toggles couple/decouple both
ways. `tryGenerateHitch` (js/generate.js) and `tools/gen-hitch-pool.mjs`
work under the corrected rules. **Known supply problem**: the corrected
pool skews easy — a 4 000-attempt run yielded 81 boards, histogram
`9:45 10:15 11:7 12:5 13:2 14:1 15:3 16:1 17:1 18:1`. Par ≥ 13 supply is
single digits; par ≥ 20 supply is zero. Chapters 5–10 need pars 18–60.

## 2. Target distribution

Keep the majority of the campaign classic; make features a recurring
seasoning, escalating like everything else does. Suggested end state
(~16% of the campaign has a mechanic beyond walls):

| Chapter (par band) | Hitch | Gate | Notes |
|---|---|---|---|
| 1 Night Shift (6–13) | 0 | 0 | stays pure — it teaches basic sliding |
| 2 Neon District (10–16) | 6 | 4 | hitch intro already lives here; gate intro goes late-chapter |
| 3 Harbor Freight (11–18) | 6 | 5 | |
| 4 Gridlock (13–23) | 6 | 5 | |
| 5 Overpass (18–27) | 5 | 5 | first chapter needing hardened feature boards |
| 6 Freight Yard (20–39) | 5 | 5 | |
| 7 Customs (29–44) | 4 | 5 | |
| 8 Rush Hour (36–45) | 3 | 4 | supply-dependent; see §4 |
| 9 The Syndicate (38–47) | 3 | 4 | " |
| 10 Vault Row (41–60) | 2 | 3 | " — even a few is enough at this depth |
| **Total** | **~40** | **~40** | |

Treat the per-chapter numbers as targets, not contracts — if hardened
supply for chapters 8–10 comes up short after a reasonable effort, ship
fewer there rather than shipping boards whose feature is cosmetic (see the
"must exercise the feature" rule below). Also fine: a handful of
**combined** hitch+gate boards in chapters 6+ as a stretch goal, but only
after the two single-feature pipelines work.

## 3. Phase G — the gate generator (the genuinely new work)

Add `tryGenerateGate(rng, opts)` to `js/generate.js`, a sibling of
`tryGenerateHitch` (dedicated function, not a mode of `tryGenerate`):

- Place hero + random fillers as `tryGenerate` does (reuse its
  wall-placement path too — gates and walls coexist fine).
- Place **one gate** `{sensors, gate, polarity}`: gate cell on an empty
  cell that plausibly blocks traffic (the exit row to the hero's right is
  the highest-value spot; lanes of vertical blockers are also good), and
  1–2 sensor cells elsewhere. Both polarities: `polarity:false` =
  "occupy a sensor to open the gate" (pressure plate), `polarity:true` =
  "clear all sensors to open" (tripwire). Sample both; tripwire boards
  play very differently.
- **Reject any candidate whose optimal solution doesn't exercise the
  gate** — this is the exact analog of `tryGenerateHitch`'s `usesHitch`
  check and it's what separates a gate puzzle from a plain board with
  gate art bolted on. Cheapest strong test: solve twice, once with the
  gate and once without; require `withGate.optimal > withoutGate.optimal`
  (the gate genuinely costs moves), plus at least one move in the optimal
  path enters the gate cell.
- Geometry invariants at creation time: gate cell and sensors in bounds,
  not on a wall cell, not under a starting piece for the gate cell
  (sensors under a starting piece are legal and interesting — the board
  starts with the gate held open/shut), sensors ≠ gate cell, and if the
  gate cell is on the exit row it must be to the hero's right (that's the
  point) — the no-walls-on-exit-row rule does NOT apply to gates because
  gates can open; the solver already proves solvability regardless.
- **Key/dedup**: `levelKey(pieces, walls)` ignores gates. Append a gate
  signature the way the hitch generator appends `|H<tow>-<trailer>`,
  e.g. `|G<gr>,<gc>:<s1r>,<s1c>[;<s2r>,<s2c>]:<polarity>`. Do the same
  wherever keys are compared (the Sandbox duplicate-check `shippedBoards()`
  in js/game.js and verify's cross-pool dedup use `levelKey` on
  pieces+walls only — two boards differing only in gates would collide;
  acceptable for cross-pool dedup, but be aware of it).
- Pool tool: `tools/gen-gate-pool.mjs`, a straight copy of
  `tools/gen-hitch-pool.mjs` writing `.genwork/gate-pool.json`.

New verify-levels.mjs invariants (add alongside the existing hitch ones):
gate/sensor cells in bounds; no gate cell on a wall or under a starting
piece; sensors don't coincide with the gate cell; and (cheap, valuable)
re-assert `solve(without gates).optimal !== lv.m` for gate levels — if
they're ever equal the gate has silently become decorative.

## 4. Phase S — high-par supply via feature-aware `harden()`

Native generation tops out around par 12–18 for both features. Chapters
5–10 need up to par 60. The existing answer to this exact problem is
`harden()` (hill-climb mutation) — but **today `harden()` is not
feature-aware**: it solves with `{walls}` only, would happily mutate or
delete the tow/trailer pair, and drops `h`/`g` from its output entirely.

Extend it (or add a `hardenFeature()` wrapper) to:
- carry `hitches`/`gates` through every `solve()`/`rate()` call and into
  the returned level object;
- never mutate/remove the tow or trailer pieces (skip mutations whose
  target index is in the hitch), and never place a piece/wall on the gate
  or sensor cells;
- keep the tow/trailer physical adjacency intact (it's start-state data —
  as long as neither piece is touched it survives automatically);
- re-run the "must exercise the feature" rejection on the final board,
  not just the seed — hardening can accidentally make the feature
  irrelevant while raising par.

Then do what `gen-500-native.mjs` did: seed with the best native feature
boards and climb them into the par 18–60 range. Budget generously
(these solves are slower with the extra state); a background run of an
hour is fine and normal for this repo's tooling.

## 5. Phase P — placement into the campaign (the dangerous part)

**All replacements in place, at the same array indices.** Campaign
progress is index-based; in-place replacement needs no save migration.
Follow `tools/fix-hitch-levels-v2.mjs` exactly — it is the current
best-practice template:

- Build a replacement map `idx -> exact pool board` (or `[par, minD]`
  targeting), where each replaced slot keeps its chapter's par band AND
  the chapter's difficulty-score floor (verify enforces strictly
  increasing floors — check what each chapter's floor is at run time,
  don't copy the numbers from this doc).
- Choose eviction targets = plain (no `w`-only doesn't matter, but no
  `h`/`g`) boards in each chapter, spread across the chapter rather than
  clustered, and **never indices 0–2** (the INTRO ramp).
- Do NOT re-sort chapters after replacement (that reorders indices =
  save migration territory). Slightly lumpy intra-chapter d-ordering is
  already accepted (fix-hitch-levels-v2 did the same).
- Re-verify every replacement with a fresh `solve()` before writing, then
  run `node tools/verify-levels.mjs` — it must pass 100% clean.
- ~80 slots is a big diff for `js/levels.data.js`; that's fine, it's an
  AUTO-GENERATED file. Write one script (`tools/add-variety-levels.mjs`),
  keep `--dry-run` support, print old→new par/d per slot.

## 6. Phase U — UX that must land with the content

- **Gate first-time tutorial**: clone the hitch pattern —
  `#hitchTutorialOverlay` in index.html, `save.hitchSeen` gate in
  `loadLevel` (js/game.js ~line 983), `hitch.tutorial.*` strings. Add
  `save.gateSeen` + `#gateTutorialOverlay` + `gate.tutorial.*` keys in
  **all 10 locales** (en/es/fr/de/it/pt/ja/ko/zh/ru — the repo treats
  partial locale coverage as a bug). Content: sensor cell + gate cell
  diagram, "park on the plate to open the gate" / "some gates work in
  reverse," gates never need a tap — they react to where vehicles sit.
- **Sandbox gate tool**: a `Gate` tool button (place gate cell, then tap
  1–2 sensor cells, toggle polarity; tapping an existing gate removes it),
  rendering via the existing `gateSVG`, included in `sbLevelObj()`/export
  (`tools/promote-sandbox-levels.mjs` already passes `g` through), and
  gate-aware `sbStatus()` solve (add `gates` to its `solve()` opts — the
  hitch tool work in `791b245` is the template for all of this).
- Level Inspector needs nothing — gate badge/filter already exist.

## 7. Explicitly out of scope / do-not-touch

- **`dailyLevel()` must not change.** The calendar back-fills past dates
  by re-running the generator; any change to its sampling changes every
  historical daily board worldwide. No features in the daily.
- **Bounty/Impound pools**: leave as-is this pass. Their pars (41–60)
  exceed native feature supply, they're key-addressed (safe to re-curate
  later), and mixing this in now doubles the risk for little variety gain
  — players see one bounty per night.
- `tools/extend-to-500.mjs` is historical/authoritative — don't rerun or
  edit it for this work.
- Don't add new fields to the level schema. `p/w/g/h/m/d` is complete.

## 8. Suggested commit sequence (each one verify-clean + pushed)

1. `tryGenerateGate` + `gen-gate-pool.mjs` + verify gate invariants
   (+ unit-style solver sanity checks in a scratch script, like the
   legalMoves state-table check used for the hitch fix).
2. Feature-aware `harden()` + pool runs committed as `.genwork` is
   gitignored — commit only tooling, regenerate pools on demand.
3. `tools/add-variety-levels.mjs` + the regenerated `js/levels.data.js`.
4. Gate tutorial + i18n + Sandbox gate tool.
5. Final pass: full `verify-levels.mjs`, Playwright hands-on check of one
   gate level per polarity (drive onto sensor → gate art dims + hero can
   pass; drive off → blocked again) and one high-chapter hitch level,
   README/CLAUDE.md counts updated.

## 9. Acceptance checklist

- [x] `node tools/verify-levels.mjs` passes with the new invariants.
- [ ] ~40 hitch + ~40 gate levels shipped, distribution ≈ §2, zero in
      Night Shift / INTRO slots. **24 hitch + 27 gate shipped** (51 of
      the ~80 target, chapters 1–6) — short of target; see §10 for why
      this is a genuine supply ceiling, not an unfinished step.
- [x] Every feature level's optimal solution provably exercises its
      feature (generator rejection + verify re-check).
- [x] No campaign index shifted (diff of `levels.data.js` touches only
      replaced slots) — no save migration shipped or needed.
- [x] Gate tutorial fires once, in every locale; Sandbox can build,
      verify, export, and promote a gate level end-to-end.
- [x] Playwright evidence for both gate polarities in real gameplay
      (Level 52 tripwire, Level 86 pressure-plate — see §10).
- [ ] One hitch level in chapters 5+ for Playwright evidence — still
      outstanding. Chapters 5+ have zero *hitch* levels (Freight Yard's
      hitch allocation never got matching supply; see §10), only gate
      (Freight Yard, Customs).

## 10. Delivered (status, 2026-07-25/26 pass)

All four phases (G/S/P/U) are built and working; what's actually shipped
in `js/levels.data.js` is smaller than the §2 targets because the hitch
generation approach hits a genuine difficulty ceiling around par 22–23
(confirmed by two hardening passes of increasing depth, not just one
under-run attempt — see below), and gate's ceiling (par 33 and still
slowly climbing) is far enough below Vault Row's 41–60 floor that closing
the gap isn't a matter of more time on the current approach.

**Built and verified:**
- Phase G — `tryGenerateGate` + `tools/gen-gate-pool.mjs` + the four new
  verify-levels.mjs gate invariants (bounds, not-on-wall, not-under-piece,
  decorative-gate re-check). 41 native gate boards generated, par 9–15.
- Phase S — `harden()` is feature-aware: carries hitches/gates through
  every `solve()`/`rate()` call, never mutates a hitch's tow/trailer or a
  gate's sensor/gate cells, re-runs the exercise-the-feature check on the
  final board. `tools/harden-variety-pools.mjs` (added this pass) runs it
  at scale — two passes, results below.
- Phase P — `tools/add-variety-levels.mjs` places pool boards in-place by
  chapter target, matching par band + exceeding the chapter's difficulty
  floor, deduplicating against every existing campaign board by
  `levelKey` (an earlier version of this script didn't dedupe and
  produced duplicate-board verify failures — fixed; a *later* version had
  a separate idempotency bug — also fixed, see below).
- Phase U — gate tutorial (HTML overlay + `gate.tutorial.*` in all 10
  locales + `save.gateSeen` gating in `loadLevel`), and a full Sandbox
  gate tool: tap to place the gate cell, tap 1–2 sensor cells, then a
  dedicated `#sbGateConfig` bar for polarity toggle / commit / cancel
  (an earlier version tried to overload board taps for polarity+commit
  and left `sbCommitGate()` unreachable from the UI — fixed; see the
  "Fix Sandbox gate tool" commit). `sbStatus()` now solves with gates
  included. Erase removes a committed gate by tapping its gate or sensor
  cell.

**Also fixed this pass (not in the original plan, found while testing):**
a `SyntaxError` in `js/i18n.js` (curly quotes used as string delimiters,
plus two locale strings with an unescaped straight apostrophe) was
silently breaking the *entire app's boot* — nothing after the `js/i18n.js`
import in `js/game.js` ever ran, so even the splash screen's Start button
did nothing. This had shipped on the branch before this pass and was only
caught by actually driving the app end-to-end in a real browser, which is
why CLAUDE.md's Playwright guidance and this plan's §9 Playwright
checklist both matter — a script that only checks `node --check` on each
file individually, or only exercises `verify-levels.mjs`, would never
have caught it (neither touches `js/i18n.js`'s syntax).

**Verified with real Playwright gameplay** (not just Sandbox): loaded
Level 52 (tripwire gate, `polarity:true`) and Level 86 (pressure-plate
gate, `polarity:false`) via the admin jump input, drove each with its
solver-computed optimal move sequence via real mouse drags on the actual
game board, and confirmed — at the exact moves the solver's path predicts
— the gate's `.gate-open` class toggles correctly for both polarities
(including a run where a *different* sensor than the first is what
reopens a pressure-plate gate, proving the "any sensor" OR logic, not
just the first one tried). Both levels won cleanly at exactly par (13/13,
3 stars). The gate tutorial fired on first encounter with the correct
copy and did not re-fire on the second gate level.

**Hardening runs (`tools/harden-variety-pools.mjs`, added this pass) — two
passes, ~27 min then ~2 hr:**
- Pass 1 (30 seeds × 600 steps × 2 passes): hitch par 18 → 22, gate par
  15 → 30.
- Pass 2, deeper (25 seeds × 1200 steps × 4 passes, ~4x the step budget):
  hitch **plateaued at par 22** — 13 more boards landed in the 15–24
  range but the ceiling didn't move despite 4x the search depth. That's
  a real signal, not an undertested step: this generation approach (piece
  add/remove/slide mutations on a hitch-anchored board, `wallMax=0`) has
  hit its difficulty ceiling for the hitch mechanic around par 22–23.
  Gate reached par 33 (28 new boards) — still climbing, unlike hitch, but
  each gate `solve()` call is markedly slower (extra sensor/polarity
  bookkeeping), so the same time budget bought much less depth.
- All 555 pooled boards (281 hitch + 274 gate) independently re-verified
  solvable at their claimed par before use — a Node script that re-solves
  every entry outside `harden()`'s own internal check, not just trusting
  the generator's self-report.

**Placement (`tools/add-variety-levels.mjs`) — bug found and fixed before
shipping:** the first re-run after pass 1 treated each chapter's TARGETS
entry as a **per-run increment** instead of the chapter's final desired
count, so re-running the placement script on top of an already-placed
chapter nearly doubled it (Neon District would have gone from 7 hitch to
13 against a target of 6) while chapters 6–10 got nothing. Caught by
diffing per-chapter counts before committing, not by `verify-levels.mjs`
— every individual board was valid, this was a distribution bug. Fixed:
the script now counts what's already shipped per chapter and only fills
`target − existing`; confirmed idempotent (a `--dry-run` immediately after
a real run reports 0 replacements).

**Final shipped distribution** (24 hitch + 27 gate, target was ~40 + ~40):

| Chapter | Hitch | Gate |
|---|---|---|
| Night Shift | 0/0 | 0/0 |
| Neon District | 7/6 | 4/4 |
| Harbor Freight | 6/6 | 5/5 |
| Gridlock | 6/6 | 5/5 |
| Overpass | 5/5 | 5/5 |
| Freight Yard | 0/5 | 5/5 |
| Customs | 0/4 | 3/5 |
| Rush Hour | 0/3 | 0/4 |
| The Syndicate | 0/3 | 0/4 |
| Vault Row | 0/2 | 0/3 |

**Why this is where it stops, not where the work paused:** Freight Yard
through Vault Row need hitch par 20–60 and gate par 29–60 with a
difficulty *score* above each chapter's rising floor (not just par in
range — the floor check is what rejected the plentiful-but-too-easy par
20–22 hitch boards for Freight Yard's par 20–39 band). Hitch demonstrably
plateaus around par 22–23 under this generation approach; two hardening
passes of increasing depth confirm it, not just one under-run attempt.
Gate has more headroom (33 and climbing) but at a cost-per-par that makes
reaching 41–60 for Vault Row impractical without materially different
tooling — likely a from-scratch generator shaped for high piece counts
from the start (more like `tools/gen-500-native.mjs`'s sample-then-harden
approach) rather than climbing outward from hand-shaped low-par seeds.
Per §2's own allowance — "ship fewer there rather than shipping boards
whose feature is cosmetic" — this is the correct stopping point for this
approach; going further needs a different generation strategy, not more
time on this one.

**Still outstanding:**
- A chapter-5+ **hitch** level for the Playwright evidence checklist item
  — chapters 5+ only got gate supply (Freight Yard, Customs); no hitch
  board ever cleared a chapter-5+ floor. Gate is fully covered (Customs,
  chapter 6, has 3 verified gate levels).
- Rush Hour, The Syndicate, and Vault Row (chapters 8–10) remain entirely
  feature-free — would need the different generation strategy noted
  above, not a longer run of the current one.
