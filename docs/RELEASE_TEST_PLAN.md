# Release test plan

A concise, physical-device-first test pass to run before submitting a
build to TestFlight/Play internal testing, and again before promoting
past internal testing. None of this is executable from this repo's CI —
it needs at least one real iOS device and one real Android device (a
simulator/emulator can substitute for some rows, marked below, but not
all — e.g. push/local notifications and true offline/airplane-mode
behavior are unreliable on simulators).

Check off each row per platform; don't assume a pass on one platform
means the other is fine — Capacitor plugin behavior genuinely differs
(see README's "Native shell (Capacitor)" section).

## Install & first run

- [ ] Fresh install (not an update) launches without a crash on both
      platforms.
- [ ] Splash screen shows and hides cleanly (`SplashScreen` config in
      `capacitor.config.json`).
- [ ] No admin/debug affordance is reachable unless it's supposed to be —
      confirm the build under test was produced with
      `npm run build:release` (see `js/build-flags.js`), not a dev build.

## Core gameplay

- [ ] Campaign level 1 is solvable and the win state triggers correctly.
- [ ] Each pacing mode (Heist, Pursuit, Relaxed) can be started and
      completed at least once.
- [ ] Daily Puzzle loads today's board and completes/shares correctly.
- [ ] Bounty ("Tonight's Mark") loads and — per
      `docs/STORE-SHIP-PLAN.md`'s bounty-forced-pacing invariant — the
      mode selector is disabled for its duration and restores the
      player's prior mode afterward.
- [ ] Hardware back button (Android only) behaves as expected in-game and
      on every overlay/menu — this cannot be verified on iOS at all,
      don't skip it there thinking it's covered.

## Authentication

- [ ] N/A — the app has no accounts or sign-in
      ([docs/ACCOUNT_DELETION.md](ACCOUNT_DELETION.md)). Confirm the
      build under test doesn't prompt for one (would indicate an
      unexpected regression, not an intentional feature).

## Offline / network interruption

- [ ] Launch in airplane mode: the game is fully playable (all game data
      ships in the binary; nothing is fetched at runtime for core play).
- [ ] Toggle airplane mode on mid-session, then off again: no crash, no
      stuck loading state. `js/analytics.js`'s flush should silently
      retry rather than error visibly.
- [ ] If ads are enabled for the build under test: verify an ad request
      failing (airplane mode / ad network unreachable) doesn't block or
      crash gameplay — ad placements must fail closed, never block the
      play loop.

## Update path

- [ ] Install the previous released build, then update in-place to the
      build under test (TestFlight build-over-build, or sideload the new
      APK/AAB over Play's internal track) — confirm save data survives
      the update (progress, streaks, purchase entitlement state via
      `js/storage.js`).
- [ ] If this update changes campaign level ordering/count, confirm the
      save-migration path documented in `CLAUDE.md`'s "critical
      invariants" section was actually exercised, not just written.

## Permissions

- [ ] Confirm the app does **not** prompt for camera, microphone,
      contacts, photos, or location — none of these are declared in
      `AndroidManifest.xml`/`Info.plist`, and none should ever be
      requested silently by a dependency.
- [ ] iOS: the App Tracking Transparency (ATT) prompt appears only when
      the ads/consent flow actually calls for it (per `js/ads.js`), shows
      the exact string in `NSUserTrackingUsageDescription`, and declining
      it results in non-personalized ads only, never a crash or degraded
      core experience.
- [ ] Confirm INTERNET permission (Android's only declared permission) is
      still actually required — i.e. analytics/ads/IAP code paths that
      need it are still present — before ever removing it in a future
      change.

## Accessibility

- [ ] Text is legible and controls are reachable one-handed on the
      smallest supported device size actually available for testing.
- [ ] System font-size scaling doesn't break layout in a way that hides
      any control (spot check the settings/overlay screens, not just the
      board).
- [ ] Color contrast on the board (piece colors vs. background, vs. the
      hero car) is distinguishable — relevant given `js/art.js`'s
      colour-family system exists partly to avoid visually similar
      pieces, but that's a same-color-family guarantee, not a contrast
      guarantee; a manual look is still worth doing.
- [ ] VoiceOver/TalkBack: launch and navigate at least the start screen
      and one level without the app becoming completely unusable — full
      screen-reader support is not a documented requirement of this app,
      but a basic pass catches egregious regressions (unlabeled buttons,
      focus traps).

## Deletion flow

- [ ] Confirm there is no in-app "delete account" control shipped
      (correct — see [docs/ACCOUNT_DELETION.md](ACCOUNT_DELETION.md);
      finding one would indicate someone added a non-functional or
      unreviewed control and it must be pulled before release).
- [ ] Confirm uninstalling the app removes all locally-stored save data
      (i.e. a subsequent fresh install starts at level 1, not restored
      progress) — this is the only "deletion" surface that exists today.

## Sign-off

- [ ] Every unchecked row above is either fixed or explicitly accepted as
      a known issue, in writing, by whoever is approving the release —
      this test plan does not get "passed" by running it once with no
      failures noted; it gets passed by someone accountable reviewing the
      results.
