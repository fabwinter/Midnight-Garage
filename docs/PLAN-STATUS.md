# Plan → implementation status

Tracking against [SEQUENCING-PLAN.md](SEQUENCING-PLAN.md). ✅ built here,
🔶 scaffolded (native/business step remains), ⬜ deferred by the plan itself.

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
