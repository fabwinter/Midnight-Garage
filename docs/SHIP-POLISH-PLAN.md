# Ship-polish plan (pre-launch)

Audience: the implementing agent. Work top-down — P0 items are ship blockers
with known bugs; P1 items are gameplay-coherence fixes that need one design
decision each (a recommended default is given, use it unless the owner says
otherwise); P2 is polish; P3 is the native/store checklist that already exists
in [PLAN-STATUS.md](PLAN-STATUS.md). Verify every item in a real headless
browser (see `tools/serve.mjs`, note it now supports Range requests), not just
by reading code — that discipline has caught real bugs in this codebase twice
(the `[hidden]` vs `display:flex` override, the media Range-request reset).

Current state in one paragraph: 200 verified campaign levels across 4 chapters,
daily puzzle, collection/garage, Pro gating, i18n (10 langs), analytics.
Phase H2 "The Alarm" is now a hard fail state (busted overlay, per-attempt
music, countdown chip, Par hidden during alarm). Phase H3 "The Rig" (hitches)
is now RESOLVED and shipped — see P0-2.

---

## P0 — Ship blockers (bugs, no design input needed)

### P0-1. Levels 201–210 crash the chapter system
`js/levels.data.js` now has 210 levels but `CHAPTERS` has 4 entries of
`CHAPTER_SIZE` 50. Reaching any level index ≥ 200 makes
`chapterOf(cur)` = 4, and `CHAPTERS[4].accent` / `.name` throw
(`applyChapterAccent`, `updateHud` in `js/game.js`). The level-select grid and
`nextPlayableIndex` can route players there after finishing chapter 4.

**Fix:** remove levels 201–210 (indices 200–209) from `js/levels.data.js`.
They are H3 hitch/gate test scaffolding with hand-guessed pars (never
solver-verified) and must not ship as playable content. Keep them in a new
`js/levels.dev.js` (not imported by the game) if you want to preserve them for
H3 work. Note levels 201–202 are gate tests added in H1 with the same problem.
**Acceptance:** `LEVELS.length === 200`; win level 200 in a browser → no crash,
win sheet shows "Level Select" (no next level); `node tools/verify-levels.mjs`
passes.

### P0-2. Hitch (H3) mechanics are incoherent — strip from ship path
**RESOLVED (2026-07).** All three holes closed in `js/solver.js` /
`js/game.js`; 8 verified hitch puzzles now ship in Neon District (levels
51–100). Kept the original problem writeup below for context on what the fix
had to address.

Three independent holes, all in shipping code:
- **Solver disagrees with gameplay.** `legalMoves` in `js/solver.js` treats a
  trailer as a permanently immovable piece; the game (`js/game.js` drag +
  keyboard handlers) moves the trailer along with its tow. Par, hints
  (`firstOptimalMove`), and the stuck-detector all reason about a different
  game than the player is playing on any level with `h`.
  → Fixed: `legalMoves` now takes a `coupled` flag array (one per hitch) as
  part of the BFS state and emits a compound `{i,o,i2,o2}` move for a coupled
  tow — both legs validated together — plus a `{decouple}` move that flips a
  one-way coupled→decoupled bit, costing one move exactly like
  `decoupleTow()` does in the UI. `solve`/`analyzeShape`/`rate` all carry the
  extended state through; `firstOptimalMove` returns either a drag target or
  `{decouple: towIdx}` for the hint system.
- **No collision check on trailer movement.** The drag/keyboard handlers do
  `trailer.c += offset` without checking occupancy — the trailer can be pushed
  through/on top of other pieces or off-board.
  → Fixed: `rangeFor()` in `js/game.js` now computes a coupled tow's
  draggable range as the intersection of the tow's own clearance and the
  trailer's own clearance (against a grid excluding both), so a drag can never
  exceed what `legalMoves` considers legal.
