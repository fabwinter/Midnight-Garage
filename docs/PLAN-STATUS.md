# Plan → implementation status

Tracking against [SEQUENCING-PLAN.md](SEQUENCING-PLAN.md). ✅ built here,
🔶 scaffolded (native/business step remains), ⬜ deferred by the plan itself.

**Direction (2026-07):** post-launch work now follows
[HEIST-PLAN.md](HEIST-PLAN.md) — the collection-heist meta on the **premium
(Variant A)** business model, which supersedes/sharpens the later phases of
[AAA-PLAN.md](AAA-PLAN.md) with a single frame and a locked, ad-clean,
no-RNG monetization model. Phase H0 (The Garage) ✅ shipped `b6f001c`.
Phase H1 (Security Gates) ✅ shipped `528bfd0`. Phase H2 (The Alarm) ✅ shipped — optional hard mode with per-move budget
(par + 25% slack), busted fail state (no progress saved), per-attempt music
(starts on first move, stops on win/busted), first-move flash, and full i18n
(10 langs).
Phase H3 (The Rig) ✅ shipped (2026-07) — the three P0-2 holes are closed:
`js/solver.js` now models a coupled tow+trailer as a real compound move and
decoupling as a real one-way state transition (both counted in par/hints,
not just the UI); `js/game.js`'s drag/keyboard range check validates the
trailer's own clearance before allowing a coupled tow to move, so a drag can
never push a trailer through another piece. A dedicated generator
(`js/generate.js: tryGenerateHitch`, run via `tools/gen-hitch-pool.mjs` +
`tools/add-hitch-levels.mjs`) places a deliberate tow/trailer pair — trailer
straddling the exit row like a normal blocker, but inert until towed or
decoupled — and rejects any candidate whose optimal solution doesn't
actually exercise the hitch. 8 verified hitch puzzles ship in Neon District
(levels 51–100); see [SHIP-POLISH-PLAN.md P0-2](SHIP-POLISH-PLAN.md#p0-2-hitch-h3-mechanics-are-incoherent--strip-from-ship-path)
for the original spec this closes.

## Phase 0 — Foundation

| Item | Status | Notes |
|---|---|---|
| 0.1 Rebrand + identity | ✅ / 🔶 | Midnight Garage everywhere: title, header, `mg_*` save keys, app icon (`assets/icon.svg`, red car + amber gate glow). 🔶 Trademark/domain/handle checks are a business task — do before store submission. |
| 0.2 Solver → shared JS module + difficulty model v1 | ✅ | `js/solver.js`: BFS with path counting; signals = optimal moves, branching along solution, counterintuitive moves (hero distance-to-freedom increases), solution uniqueness; composite score. Weights are v1 — re-fit in v1.1 from funnel data. |
| 0.3 200 levels at launch | ✅ | `tools/generate-levels.mjs`: sample → hill-climb harden → per-chapter par bands ordered by model score → re-verify (par == optimal). 4 chapters × 50, palette-swap theming via chapter accent color. |
| 0.4 Capacitor shell + native feel | 🔶 | `capacitor.config.json`, `package.json` deps, safe-area CSS, theme color. Haptics bridge done (`js/haptics.js`): tick per cell, thud on collision, heavy for trucks, success pattern. 🔶 `npx cap add ios`, launch screen asset, `AVAudioSession .ambient` — needs Xcode. |
| 0.5 Game feel pass | ✅ | Weight: per-length easing curves (trucks slower/heavier). Flick with inertia → slides to wall. Dust puff on collision stop (reuses win-burst particle system). |
| 0.6 Onboarding | ✅ | Levels 1–3: animated finger prompt on the solver's optimal piece, one-line coach marks. Hint hidden until level 4, undo until level 6. |
| 0.7 Session flow + forgiveness | ✅ | Auto-advance toggle (default on, respects reduced-motion), next-level peek on win sheet, 3-star streak counter in HUD, quiet Skip (1★) after 8 min stuck. No lives/timers/fail states. |
| 0.8 Accessibility + settings | ✅ | Colorblind mode = roof decals per paint color. SFX/ambience sliders, haptics toggle. Reduced-motion respected. VoiceOver basics: piece labels with position, live-region move announcements, full keyboard play. |
| 0.9 Analytics | ✅ | `js/analytics.js` + `supabase/schema.sql`. Per-level funnel: start/win/abandon/skip, undo/hint counts, time; session, daily, IAP, share events. Privacy-clean; local-only until Supabase creds are set in `js/config.js`. |

## Phase 1 — Launch v1.0

| Item | Status | Notes |
|---|---|---|
| 1.1 Daily Puzzle | ✅ | Date-seeded, identical worldwide (`dailyLevel` in `js/generate.js`). Streak + freeze tokens (1 per 7 dailies, cap 3), calendar with back-fill (doesn't extend streak), Wordle-style emoji share card. |
| 1.2 Game Center + cloud save | 🔶 | Storage goes through Capacitor Preferences (iCloud-KV-backable). Game Center leaderboards/achievements need the native plugin — hook in after `cap add ios`. |
| 1.3 Monetization | ✅ / 🔶 | Pro Garage gate live: chapters 3–4 locked, 3 hint tokens/day free, unlimited for Pro, paywall at end of chapter 2, `iap_view`/`iap_purchase` funnel events. 🔶 StoreKit purchase (buy button is the hook point; web sandbox-unlocks). Rewarded-video hint refill deferred until an ad SDK decision. |
| 1.4 Store presence | ✅ / 🔶 | UI strings localized to 10 languages (`js/i18n.js`). Single streak-reminder notification (`js/notify.js`). 🔶 Preview video, ASO listing copy — store-side work. |

## Explicitly honored cut list

No SpriteKit rebuild (CSS transforms), no App Clips, no widgets, one
notification type max, no ads beyond the (deferred) opt-in rewarded video,
no real-time multiplayer.

## Later (per plan)

- v1.1: re-rate curve from live funnel, move paywall, solution replay, alt icons.
- v1.5: One-Way Lanes + solver extension, rain environment, garage home screen, adaptive music, ghost race.
- v2.0: Heist Mode, level editor (solver auto-rating is already shared code), Featured Boards, global stats off the 0.9 tables.
