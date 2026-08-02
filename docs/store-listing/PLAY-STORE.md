# Google Play Console — text assets

Same disclaimers as APP-STORE.md: pricing matches `js/iap.js`'s current
placeholder USD strings (update once P0-6 sets real localized prices),
and ads copy matches the P0-11 decision actually made and code-integrated
(2026-08-02): Google AdMob, banner + interstitial removable via Pro
Garage/Remove Ads, rewarded video always optional.

---

## App title (30 char max)

```
Midnight Garage
```
(15/30 chars)

---

## Short description (80 char max)

```
Slide the cars, dodge the alarm, free the car. 500 heist-puzzle levels.
```
(71/80 chars)

---

## Full description (4000 char max)

```
FREE THE RED CAR

Midnight Garage is a sliding-block puzzle with a heist twist. Every board
is a lot full of parked cars, hitched trailers, and security gates — your
job is to slide everything else out of the way and drive your car clean
out the exit.

THREE WAYS TO PLAY EVERY JOB

• Heist — a per-move alarm budget. Take too long and the police show up.
  Busting never costs your progress, just the attempt.
• Pursuit — the same board, a real-time countdown instead.
• Relaxed — no fail state at all. Clear the lot at your own pace, and
  the only mode where you choose which car in your garage you're driving.

500 LEVELS, 10 CHAPTERS

A hand-tuned difficulty curve that keeps getting harder all the way to
level 500. Chapters 1-2 (100 levels) are free forever. Chapters 3-10
unlock with Garage Pro, a single one-time purchase — no subscription.

A NEW JOB EVERY NIGHT

• Daily Puzzle — one board, worldwide, identical for every player, new
  at midnight. Build a streak; freeze tokens forgive the days you miss.
• Tonight's Mark — a curated bounty job on rotation. Clear it clean and
  earn a car you can't get any other way.
• Impound Lot — a bonus board pool that unlocks once you've cleared the
  full campaign.

BUILD THE GARAGE

Every car you earn is yours to keep and drive in Relaxed mode. No loot
boxes, no randomized pulls — what you earn is exactly what you see
before you play for it.

REAL MECHANICS

Security gates on sensor logic, hitched tow-and-trailer pairs that move
as one, roadwork blockers. Every board is generated and verified to have
exactly one optimal solution.

FAIR BY DESIGN

Wrenches (in-game currency) buy breathing room — an extra hint, a second
chance — never a lower par, never a specific car. Rewarded video is
always optional and never the only way to progress. Ads never interrupt
a level in progress, and Garage Pro removes them entirely.

Ten languages. No account required — your progress lives on your device.
```
(character count under 2000 — well inside the 4000 limit)

---

## Release notes — version 1.0

```
Initial release. 500 campaign levels across 10 chapters, three ways to
play every board (Heist, Pursuit, Relaxed), Daily Puzzle with streaks,
nightly Bounty jobs, Impound Lot, and a full car collection to build out
in the Garage.
```

---

## Store listing assets checklist (Play-specific, not shared with Apple)

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512px | needs P0-5's `@capacitor/assets generate` output |
| Feature graphic | 1024×500px, required | **not started — this is Play-only, no App Store equivalent, easy to forget** |
| Phone screenshots | 2 minimum, 4-8 recommended, 16:9 preferred, 320-3840px per side | needs a real device or emulator once P0-3 lands |
| Tablet screenshots | optional | only if the iPad-equivalent decision (STORE-SHIP-PLAN §3) lands on "yes, support tablets" |

## Content rating (IARC questionnaire) — expected path

Same facts as the Apple age-rating answers in APP-STORE.md: no violence,
no gambling (Wrenches have fixed prices, never randomized odds), no
UGC visible to other users. Expected outcome: **Everyone**.

## Target audience

Not designed for children — select an adult-inclusive age range (13+ or
18+ per Play's current options) rather than a children's-category range,
to avoid the extra Play Families/COPPA-adjacent requirements that come
with declaring a primarily-under-13 audience. This app collects no data
either way, but the *category* declaration itself changes what Play
requires regardless of actual collection.

## Data safety

See `docs/store-listing/data-safety.md` for the mapped declaration —
Play's form and Apple's App Privacy nutrition labels ask for the same
underlying facts in different shapes, so that file is written to answer
both.
