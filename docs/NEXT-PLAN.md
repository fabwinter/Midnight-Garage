# What's next (post-Fogleman import, 2026-07)

Sequencing for the next stretch of work. Written right after Gridlock's
ceiling moved to par 60 (`6d8a72c`) via 20 boards imported from Michael
Fogleman's exhaustive database — which left **405 more verified boards
(par 41–60) on the table**, regenerable any time from the checked-in
source via:

    node tools/import-fogleman.mjs tools/data/fogleman-boards.txt \
      --min-par 41 --out .genwork/fogleman-pool.json

That surplus reshapes the priorities: the two remaining content-hungry
features ([HEIST-PLAN.md](HEIST-PLAN.md) H4 Bounties, and the v2.0
"Featured Boards" idea) no longer need any generator work — the content
already exists, verified.

Current state, verified against the code (not just the docs): heist phases
H0–H3 all shipped; ship-polish P0s closed (copy localized, fonts bundled,
hitch coherent); campaign is 200 levels, par 6–60, all `par == optimal`.

---

## N1 — H4 Bounties: "Tonight's Mark" ✅ shipped

The last heist phase — the retention beat the collection meta was waiting
on. Per [HEIST-PLAN.md §6](HEIST-PLAN.md):

- **Boards:** `tools/gen-bounty-pool.mjs` curates 61 boards from the
  Fogleman surplus (30 common par 41–45, 20 uncommon 46–50, 10 rare
  51–55, 1 legendary — the only par-58+ board left unused), deterministic-
  shuffled and checked into `js/bounty-rotation.data.js`. `js/bounty.js`
  cycles it by date (`BOUNTY_EPOCH` 2026-07-19) — same pattern as
  `dailyLevel`, no backend, no generator work.
- **Win conditions:** rotate `par` / `nohints` / `alarm` every 3rd night —
  all reuse per-attempt state the game already tracks (`moves`,
  `hintsUsed`, `save.settings.mode`). A bounty never fails to complete
  (covenant intact); the condition only gates the reward car.
- **Rewards:** 4 new cars in `js/collection.js` (Small Fish / The Fence's
  Favorite / High-Value Mark / The Big Score), one per par-bucket tier,
  unlocking off `save.bounties.done[date].met && .tier`. Skill-gated,
  cosmetic-only — a single lucky legendary-tier clear is enough, no grind
  counter.
- **Surfaces:** header icon + dot (`#bountyBtn`), a "Tonight's Mark"
  overlay (board preview, tier chip, par, condition, status), a
  `bountyResult` banner on the win sheet, `bounty_complete` analytics
  event, full i18n ×10 (18 new keys/locale). Admin command `bounty
  [date]` for testing.
- **Verify:** `tools/verify-levels.mjs` now re-solves all 61 rotation
  boards and checks the next 14 nights' picks are deterministic.

Verified end-to-end via headless Playwright: opened the overlay, read
tier/par/condition, played today's (rare, par 51) mark by driving the
solver's own optimal path through real keyboard moves, hit the win sheet
with "Contract fulfilled ⚡", and watched the High-Value Mark car reveal
fire and persist. Zero console errors. Full 200-level + 61-bounty verify
passes.

New collectible car art (N3c below) still applies to *future* bounty
tiers/rarity flavor — the 4 shipped here are palette-only, same as the
existing collection, not the "6–10 new hero art" push N3c describes.

## N2 — The Impound Lot (Featured Boards, pulled forward from v2.0) ✅ shipped

A post-campaign, Pro-gated board list for players who finish level 200.

- **Boards:** `tools/gen-impound-pool.mjs` curates 100 boards (par 41–50 —
  the remaining pool's rare/legendary tier was already spent on Gridlock
  and Bounties) from whatever's left of the Fogleman surplus, sorted into
  an ascending difficulty curve and checked into `js/impound-lot.data.js`.
  236 boards still sit unused in `.genwork/fogleman-pool.json` for a
  future batch or for sandbox promotions.
- **Not a fifth chapter:** `CHAPTERS`/`CHAPTER_SIZE`/the 4×50 shape are
  untouched. The Impound Lot is a 5th *tab* (`IMPOUND_TAB` sentinel) added
  to the existing chapter-tabs UI in `buildChapterTabs`/`buildLevelList` —
  genuinely reuses the level-list UI rather than duplicating it, styled
  with a dashed border and its own gold accent (`IMPOUND_ACCENT`).
