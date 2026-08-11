# App Store Connect — text assets

Ready to paste into App Store Connect fields. **Placeholders you need to
fill in before submission are marked `[FILL IN]`** — nothing else here is
a placeholder; it's real copy written from the actual shipped app, not
generic filler to be rewritten later.

Two things this depends on that aren't finished yet:
- **Pricing** shown below (`$6.99` etc.) matches `js/iap.js`'s current
  placeholder USD strings — P0-6 replaces these with real store-localized
  prices. Update this doc's numbers once those are set at console level,
  since whatever's typed into the App Store description should match
  what the paywall actually shows.
- **Ads language** below matches the P0-11 decision actually made and
  code-integrated (2026-08-02): Google AdMob, banner + interstitial both
  removable via Pro Garage/Remove Ads, rewarded video always optional and
  never gated by those unlocks. The AdMob integration itself still needs
  a real ad account and on-device verification before submission (see
  STORE-SHIP-PLAN.md P0-11) — this copy doesn't depend on that finishing,
  since the ad *behavior* described here is already what the shipped code
  does.

---

## App Name (30 char max)

```
Midnight Garage: Escape
```
(23/30 chars — decided 2026-08-04: "Escape" is the genre word for this
category — escape-room/traffic-escape players search on it directly,
and it moves the app out of the crowded "Midnight + cars" naming space
shared with unrelated racing/driving-sim apps. "Midnight Garage" alone
carries no genre signal. This is the App Store Connect "Name" field —
distinct from `CFBundleDisplayName` in `ios/App/App/Info.plist`, which
stays the shorter "Midnight Garage" for the home-screen icon label,
where a longer string would just truncate.)

## Subtitle (30 char max)

```
Traffic jam logic puzzle
```
(24/30 chars — the second-heaviest-weighted App Store search field;
pairs the mechanic ("traffic jam") with the genre ("logic puzzle") so
between Name + Subtitle both the setting and the genre are covered.)

---

## Promotional Text (170 char max)

```
Slide cars, dodge the alarm, make the getaway. 500 heist-puzzle levels,
a daily worldwide board, and nightly bounty jobs. No ads to start playing.
```
(146/170 chars)

---

## App Store Description (4000 char max)

```
FREE THE RED CAR

Midnight Garage is a sliding-block puzzle with a heist twist. Every board
is a lot full of parked cars, hitched trailers, and security gates — your
job is to slide everything else out of the way and drive your car clean
out the exit. No timers to start, no tutorial slog: the first move is
obvious, the fiftieth board is not.

THREE WAYS TO PLAY EVERY JOB

- HEIST — a per-move alarm budget. Take too long and the police show up.
  Busting never costs your progress, just the attempt.
- PURSUIT — the same board, a real-time countdown instead. Beat the
  clock, not the move counter.
- RELAXED — no fail state at all. Clear the lot at your own pace, and
  the only mode where you choose which car in your garage you're driving.

500 LEVELS, 10 CHAPTERS

Night Shift through Vault Row — a hand-tuned difficulty curve that keeps
getting harder all the way to level 500. Chapters 1-2 (100 levels) are
free forever. Chapters 3-10 unlock with Garage Pro.

A NEW JOB EVERY NIGHT

- DAILY PUZZLE — one board, worldwide, identical for every player, new
  at midnight. Build a streak; freeze tokens forgive the days you miss.
- TONIGHT'S MARK — a curated bounty job on rotation. Clear it clean and
  earn a car you can't get any other way.
- IMPOUND LOT — a bonus pool of boards that unlocks once you've cleared
  the full campaign.

BUILD THE GARAGE

Every car you earn — campaign clears, bounty rewards, milestones — is
yours to keep and drive in Relaxed mode. No loot boxes, no randomized
pulls: what you earn is exactly what you see before you play for it.

REAL MECHANICS, NOT JUST MORE BOXES

Security gates that open and close on sensor logic. Hitched tow-and-
trailer pairs that move as one and cost a real move to decouple. Roadwork
blockers. Every mechanic is generated and verified to have exactly one
optimal solution — no guesswork, no unsolvable boards.

FAIR BY DESIGN

- No level is ever locked behind a paywall you can't see past — Garage
  Pro is one purchase, forever, no subscription.
- Wrenches (the in-game currency) buy breathing room — an extra hint, a
  second chance after a bust — never a lower par, never a specific car.
- Rewarded video is always optional. It is never the only way to
  progress, and Pro owners keep access to it too.
- Ads never interrupt a level in progress.

Ten languages. Built for one-handed play. No account required — your
progress lives on your device.

Free the car. Beat the clock, beat the budget, or just take your time.
```
(character count: ~2,450/4000 — plenty of headroom if you want to add
screenshots-driven feature call-outs later)