- **Decoupling (double-tap, costs 1 move) exists only in the UI**, not in the
  solver state, and double-tap also fires on what players will experience as a
  quick re-grab.
  → Decoupling is now real solver state (see above). The double-tap-vs-quick-
  regrab timing risk is unchanged (still a 300ms window) — not revisited in
  this pass since it's a UX-gesture concern independent of the correctness
  holes this item was about; worth a look if playtesting flags accidental
  decouples.

Two smaller bugs found while building the hitch level generator and fixed
alongside: `updatePieceAria()` didn't check decoupled state (screen readers
kept announcing a freed trailer as "moves only with its tow vehicle"), and
the hitch connector line froze in place instead of disappearing on decouple
(`renderPositions()` skipped decoupled hitches' DOM element entirely instead
of clearing it).

**Acceptance:** `node tools/verify-levels.mjs` passes (now also checks hitch
tow/trailer indices are in range, don't involve the hero, and share
orientation); a hand-replayed solver path through real browser drags/double-
taps reaches the win screen with moves === par on a hitch level.

### P0-3. Undo refunds the alarm budget
`undo()` in `js/game.js` does `moves = Math.max(0, moves - 1)`. With alarm on,
a player can hover at budget−1 forever by undoing — the fail state is
trivially cheatable, and undoing after the first move also un-counts the move
that triggered the alarm flash.