- **Gating:** `impoundUnlocked() = save.pro && save.unlocked >= 200`. Two
  distinct locked states with different feedback: no Pro → the existing
  paywall; Pro but campaign unfinished → a toast telling you to finish it.
- **Progression:** unlike the bounty (one-shot, date-gated), the whole
  list is available at once and plays like a second campaign — its own
  `save.impound.{stars,best}` (keyed by board `key`, not array index, so
  future re-curation can't scramble saved progress), peek-preview,
  auto-advance, and `win.impound` title, all mirroring the campaign flow
  via `loadImpoundLevel`/`advanceImpound`/`nextImpoundIndex`.
- **Verify:** `tools/verify-levels.mjs` re-solves all 100 boards and
  additionally checks each entry's stored `key` still matches what the
  solver computes for it (a save-keying correctness guard, not just
  par==optimal) and that no two entries share a key.

Verified end-to-end via headless Playwright across all three gate states
(no Pro / Pro-but-unfinished / Pro-and-finished), then browsed the
unlocked list, solved job #1 by driving the solver's own optimal path
through real keyboard input, advanced through a stack of milestone car
reveals into job #2, and confirmed job #1 persisted as starred on
reopening the list. Zero console errors. Full verify passes.

Also the natural landing place for levels promoted from the sandbox via
`tools/promote-sandbox-levels.mjs` — that tool doesn't target the Impound
Lot yet (still campaign-chapter-only); wiring an `--impound` destination
for boards whose par doesn't fit any chapter band is a small follow-up,
not done here.

## N3 — Presentation pass (art, audio, animation)

Audit findings (2026-07) that shape this: `assets/audio` is **49MB of the
app's 61MB** because two menu tracks ship as uncompressed WAV
(`velvet-glove.wav` 30MB, `clean-getaway.wav` 16MB); `js/audio.js` points
Pursuit mode at a placeholder `assets/audio/pursuit.mp3` that was never
added, so Pursuit has no music; all SFX are synthesized WebAudio (zero
download weight — a strength to keep, not replace).

### N3a — Asset hygiene ✅ shipped

- ✅ **Menu tracks re-encoded**: user-supplied MP3s replaced the WAVs
  (47MB → 5.8MB; assets total 61MB → 12MB).
- ✅ **Pursuit track**: `PURSUIT_TRACK` pointed at the heist track instead
  of a nonexistent file (Pursuit was silent). Swap to its own file when
  one lands — N3b's stems are the real fix.
- ✅ **SFX gap-fill**: four new synth kinds — `hint` (was reusing `ui`),
  `decouple` (was reusing `snap`, the every-move sound, so unhitching was
  audibly invisible), `fanfare` (car reveal was replaying `win` seconds
  after the win sheet), `gate` (interlock state flip). Gates also now dim
  while passable (`.gate-open`), wired through commit/undo/load — no
  campaign levels carry gates yet, so this is forward wiring for sandbox
  and future gate content.

### N3b — Pursuit music pool ✅ shipped (adaptive stems still open)

✅ **Pursuit track pool**: 4 user-supplied tracks (`pursuit-1..4.mp3`,
~14.7MB) replace the old Heist-track reuse. `js/audio.js`'s
`TRACK_POOLS` is keyed by mode with a `pickTrack()` that never repeats
the immediately-previous pick — picked fresh every attempt
(`startAttemptTrack`), stable across menu-tab ducking within one attempt
(`resumeAttemptTrack` reuses `curAttemptTrack`). Heist's pool still has
just its one existing track; dropping more Heist/Relaxed tracks in
later is a one-line addition to `TRACK_POOLS`, nothing else changes.
More tracks incoming from the user for other modes.

✅ **Playback reliability pass** (user-reported: Pursuit silent, Heist
inconsistent): both traced to real autoplay-policy edge cases, not one-off
bugs. `playWithRetry()` now retries a rejected `play()` on the next
pointerdown/keydown instead of failing silently forever (a `.catch(() =>
{})` swallowed every such failure before); `warmPool()` preloads a mode's
whole pool on switch so Pursuit's 4-file shuffle doesn't lose short,
timer-driven attempts to still-buffering audio the way Heist's single
long-cached track never did. Both fixes are general — they help any
future track added to either pool, not just this batch.

✅ **Heist starts at level load, not first move** (per-move budget, no
reason to wait): `startBoard()` now calls `startAttemptTrack('heist')`
directly; Pursuit is unchanged (still tied to first move, same moment as
its clock — "the clock starts when you start moving").

✅ **Gapless opening-theme handoff**: the `loadX()` functions no longer
call `stopMenuMusic()` on navigation — the opening theme keeps playing
until whatever comes next is *confirmed* audible (`playWithRetry`'s
`onPlaying` callback), then `crossfadeOutOtherTracks()` fades it out.
Previously the theme was cut immediately on load, before the replacement
had necessarily started, which could leave a silent stretch.

Verified headless across 4 scenarios: Heist audible before any move is
made; Pursuit audible after the first move; switching Relaxed→Heist
mid-session (via Settings, itself a duck/resume path) hands off
correctly on close; and a 720ms volume trace during the Start-tap
handoff never shows both the opening theme and Heist silent at the same
instant.

**Follow-up round** (still on N3b, same session's next report — "opening
theme not playing on startup", "bring back mode choice every time"):

- ✅ **Real bug in the above**: `startMenuMusic()`'s guard checked the
  `attemptActive` *flag* (set the instant an attempt is requested) rather
  than whether anything was actually audible. Since Heist's level-load
  trigger sets that flag immediately — often before the player has
  interacted at all — the guard silently refused to ever start the
  opening theme whenever Heist was the current mode. Now checks
  `attemptAudio && !attemptAudio.paused` (real playback state) instead.
- ✅ **Mode picker now shows on every launch**, not just the first —
  reverses N3e's original "skip after first launch" design per explicit
  request. `save.introSeen` removed (no longer gates anything);
  `startPlayBtn` always opens the picker.
- ✅ **Second-order bug this surfaced**: with the picker always showing,
  Heist's level-load trigger (fired once during `boot()`, before Start
  is even tapped) registered its autoplay-retry on the *first tap of the
  session* — which is the Start button itself. That let Heist hijack the
  audio the instant Start was tapped, cutting the opening theme short
  before the player ever reached the picker to choose a mode. Fixed with
  a `pastIntro` session flag: Heist's `startBoard()` trigger now only
  fires once the picker has actually been confirmed (`introPlayBtn`),
  which is the real "level start" moment now that the picker is always
  in the way first.

Verified headless with a realistic flow: tap Start, dwell 1.5s on the
picker (opening theme audible >0.1 volume, Heist confirmed *not* yet
started), confirm Heist, then it starts and hands off cleanly — and the
picker still appears after a full page reload.

✅ **Pursuit's music moved to level load too**, by request, same as
Heist — only its countdown itself still waits for the first move
(`startPursuitTimer()` stays in `commitMove`, decoupled from the music
trigger which now lives entirely in `startBoard()` alongside Heist's,
both gated on `pastIntro`). Verified headless: confirming Pursuit on the
mode picker starts its music immediately (0 moves made) while the clock
display stays untouched until the first move, then ticks down normally;
mid-session switch to Pursuit via Settings starts it immediately too.

**Follow-up round** (still on N3b, next report — "make sure music on
all modes start immediately on retry level"): Reset/Retry/Replay all call
the same `startBoard()`, so the level-load fixes above should already
cover them, but retrying didn't reuse the same audio element the way a
fresh level load does, and that surfaced three more gaps:

- ✅ **Pursuit's track-switch was a hard cut**: `ensureAttemptAudio()`
  used to `.pause()` the stale element the instant a retry's freshly-
  picked track differed from the last one (routine for its 4-track pool)
  — an instant, unfaded silence before the new element had buffered
  enough to be audible. Now fades the stale element out over 300ms
  instead, so the two genuinely overlap.
- ✅ **Heist's retry fought itself**: `startBoard()` called
  `stopAttemptTrack()` unconditionally, then `startAttemptTrack()`
  right after — a fade-out and fade-in racing on the same reused
  element, a measurable dip on every retry. `stopAttemptTrack()` now
  only runs in the branch that isn't immediately starting a new attempt
  track; `startAttemptTrack()` → `ensureAttemptAudio()` already
  crossfades away whatever was playing on its own.
- ✅ **`fadeIn()` always ramped from 0**, regardless of the element's
  actual current volume — harmless for a fresh element but an audible
  dip-then-recover on Heist's retry, which reuses the same single-track
  element rather than creating a new one. Now captures the element's
  real starting volume and interpolates from there, matching `fadeOut`'s
  existing pattern.
- ✅ **Relaxed's opening theme never came back after Reset**: its only
  level music stops for good on first move via a `fadeOut()`; Retry then
  called `startMenuMusic()`, but that function's guard was `if
  (menuAudio.paused)`, which is false for the whole 300ms the old
  fade-out is still running — so the call did nothing and the stale
  fade-out completed anyway, leaving true silence. `startBoard()` now
  also calls `startMenuMusic()` on Relaxed's retry path (previously it
  only played once, on first-ever boot), and the guard now also treats
  an in-flight fade (`menuAudio._fadeInterval`) as something to reverse
  into a fade-in, only resetting `currentTime` on a genuine stop so
  reversing a fade doesn't jump playback position.

Verified headless across all three modes on Reset: 60ms-interval volume
traces show continuous, non-zero playback with no gap or silent sample
in any of the six samples taken. `bustedRetryBtn` and `replayBtn` share
the identical `startBoard()` call with no other audio-relevant
differences from `resetBtn`, so the same fix covers all three retry
paths.

Still open — **adaptive intensity stems**: two or three stems per mode
that layer in as the move budget shrinks, crossfading on top of the
per-attempt lifecycle that already exists. Bigger felt upgrade than more
static tracks; the pool above is the simpler win that shipped first.

### N3c — Collection car art *(feeds N1)*

6–10 new collectible hero cars with rarity tiers for bounty rewards.
Traffic art stays as-is (see N1). Wall-tile visual variety (dumpster,
jersey barrier, cones alongside the hazard-stripe tile) rides along as
cheap flavor whenever this batch happens.

### N3d — Chapter environments *(one chapter first, then judge)*

The chapter names are ready-made locations (Night Shift / Neon District /
Harbor Freight / Gridlock) and today's board is CSS asphalt gradients with
an accent swap, so real environments are a big visible upgrade. Rules:

- **Readability is king.** Environments live *around* the board (margins,
  skyline, dock cranes) — the play surface stays dark and quiet, at most a
  heavily-darkened texture. Must not fight piece recognition or the
  colorblind roof decals; contrast-check before shipping.
- **Ship Harbor Freight first** (strongest identity), evaluate, then roll
  the pattern to the other three. v1.5's planned rain environment slots in
  here.
- **Car-matched sets:** HEIST-PLAN §3 already sanctions matched board
  palettes per hero skin — a rare car unlocking its matching environment
  is a natural *fixed-contents* cosmetic pack (no PEGI trigger).

### N3e — Reward-loop animations *(solution replay ✅ shipped)*

Spend animation effort on the reward loop, not ambience: garage reveal
moment, hero drive-out on win, headlight sweep at level start, and
solution replay. All respecting the existing reduced-motion handling.

✅ **Solution replay** shipped: a dashed "Watch the optimal solution"
button on the win sheet resets the board and plays the solver's own
optimal path move-by-move (snap/decouple SFX, live move counter, gate
dim updates, hero drive-out at the end), then hands the win sheet back.
Win-sheet-only on purpose — the level is already cleared, so it teaches
par-matching for the 3-star retry without leaking solutions to unsolved
levels or undercutting the hint-token economy. Any tap skips; nav is
locked during playback; loading any level cancels it. Hidden in sandbox.
`solution_replay` analytics event; localized ×10.

Onboarding rework (user-requested, adjacent to this pass) also shipped:
the launch flash is gone (start overlay is statically `show`n before JS
boots) and How to Play now carries the first-time mode picker — three
icon cards (Relaxed/Heist/Pursuit) that set the same persisted mode as
Settings; later launches skip straight to the last-played mode.

## N4 — Small polish with no dependencies

- **P2 leftovers audit** from [SHIP-POLISH-PLAN.md](SHIP-POLISH-PLAN.md):
  alarm audio/visual details, accessibility pass on newer surfaces
  (garage, sandbox, bounties once N1 lands), dead-wiring sweep.

## N5 — Blocked here, needs your side

Can't be done from this cloud environment; unchanged from
[PLAN-STATUS.md](PLAN-STATUS.md)'s 🔶 items:

- `npx cap add ios`, launch screen, `AVAudioSession .ambient` (Xcode).
- StoreKit purchase wiring for Pro Garage; Game Center leaderboards.
- Store listing: preview video, ASO copy, trademark/domain checks.
- Supabase creds in `js/config.js` to turn analytics on — which then
  unblocks the v1.1 data work (re-fit difficulty weights from the live
  funnel, paywall placement).

---

**N3a, N1, and N2 are all shipped.** Recommended order for what's left:
**N3b/c/d/e → N4**, with N5 whenever you're ready on the native/business
side. Nothing left is content-blocked — the Fogleman surplus is spent
down to 236 boards in reserve, and everything remaining is presentation
(N3) or polish (N4) rather than new systems.
