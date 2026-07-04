# Midnight Garage — Implementation Sequencing Plan

Solo dev, iPad-first, Claude Code as implementation environment. Web stack (HTML/CSS/JS) retained; Capacitor for native shell. Supabase for backend. Each phase ends with a shippable build. Each update is anchored to exactly one marketable feature.

**Governing principle:** ship a third of the ideas at 100% quality rather than all of them at 70%. The cut list at the bottom is as important as the phases.

---

## Phase 0 — Foundation (pre-launch, ~3–4 weeks)

Goal: turn the prototype into a store-ready core. Nothing here is marketable on its own; all of it is load-bearing.

### 0.1 Rebrand + identity lock
- Rename to **Midnight Garage** everywhere (code, title, save keys). Check trademark availability before committing (and domain/handles while at it).
- App icon: red car glyph on near-black with amber gate glow. Test at 60px.
- Do this FIRST — every screenshot, video, and save-file key downstream depends on the name.

### 0.2 Solver → shared JS module + difficulty model v1
- Port the Python generator to JS/Node so generation, verification, and rating live in one codebase (the game already has the JS BFS solver — extend it).
- Difficulty model v1 signals per level: optimal move count, branching factor along solution, count of "counterintuitive" moves (moves that increase red-car distance from exit), solution uniqueness.
- Composite score → re-rate the existing 50 and all new levels.
- **Dependency:** everything content-related (0.3, daily puzzle, editor) sits on this.

### 0.3 Content batch: 200 levels at launch
- Batch-generate and verify ~200 levels, curved by the difficulty model (not raw move count).
- Structure as 4 chapters × 50. Chapter theming deferred (palette swap only for now; full environments in 1.5).

### 0.4 Capacitor shell + native feel
- Capacitor wrapper, proper launch screen, app icons, safe-area audit.
- Haptics via `UIImpactFeedbackGenerator` bridge: light tick per cell crossed, medium thud on collision (heavy for trucks), success pattern on win.
- Native audio session config (respect silent switch, mix with user music).

### 0.5 Game feel pass
- Weight: trucks ease slower/heavier than cars (tuned easing curves per piece length).
- Flick gesture with inertia — flick a piece and it slides to its wall.
- Micro-particles: dust puff on collision stop (reuse win-burst particle system, small emission).

### 0.6 Onboarding
- Levels 1–3: animated finger-drag prompt on the correct piece, hint/undo hidden until level 4/6 respectively, one-line coach marks ("Free the red car").
- No text walls. The board teaches.

### 0.7 Session flow + forgiveness
- Auto-advance toggle; next-level peek on win screen; zero taps between won → playing.
- Consecutive 3-star streak counter (subtle, top of HUD).
- Skip valve: after ~8 min stuck on one level, quiet "Skip (1★)" offer.
- No lives, no timers, no fail states.

### 0.8 Accessibility + settings
- Colorblind mode = roof decals/patterns per vehicle (reads as art variety).
- SFX/haptics/music sliders. Reduced-motion already respected — keep it.
- VoiceOver: grid position + piece announcements, discrete move actions. (Basic pass here; polish in 1.1.)

### 0.9 Analytics instrumentation (before launch, non-negotiable)
- Per-level funnel: attempts, completion time, undo count, hint count, quit point, skip usage.
- Events: session start/end, level start/win/abandon, IAP funnel steps, daily participation.
- Supabase tables + lightweight event batching. Privacy-clean (no PII), disclosed in privacy policy.

---

## Phase 1 — Launch v1.0 (~2–3 weeks after Phase 0)

Goal: launch with the viral loop and the money loop working on day one.

