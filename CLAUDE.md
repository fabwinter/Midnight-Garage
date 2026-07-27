# Working in this repo

Midnight Garage is a vanilla-JS (ES modules, no build step) sliding-block
puzzle game. See [README.md](README.md) for what it does; this file is
about how to work in it safely.

## Commands

```bash
node tools/serve.mjs         # or: npm run dev — static server on :8080
node tools/verify-levels.mjs # or: npm run verify — full regression check
```

Run `verify-levels.mjs` after *any* change that touches `js/solver.js`,
`js/generate.js`, or any `*.data.js` file. It re-solves all 500 campaign
levels + 61 bounty + 100 impound boards (par == optimal), checks chapter
par-bands and score-floor monotonicity, hitch index/orientation validity,
cross-pool key dedup, and 14 days of daily-puzzle determinism. It's fast
(seconds) — there's no reason to skip it.

There's no test framework wired in beyond that script. UI/visual changes
need a real headless-browser check — see "Testing UI changes" below.

## Critical invariants — do not break these

- **Save-progress is index-based for campaign/mode-level progress, but
  key-based (via `levelKey()`) for impound.** If you ever reorder or
  replace campaign levels at different array indices, you need a save
  migration (see `js/legacy-campaign-keys-v1.js` +
  `migrateCampaignReorder()` in `js/game.js` for the pattern from the
  200→500 expansion). Replacing a level *in place* at the same index
  (e.g. `tools/fix-hitch-levels.mjs`) needs no migration — prefer that
  when possible.
- **Chapter score floors must strictly increase** (`tools/verify-levels.mjs`
  checks this) — chapter *n*'s lowest difficulty score must exceed chapter
  *n-1*'s. When swapping levels in/out of a chapter, target an explicit
  `[par, minD]`, not just a par value, or you can quietly punch a hole in
  the difficulty curve while still passing the par-band check.
  `tools/fix-hitch-levels.mjs` shows the pattern.
  - Note: `tools/extend-to-500.mjs` was edited outside this codebase's
    normal Claude Code flow (the reserve-capping and exit-row-wall
    filtering logic) — treat it as authoritative, don't revert it.
- **Hitch tow/trailer must be physically adjacent**, same lane, same
  orientation, no gap — not just "linked by matching indices." The solver
  doesn't require this (it'll happily couple two pieces on opposite sides
  of the board and slide them in lockstep), but it looks broken. Both
  `js/generate.js: tryGenerateHitch` and the Sandbox's Hitch tool
  (`js/game.js: sbHitchable`) enforce it at creation time.
- **A hitch trailer's rendered length decides its role**, not a separate
  flag: length 3 = genuine trailer (any car may tow it), length < 3 =
  broken-down car (only the dedicated tow-truck asset may tow it,
  regardless of the tow piece's own length). See `js/art.js: vehicleSVG`'s
  `brokenDown`/`towCar` branches. Don't add a new "trailer type" field —
  the length already carries that meaning everywhere else in the codebase.
- **Never place a wall or non-hero horizontal piece on the exit row** — an
  unwinnable board. Checked in `verify-levels.mjs`, `sbFits`/`sbPlace` in
  the Sandbox, and `promote-sandbox-levels.mjs`.
- **A gate is a boom barrier, so it has a passage `axis`** (`'h'`/`'v'`,
  required on every gate): traffic passes *through* along that axis when
  the sensors say open, and can **never** cross it perpendicular — open or
  shut. A gate on the exit row must therefore be `'h'`, or the hero is
  walled in. Enforced in `js/solver.js: legalMoves`'s `gateBlocks` and
  mirrored on the live board by `js/game.js: gateBlocksCell` — those two
  must stay in lockstep or the board will allow moves the verified par
  never accounted for. `verify-levels.mjs` rejects a missing/`'v'`-on-exit-row
  axis rather than letting it default.
- **A gate never closes on a vehicle.** `updateGates` holds the arm up
  while anything occupies the gate cell, whatever the sensors say. This is
  display-only by construction and must stay that way: an occupied gate
  cell can't be entered anyway (`legalMoves` tests occupancy *before*
  `gateBlocks`), so gate state only ever decides moves while the cell is
  empty. Don't "fix" this by feeding the override into the solver.
- **Admin-only tools (Sandbox, Asset Library, Level Inspector) are reached
  by tapping the title 5×** on the start screen (`#brandTitle`,
  `pointerdown` × 5) — there's no other entry point, and it's
  `save.admin`-gated, not a build flag.
