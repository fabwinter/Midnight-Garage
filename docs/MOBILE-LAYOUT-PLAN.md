# Mobile & tablet layout plan

Handoff brief for three device-ergonomics problems found while testing the
live build on a phone and an iPad. All three are layout/input concerns —
**no gameplay, solver, level-data, or economy code should change**, and
`npm run verify` must stay green (it will, unless you touch something you
shouldn't).

Read [CLAUDE.md](../CLAUDE.md) first — especially "Testing UI changes"
(throwaway Playwright scripts, `.scratch-*`, the `.show`-class
`isVisible()` gotcha) and the overlay/CSS conventions. Everything below
assumes those.

---

## Current layout, as built

Single column, `.wrap{max-width:560px}` (`css/game.css:53`), stacked top
to bottom:

| Band | Element | Notes |
|---|---|---|
| 1 | `header` | brand text + **6 icon buttons** (daily, bounty, levels, garage, shop, settings) |
| 2 | `.hud` | level / chapter+stars / moves / par / alarm / pursuit chips |
| 3 | `.stage > .frame > .board` | the 6×6 grid, `width:calc(var(--cell)*6)` |
| 4 | `.controls` | Undo · Hint · Reset (3-up grid) |

Board size comes from `layout()` in `js/game.js:117-126`:

```js
const vw = Math.min(window.innerWidth, 560) - 28 - 32;
const vh = window.innerHeight - 320;
CELL = Math.floor(Math.max(40, Math.min(vw, Math.max(vh, 240))) / 6);
```

`--cell` drives every piece, wall, gate and sensor (they're absolutely
positioned in px against it — see `buildPieces()`), so **`layout()` is the
single lever for board scale**. It's called on `window.resize`
(`js/game.js:2690`) and at boot.

---

## 1. One-handed thumb reachability

**Problem.** Everything you *navigate* with sits in the top band, which is
exactly the least reachable zone one-handed on a modern large phone. The
six header icon-buttons (`index.html:22-42`) are the worst offenders —
they're 40-ish px targets pinned to the top edge above a ~700px-tall
board. The in-level controls (Undo/Hint/Reset) are already bottom-anchored
and are fine; don't move them.

**Direction to explore** (pick one, don't do all three):

- **(a) Move the nav to the bottom on narrow viewports.** A `@media
  (max-width: 560px) and (pointer: coarse)` rule that reorders `header`'s
  `.hbtns` into a bottom bar, leaving the brand text up top. Cheapest in
  CSS terms if `.hbtns` can be `position:fixed` bottom without disturbing
  `.wrap`'s flex flow — but watch `env(safe-area-inset-bottom)`, already
  handled in `.wrap`'s padding, and make sure it doesn't collide with
  `.controls` or with `js/ads.js`'s banner slot (`setBannerVisible`,
  currently `BANNER_ENABLED = false` but the call sites are live).
- **(b) Collapse the six icons into one reachable menu.** A single
  bottom-right FAB that opens a sheet with the six destinations. More
  disruptive to muscle memory, but scales better if a seventh destination
  ever lands.
- **(c) Leave nav where it is, shrink the top band.** If the real
  complaint is "the board is pushed too low," reclaiming header height may
  fix reach without moving anything. Measure before assuming.

**Decide by measuring first.** Before writing CSS, screenshot the live
layout at iPhone-class viewports (390×844, 430×932) and mark the
thumb-arc. If the board itself is comfortably in reach and only the nav
isn't, (a) is the surgical fix and (b) is over-engineering.

**Constraint:** the admin backdoor is `#brandTitle` × 5 `pointerdown`
(CLAUDE.md) — whatever happens to the header, that element must survive
and stay tappable, or admin mode becomes unreachable.

---

## 2. iPad — wasted space

**Problem.** Two hard 560px caps mean an iPad renders a phone-width column
centred in a sea of background:

- `.wrap{max-width:560px}` — `css/game.css:53`
- `Math.min(window.innerWidth, 560)` in `layout()` — `js/game.js:118`

On a portrait iPad (~820×1180 CSS px) that yields `vw = 500`, `vh = 860`,
so `CELL = min(500, 860)/6 ≈ 83px` — the board is width-capped at roughly
half the available space, and there are no tablet or landscape media
queries anywhere (`css/game.css` has exactly one breakpoint, `@media
(max-width:380px)` at line 680).

**Direction to explore.**

- Raise or remove the `560` cap **in both places** — they must stay in
  sync or the board will overflow `.wrap` or under-fill it. Consider
  deriving one from the other rather than repeating the literal.
- The `- 320` chrome reserve in `vh` is a phone-shaped assumption. On a
  tablet the header/hud/controls don't grow proportionally, so a fixed
  320px is wrong at that size — measure the actual chrome height (or use a
  CSS-driven layout and let `layout()` read the stage's real box) instead
  of hardcoding a second magic number.
- **Landscape tablet is the bigger opportunity.** A wide viewport could
  put the board centre and move hud/controls into a side rail, which also
  helps reach. This is a genuine layout variant, not a scale tweak — if
  you go there, keep it behind a `@media (min-width: 900px)` (or
  orientation) query so phone layout is untouched.
- Sanity-cap the board somewhere sensible. "Fill the iPad" shouldn't mean
  a 150px cell that needs an arm swing to drag across; pick a max and say
  why in a comment.

**Watch for:** overlay sheets have their own caps (`.sheet{max-width:480px}`
at `css/game.css:401`, `.win-sheet` 380, `.intro-sheet` 520, `.sandbox-sheet`
420). Those are probably *fine* on a tablet — a dialog shouldn't span
1024px — so don't reflexively scale them with the board. The two plate
sheets (`.intro-sheet`/`.pro-sheet`) have background art pinned to sheet
*width* (`background-size:100% auto` + a `.plate-spacer` with
`aspect-ratio`, see CLAUDE.md); changing their width changes the art
scale, so leave them alone unless asked.

---

## 3. Main screen zooms and pans — should be fixed

**Problem, with root cause.** `index.html:5` already declares:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
```

**iOS Safari has ignored `user-scalable=no` since iOS 10** (deliberately —
it's an accessibility decision). That's why it still pinch-zooms on the
iPad/iPhone despite the meta tag looking correct. `body` has
`touch-action:manipulation` (`css/game.css:47`) which kills *double-tap*
zoom but not pinch, and `.board` has `touch-action:none`
(`css/game.css:240`) which is why dragging pieces works — the problem is
everything *outside* the board.

There is **no `gesturestart`/`gesturechange` handler anywhere** in
`js/game.js` (grep confirms), which is the usual Safari-specific fix.

**Direction to explore.**

- Add `gesturestart` / `gesturechange` / `gestureend` `preventDefault()`
  listeners (Safari-only events; harmless no-ops elsewhere). Register them
  in `wire()` alongside the existing `board.addEventListener('contextmenu',
  …)` at `js/game.js:2692` so all the input-suppression lives together.
- Kill the rubber-band/pan with `overscroll-behavior:none` on `body`, and
  consider whether the page should scroll at all — `body` is
  `min-height:100dvh` + flex column, so on a short viewport the content
  legitimately needs to scroll. **Don't blanket `position:fixed` the
  body** or you'll trap content off-screen on small phones; the overlay
  sheets already handle their own scrolling
  (`.sheet{max-height:86dvh;overflow:auto;overscroll-behavior:contain}`).
- Verify you haven't broken: piece dragging (`.board` pointer events),
  overlay sheet scrolling (Settings and Garage both overflow on a phone),
  and the Sandbox's drag-to-place picker.

**Accessibility note worth raising with the user rather than deciding
alone:** suppressing pinch-zoom app-wide is exactly what the iOS behaviour
is protecting against. It's the right call for a drag-based game board,
but if any text ends up unreadably small at a fixed scale that's a real
regression. Flag it if you hit that tension; don't silently ship an
unzoomable wall of 11px text.

---

## Verification

Nothing here is covered by `tools/verify-levels.mjs` — it never touches
render-time or layout code. Run it anyway (it's seconds) to prove you
didn't stray, then do the real check in a browser:

1. `node tools/serve.mjs`
2. Throwaway Playwright script per CLAUDE.md conventions
   (`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`,
   run from repo root, delete `.scratch-*` when done).
3. Screenshot at minimum: **390×844** (iPhone-class), **430×932** (large
   phone), **820×1180** (iPad portrait), **1180×820** (iPad landscape).
   Compare before/after — the point of this work is visual, so a diff you
   can look at is the deliverable.
4. Actually drive a level end-to-end at each size (drag a piece, open an
   overlay, close it) — a layout change that looks right but breaks
   dragging is the likely failure mode here.
5. Pinch-zoom and drag-pan on a real touch device if one is available.
   Playwright can't faithfully reproduce iOS Safari's gesture handling, so
   **item 3 cannot be fully verified headlessly** — say so plainly in the
   handoff rather than claiming it's confirmed.

## Scope discipline

- Don't touch `js/solver.js`, `js/generate.js`, any `*.data.js`,
  `js/economy.js`, `js/ads.js`, `js/iap.js`.
- `--cell` is the board's only scale input. If you find yourself editing
  piece-positioning code in `buildPieces()`, stop — you're solving it in
  the wrong place.
- Keep phone layout as the default and let tablet/landscape be the
  media-queried variant, not the other way round.
- Comment *why* for any magic number you add or change (the existing
  `560` / `- 320` / `240` constants are undocumented, which is how this
  became a puzzle to unpick — don't repeat that).