### 1.1 Daily Puzzle (the marketable feature of v1.0)
- Date-seeded generation → identical worldwide board each day.
- Streak counter + streak-freeze token (earn 1 per 7 days played).
- Calendar view of past dailies, back-fillable (back-fills don't extend streak).
- **Share card:** Wordle-style emoji grid + moves vs par + streak. This is the growth engine; over-invest in making the card beautiful.

### 1.2 Game Center + cloud save
- Leaderboards: fewest moves per daily; total stars.
- Achievements: first win, 10 under-par solves, chapter completions, 7/30-day streaks.
- iCloud key-value sync for save data (replaces window.storage in the native build; keep web fallback).

### 1.3 Monetization
- **Pro Garage** one-time IAP: unlocks chapters 3–4 + all cosmetics + unlimited hints.
- Free tier: chapters 1–2 (100 levels), hint tokens regenerating daily, optional rewarded video to refill.
- No interstitials. Ever.
- Paywall position: provisional at end of chapter 2; final position tuned in 1.1 from funnel data.

### 1.4 Store presence
- Preview video: only the win moment (car escapes gate, confetti, star pop). 15 seconds.
- ASO: "car escape puzzle", "parking puzzle", "unblock" keyword family.
- Localize UI strings (~50 words) to top 10 languages.
- Notifications: single opt-in type — "protect your streak" for the daily. Nothing else.

---

## v1.1 — Tuning update (2–4 weeks post-launch)

Goal: convert launch data into retention. No new marketing beat; this is the data patch.

- Re-rate difficulty curve from real funnel data (attempts/undos/hints per level) against model v1 predictions; reorder levels where the model was wrong.
- Move paywall to the empirically correct position (typically just after the first real difficulty spike).
- **Solution replay:** "watch the optimal solve" playback after winning (full path already comes from the solver).
- VoiceOver polish pass from any early accessibility feedback.
- Alternate app icons as achievement rewards (cheap, keeps the game visible on homescreens).

---

## v1.5 — The Twist update (~6–8 weeks post-launch)

Goal: escape the clone category. Marketable feature: **One-Way Lanes**.

- One-way lane tiles woven into a new 50-level chapter — simplest twist to learn, pure logic, no timing.
- Solver extension to handle lane constraints (verify + rate as usual).
- Chapter environment #2: **rain shift** — animated droplets, wet-asphalt reflections, palette + ambient audio layer swap.
- **Garage as launch screen:** your car collection is the home screen; empty bays sell the cosmetics.
- Adaptive music v1: filter/intensity tied to how clear the exit path is (board state, not move count).
- Ghost race vs. your own best solve (builds on 1.1's replay system).

---

## v2.0 — The Community update (~4–6 months post-launch)

Goal: infinite content + the press cycle. Marketable feature: **Heist Mode + Level Editor**.

- **Heist Mode:** escape within N moves while a security sweep advances one row per turn. Separate mode, its own leaderboard. This is the press pitch.
- **Level editor:** build a board → solver verifies + auto-rates difficulty instantly → share as short code/URL.
- **Featured Boards** shelf: weekly curated community levels, auto-tagged by difficulty model. Curation is what keeps it from becoming a junk drawer.
- Global stats: "Only 4% of drivers cleared this under par" on win screens; daily-puzzle percentiles. (Supabase aggregation — the analytics tables from 0.9 already feed this.)
- Chapter environment #3 (neon Tokyo rooftop or dawn shift).

---

## Explicit cut list (not doing, and why)

| Cut | Reason |
|---|---|
| SpriteKit/Metal rebuild | CSS transforms on a 6×6 board already hit 120Hz; zero player-visible gain |
| App Clips | Near-zero real-world conversion; share card carries virality instead |
| Widgets | Nice-to-have; revisit only if daily-puzzle DAU justifies it |
| Multiple notification types | One streak notification max; premium feel dies by push spam |
| Ads beyond opt-in rewarded video | Category cult classics are ad-clean |
| Real-time multiplayer | Wrong genre; ghost race scratches the itch async |

---

## Dependency graph (critical path)

```
Rebrand ─→ everything
Solver JS port ─→ 200 levels ─→ launch content
             └─→ Daily puzzle ─→ share card
             └─→ difficulty model ─→ v1.1 re-rating ─→ editor auto-rating (2.0)
Analytics (0.9) ─→ v1.1 tuning ─→ paywall position
Capacitor ─→ haptics, Game Center, IAP
Supabase events ─→ global stats (2.0)
Replay (1.1) ─→ ghost race (1.5)
```

## Effort summary (solo + Claude Code, rough)

- Phase 0: 3–4 weeks
- v1.0: 2–3 weeks
- v1.1: 1–2 weeks
- v1.5: 3–4 weeks
- v2.0: 5–7 weeks

Total to v1.0 launch: **~6 weeks of focused work.**
