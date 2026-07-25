# VARIETY-PLAN: many more gate + hitch levels across the campaign

Status: **plan only — not started.** Written 2026-07-25 for hand-off to
another agent. Read [CLAUDE.md](../CLAUDE.md) first; every invariant it
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

- [ ] `node tools/verify-levels.mjs` passes with the new invariants.
- [ ] ~40 hitch + ~40 gate levels shipped, distribution ≈ §2, zero in
      Night Shift / INTRO slots.
- [ ] Every feature level's optimal solution provably exercises its
      feature (generator rejection + verify re-check).
- [ ] No campaign index shifted (diff of `levels.data.js` touches only
      replaced slots) — no save migration shipped or needed.
- [ ] Gate tutorial fires once, in every locale; Sandbox can build,
      verify, export, and promote a gate level end-to-end.
- [ ] Playwright evidence for both gate polarities + one hitch level in
      chapters 5+.