- **No two vehicles in one level (hero included) may share a colour
  family.** Colours aren't stored in level data — they're computed at
  render time in `js/art.js` from each photo's `color` tag, grouped into
  one of 12 basic-colour families (`COLOR_FAMILIES`/`familyFromTag`/
  `familyFromHex`). `vehicleSVG`'s `bucketSequence` round-robins by family
  (not by the finer `color` tag) so no two same-family entries land in one
  level; the hero's family (from its skin hex, via `opts.heroBase`) is
  excluded outright, and the truck sequence — allocated first, since its
  family space is a tiny 7-wide subset of sedan's 12 — reserves against
  sedan's via `boundedExclude`, which only excludes as much as still
  leaves the needed count satisfiable (an earlier version excluded
  everything sedans used and collapsed to zero candidates, silently
  dropping even the hero exclusion). A level needing more concurrent
  vehicles than there are non-hero families (11) is only forced into
  `total - 11` repeats, never more — `tools/verify-levels.mjs`'s
  colour-collision check asserts exactly that floor for every campaign/
  bounty/impound board. `skinFor()` returns `null` for the classic default
  car (level 1's hero, and anyone who hasn't equipped a Garage skin) —
  always fall back to `PALETTE[0][0]` before reading `.base`, never call
  it unguarded (this crashed `buildPieces()` silently on level 1 during
  development; the browser smoke test in "Testing UI changes" below is
  what catches this class of bug, `verify-levels.mjs` doesn't touch this
  render-time path at all).

## Coding conventions already established here

- No JSDoc-style multi-line comments on every function. Comments explain
  *why*, not *what* — a hidden constraint, a bug a change is working around,
  a non-obvious invariant. If the code is self-explanatory, no comment.
- Overlays toggle a `.show` CSS class (opacity/pointer-events transition),
  **not** `display:none` — matters for any script checking visibility.
- Slider-heavy UI (the Asset Library preview) follows a data-driven
  pattern: one `[rangeId, labelId, default]` array (`LIB_SLIDERS` in
  `js/game.js`) drives both the `input`-event wiring and the reset logic,
  so a new slider is a one-line addition, not a new listener + new reset
  branch.
- `photoOverride` in `vehicleSVG()` opts always wins over automatic
  photo-rotation/role logic (broken-down pin, tow-truck forcing,
  colour-safe rotation) — it's the "an admin explicitly picked this exact
  asset" escape hatch (Sandbox picker, library preview). Don't special-case
  around it; extend the `??`/ternary chain instead.
- `canvas 2D ctx.filter` is unreliable on at least one real device this
  shipped to (silently a no-op). Colour adjustments in `js/library.js` use
  manual `getImageData`/`putImageData` pixel math with the CSS-spec colour
  matrices instead — don't reintroduce `ctx.filter` for anything
  user-facing.

## Testing UI changes

No Playwright config lives in the repo, but `playwright` is an installed
dependency — write a throwaway script, run it, delete it:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:8080/');
// Enable admin mode: 5x pointerdown (not click) on #brandTitle
for(let i = 0; i < 5; i++){ await page.dispatchEvent('#brandTitle', 'pointerdown'); await page.waitForTimeout(80); }
```

Run scripts from the repo root (`node .scratch-foo.mjs`) so the `playwright`
resolve finds `node_modules` — running from `/tmp` or elsewhere fails with
`ERR_MODULE_NOT_FOUND`. Delete the scratch script when done; nothing named
`.scratch-*` should get committed.

For overlay visibility, Playwright's `isVisible()` can false-positive
because of the `.show`-class/opacity pattern above — check computed opacity
or just read rendered content instead of trusting `isVisible()`.

## Where things live

| Concern | File |
|---|---|
| BFS solver + difficulty model | `js/solver.js` |
| Level/board generation (incl. hitches, daily) | `js/generate.js` |
| Campaign level data (500 levels, 10 chapters) | `js/levels.data.js` |
| Bounty / Impound board pools | `js/bounty-rotation.data.js`, `js/impound-lot.data.js` |
| Main app: game loop, UI wiring, Sandbox, admin | `js/game.js` |
| Vehicle/board SVG rendering | `js/art.js` |
| Admin asset library storage + image pipeline | `js/library.js` |
| Car collection / job-car / garage logic | `js/collection.js` |
| i18n strings (10 locales) | `js/i18n.js` |
| Save/load (Capacitor Preferences or localStorage) | `js/storage.js` |