---

## Keywords (100 char max, comma-separated, no spaces after commas)

```
slide,parking,heist,brainteaser,daily,offline,jam,unblock,sliding,rushhour
```
(74/100 chars — updated 2026-08-04 for the new Name/Subtitle: "car" and
"garage" stay excluded since they're in the app name; "escape,"
"traffic," "logic," and "puzzle" are now also excluded since they moved
into the Name ("Midnight Garage: Escape") and Subtitle ("Traffic jam
logic puzzle") above — Apple indexes both fields for search already, so
repeating those words here would waste budget instead of surfacing new
ones. Freed-up space filled with genre-standard terms this exact puzzle
type gets searched under: "rushhour" (the sliding-block genre's
namesake physical puzzle), "unblock" (the other common genre name), and
"jam"/"sliding" as mechanic synonyms.)

---

## Copyright line

```
[FILL IN — format: "2026 <your legal name or company name>"]
```

---

## App Review Notes

```
This app has no accounts, no sign-in, and no login screen of any kind —
progress is stored locally on-device (Capacitor Preferences). There is
nothing to authenticate; please do not look for a sign-in flow, there
isn't one.

Core loop: tap a mode on the start screen (Heist/Pursuit/Relaxed all work
identically for review purposes), then play any level. To see deeper
content quickly: the Daily Puzzle button opens today's board; the Bounty
button opens tonight's rotating job. Chapters 3-10 (levels 101-500) are
gated behind the "Pro Garage" one-time purchase, sandboxed via Apple's
StoreKit test environment — please use a sandbox tester account, purchase
should complete instantly with no real charge.

In-app purchases present: "Pro Garage" (non-consumable, unlocks chapters
3-10 + unlimited hints + cosmetics + removes banner/interstitial ads),
"Remove Ads" (non-consumable), and three "Wrenches" consumable packs
(soft currency for hints/retries). A Restore Purchases control is present
in Settings and re-grants Pro Garage/Remove Ads on a fresh install.

Ads: banner (bottom of the start screen only, never during a level) and
interstitial (capped frequency, never mid-level) via [FILL IN: ad network
once P0-11 is finalized, e.g. Google AdMob]. Rewarded video is optional
and only ever offers extra Wrenches or hints — it is never required to
progress. All three ad types are disabled entirely once Pro Garage or
Remove Ads is purchased.

No user-generated content is visible to other users. There is an
in-app level editor ("Sandbox") but it is a local, single-device
authoring tool with no publishing/sharing surface — nothing a player
creates there is ever visible to anyone else.
```

---

## Age Rating questionnaire — expected answers

No violence, no realistic/cartoon violence, no sexual content, no
profanity, no gambling (Wrenches are earned or purchased directly at a
fixed price — never awarded via randomized odds), no user-generated
content visible to others, no unrestricted web access. "Police arrive"
on a Heist bust is a text/sound game-over state, not a depiction of any
kind. Infrequent/Mild Mature/Suggestive Themes: **No.** Expected result:
**4+.**

## Content Rights

"Does your app contain, display, or access third-party content?" — see
[ASSET-PROVENANCE.md](../ASSET-PROVENANCE.md) before answering this.
Music is cleared (developer-owned/licensed). Vehicle art has known,
partially-resolved third-party exposure as of this writing — do not
answer "No" here without re-reading that doc's current state first, since
the honest answer depends on whether P0-10's cleanup is fully done by
the time this question is actually answered in App Store Connect.