**Fix (recommended):** in alarm mode, undo restores the *board* but not the
*move count* — i.e. skip the decrement when `save.settings.alarm` is true.
This keeps undo useful for fixing a mis-drag while keeping the budget honest,
and it matches the heist fiction (the alarm doesn't rewind).
**Acceptance (headless):** alarm on → make 2 moves, undo once → board reverts,
Alarm chip still shows budget−2; make moves up to budget then undo repeatedly →
still busts on the next move.

### P0-4. `[hidden]` is overridden by layout classes — fix globally
Root cause found during the alarm-chip work: any element whose class sets
`display` (`.hud .chip`, `.peek`, `.clean-getaway`, `.badge`…) ignores the
`hidden` attribute because author CSS beats the UA default. `#peek` and
`#cleanGetaway` only work today by luck of ordering.

**Fix:** add `[hidden]{display:none !important}` near the top of
`css/game.css`, and delete the now-redundant `.hud .chip[hidden]` and
`.btn .badge[hidden]` special cases.
**Acceptance (headless):** for each of `#peek`, `#cleanGetaway`,
`#hudAlarmRow`, `#hintBadge`: set `.hidden = true` → computed display is
`none`; toggling back restores the class display.

### P0-5. Start-screen copy is hardcoded English and says "It's 2024"
The `#startOverlay` narrative in `index.html` is inline English (breaks the
10-language i18n promise from plan 1.4) and opens with "It's 2024" — the game
ships in 2026, and the date adds nothing.

**Fix:** add `start.subtitle`, `start.p1`, `start.p2`, `start.p3`,
`start.play`, `start.note` keys to all 10 locales in `js/i18n.js` (drop the
year entirely — e.g. "The syndicate's collection is locked in a midnight
garage lot. You've got one shot."); wire them in `applyStrings()`. Also fix
the note copy — "Tap to dismiss this intro in future plays." is confusing;
it should say the intro won't show again (it's `introSeen`-gated).
**Acceptance:** boot with `localStorage` cleared and each locale forced →
start screen fully localized; second boot → no start screen.

### P0-6. Bundle the Google Fonts locally
`index.html` loads Chakra Petch + Inter from `fonts.googleapis.com`. Offline /
flaky-network / native-shell players get system-font fallback (brand hit), and
every session leaks an IP to Google (App Store privacy-label noise).

**Fix:** download the used weights (Chakra Petch 500/600/700, Inter
400/500/600/700, woff2, latin subset), put them in `assets/fonts/`, replace
the `<link>`s with `@font-face` rules (`font-display: swap`) in `css/game.css`.
**Acceptance (headless, offline):** block all external requests → headers and
HUD still render in Chakra Petch (assert via
`document.fonts.check('600 16px "Chakra Petch"')`).

---

## P1 — Alarm-mode coherence (one design decision each; defaults given)

### P1-1. Budget = par is brutally unforgiving — add slack
Busted now fires on the first move past par, mid-board. Par is the *optimal*
solve, so one non-optimal move = instant fail. That's a fun ceiling for
experts and a wall for everyone else, and it makes hints mandatory.

**Recommended:** `alarmBudgetFor(par)` returns `par + Math.max(2,
Math.ceil(par * 0.25))` — roughly the 2-star threshold. Keep the "Clean
getaway ⚡" badge for `moves <= par` exactly, which also fixes P1-2. Tune later
from the `alarm_busted` analytics event that already exists.

### P1-2. "Clean getaway" is now always-on in alarm wins
With hard-fail at budget = par, every alarm win necessarily has
`moves <= budget`, so `isCleanGetaway` is always true — the badge is noise.
**Fix:** falls out of P1-1 — badge means `moves <= par` (a perfect run), while
survival means `moves <= budget`. If P1-1 is rejected, remove the badge in
alarm mode instead.

### P1-3. Decide alarm × daily-puzzle semantics
Busted currently applies to daily attempts too. A busted daily is retryable
(good), but decide and make it explicit: alarm mode on the daily is allowed
and simply means the attempt ends early — streak/freeze logic untouched
(`recordDailyWin` only runs on wins; `level_abandon`/busted don't touch it).
**Recommended:** keep as-is but add the daily date to the `alarm_busted`
event payload (it already sends `mode`), and confirm in a headless run that
busting a daily then retrying and winning still records the streak.

### P1-4. Decide alarm × skip/hint interactions
- Skip (appears after 8 min stuck) still works in alarm mode and grants 1★ —
  fine, keep: it's the pressure-release valve.
- Hints: fine to keep, but a hint consumed on an alarm attempt that then busts
  feels bad. **Recommended:** no code change; log `hintsUsed` in the
  `alarm_busted` event so the funnel shows whether this hurts.

### P1-5. Busted sheet should offer "Turn alarm off", not just Retry
One-button dead ends frustrate. Add a secondary quiet button on
`#bustedOverlay`: "Play without alarm" → sets `save.settings.alarm = false`,
`setAlarmMode(false)`, persists, restarts the level. i18n it (10 locales).
**Acceptance:** bust → tap it → level restarts with Par chip visible, Alarm
chip gone, no music.

---

## P2 — Polish

### P2-1. Alarm audio/visual details
- Preload the track: `alarmAudio.preload = 'auto'` on first construction in
  `js/audio.js` so the loop doesn't stutter in on first move (3.3MB file).
- Optionally re-encode the mp3 to ~96kbps mono (it's ambience under SFX);
  keep the original in `docs/` or git history. Confirm the license/attribution
  for "Midnight in the Vault" is recorded in `README` before store submission.
- The busted police-lights bar (`.police-lights`) strobes at ~3.3Hz — keep it
  under the 3-flashes-per-second photosensitivity guideline: slow
  `policeStrobe` to `.7s` per cycle. The reduced-motion fallback already
  exists; keep it.
- The first-move flash + siren fires even when the first move is the winning
  move (1-move boards, e.g. tutorial). Harmless, but suppress the flash if
  `winSequence` runs in the same tick.

### P2-2. Accessibility pass on the new surfaces
- `#bustedOverlay`: add `role="alertdialog"` and `aria-labelledby`/`aria-describedby`
  pointing at `#bustedTitle`/`#bustedSub`; move focus to `#bustedRetryBtn` on
  open, back to the board on retry.
- Announce alarm state in `#srLive`: on first move "Alarm triggered — {n}
  moves before the police arrive", each subsequent move "{n} moves left", and
  on busted the busted title. i18n these.
- Alarm HUD chip: add `aria-label` mirroring the countdown.
- Start overlay: focus `#startPlayBtn` on open.

### P2-3. Win-sheet Par stat in alarm mode
Par is hidden in the HUD during alarm (82fd02b) but the win sheet still shows
Moves/Par/Best. That's fine (post-attempt context) — leave it, but if P1-1
lands, consider showing "Budget {n}" instead of Par on alarm wins for
consistency. Low priority; skip if time-boxed.

### P2-4. Kill dead/duplicated wiring
- `alarmChk` listener in `wireSettings()` and `applySettings()` both call
  `setAlarmMode`; fine, but the listener also calls `startAlarmTrack()` when
  toggled mid-level while `!solvedAnim` — verify the win/busted overlays set
  `solvedAnim` before the settings sheet is reachable again (they do; keep a
  regression test).
- Trailers keep `tabindex="0"` / `role="button"` while inert (H3 leftovers) —
  harmless post-P0-2 since no shipping level has hitches; no action.

### P2-5. Sweep PLAN-STATUS and remove the stale "H2 = reward-tier" language
`docs/PLAN-STATUS.md` should describe alarm as: optional hard mode, per-move
budget with slack (post-P1-1), busted fail state, per-attempt music. One
paragraph, current commit hashes.

---

## P3 — Native/store checklist (pre-existing, unchanged scope)

These are the 🔶 items from PLAN-STATUS; none are new work from this plan:
1. `npx cap add ios`, launch screen, `AVAudioSession .ambient` (respect the
   silent switch — this is also why web SFX die under iOS Silent Mode today).
2. Capacitor Haptics plugin — web `navigator.vibrate` does not exist on iOS
   Safari; haptics only work in the native shell.
3. StoreKit purchase behind `buyBtn` (web keeps sandbox unlock).
4. Game Center leaderboards/achievements after `cap add ios`.
5. Supabase creds in `js/config.js` to activate analytics; verify the
   `alarm_busted` and `alarm_clean_getaway` events land in `supabase/schema.sql`
   tables (add columns/eventnames if the schema enumerates them).
6. Store assets: preview video, ASO copy, privacy labels (fonts now local per
   P0-6 → no third-party network disclosure needed beyond Supabase).
7. Trademark/domain/handle checks for "Midnight Garage".

---

## QA gate before tagging a release build

Run all of these headless (Playwright + `/opt/pw-browsers/chromium` pattern
used throughout this repo's history), plus one manual pass on a real iPad:

1. `node --check` every file in `js/`; `node tools/verify-levels.mjs` — all
   200 pars still solver-exact.
2. Fresh profile boot → start screen → dismiss → never returns; all 10 locales
   spot-checked on start screen, settings, busted sheet.
3. Non-alarm playthrough: win L1–L3 with coach marks, hint appears at L4,
   undo at L6, auto-advance, skip valve after 8 min (mock the clock).
4. Alarm playthrough: enable → Par chip hides, Alarm chip shows budget;
   first move → flash + siren; bust → police lights + freeze + Retry and
   "Play without alarm" both work; win at exactly par → Clean getaway badge;
   win at par+1 (post P1-1) → win, no badge.
5. Audio lifecycle: track starts on attempt start/reset/retry, stops on win
   and busted, silent in menus, slider alone never starts it (regression for
   the `alarmActive` guard in `js/audio.js`).
6. Chapter boundaries: win level 50/100/150/200 → correct unlock/paywall/no
   crash at 200 (P0-1 regression).
7. Daily: win → streak +1; bust a daily (alarm on) → retry → win → streak
   still +1 exactly once; share card text unchanged.
8. Offline: all assets load with network blocked except first visit (fonts
   local per P0-6, mp3 served with Range support — Vercel handles this in
   prod, `tools/serve.mjs` handles it in dev).
9. Reduced-motion: busted lights static gradient, no alarm flash, no
   auto-advance bar animation.
10. `git grep -n "2024"` returns nothing user-facing.
