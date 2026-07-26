# STORE-SHIP-PLAN: remaining work to ship on the App Store + Google Play

Status: **plan — not started.** Written 2026-07-26 from a fresh audit of the
repo (not from the older plan docs' claims). Read [CLAUDE.md](../CLAUDE.md)
first. [PLAN-STATUS.md](PLAN-STATUS.md) tracks the game itself; this doc
covers only the distance between "the web game is done" and "approved and
live on both stores."

## 1. Where things actually stand (audited 2026-07-26)

**Done and solid:**
- The game: 500 verified levels / 10 chapters, 3 pacings, Daily, Bounty,
  Impound, 51 gate/hitch variety levels, collection/garage, tutorials,
  i18n in 10 locales, admin tools. `verify-levels.mjs` green.
- Capacitor 6 scaffold: `capacitor.config.json`, iOS plugin deps
  (`core/ios/haptics/local-notifications/preferences/splash-screen`),
  safe-area CSS, haptics bridge, Preferences-backed saves.
- Streak-reminder notification (`js/notify.js`) — the only push type, by
  design; silent no-op on web, LocalNotifications on native.
- Analytics (`js/analytics.js`) — privacy-clean by construction (random
  device id, game facts only); ships fully offline when `js/config.js` is
  left blank (the current state), batches to Supabase REST if configured.

**Scaffolded only / stubbed (the honest gaps):**
- `npx cap add ios` has never been run — no `ios/` project exists.
- **Android doesn't exist at any layer**: no `@capacitor/android`
  dependency, no `android/` project, nothing Play-specific anywhere.
- IAP is a stub: the Buy button sandbox-unlocks (`wirePro()` in
  js/game.js), Restore shows a toast. No store plugin is installed.
- No native app icons or splash assets — only `assets/icon.svg` and two
  start-screen JPGs. Stores need generated icon/splash sets.
- No Android back-button handling (`@capacitor/app` not installed) — on
  Android the hardware back would exit the app from anywhere, including
  overlays. Instant bad-review generator, arguably a rejection risk.

**Latent defects found during this audit:**
- **All 7 font files are broken.** `assets/fonts/*.woff2` are HTML error
  pages saved with a .woff2 extension (a failed download, committed).
  The browser logs OTS parse errors and silently falls back to system
  fonts — so the shipped typography has never been the intended
  Inter/Chakra Petch. Nobody noticed because the fallback is decent.
- `capacitor.config.json` has `webDir: "."` — `cap sync` would copy the
  **entire repo** into the app bundle: `node_modules/` (37 MB), `docs/`,
  `tools/`, `.genwork/`, the Supabase schema. Ship blocker, and an
  embarrassing one if reviewers browse the bundle.
- Assets are 60 MB, of which **40 MB is music** (12 MP3s) and 20 MB car
  photos. Not over any store limit, but 3–4× heavier than this game
  should be; download size is a conversion lever on Play especially.

## 2. P0 — blockers, in dependency order

### P0-1. Build step + webDir (repo work, no Mac needed)
Add `tools/build-www.mjs`: copy exactly `index.html`, `css/`, `js/`,
`assets/` into `www/` (gitignored), then set `"webDir": "www"`. Wire as
`npm run build`. Everything native syncs from that.

### P0-2. Fix the fonts (repo work)
Download the real Inter (400/500/600/700) and Chakra Petch (500/600/700)
woff2 files (both are OFL-licensed — include the license files), verify
each with `file` (must say "Web Open Font Format"), and add a
Playwright check that no OTS/font console errors appear on load.
Decision point: after seeing the real fonts, either keep them or delete
the @font-face rules and commit to the system-font look the game has
actually been shipping all along.

### P0-3. Android platform bring-up
`@capacitor/android` dep → `npx cap add android` → commit the `android/`
project. Set applicationId (`app.midnightgarage`), portrait-lock the
activity, min SDK per Capacitor 6 default (22/23), **targetSdk 35**
(Play's current floor for new apps; expect 36 to become the floor ~Aug
2026 — building against 35+ now keeps both dates safe). Play App
Signing at console setup.

### P0-4. iOS platform bring-up (needs a Mac + Xcode)
`npx cap add ios` → commit `ios/`. Portrait lock, launch storyboard from
the splash assets, `AVAudioSession` category `.ambient` (music apps keep
playing; PLAN-STATUS 0.4 already flags this), `ITSAppUsesNonExemptEncryption
= NO` in Info.plist (HTTPS-only → export-compliance exempt, and the app
is fully offline by default anyway).

### P0-5. Icons + splash for both platforms
Use `@capacitor/assets` with `assets/icon.svg` as source: 1024px App
Store icon, full iOS set, Android adaptive icon (foreground layer +
`#0b0e14` background layer), splash screens both platforms from the dark
background + centered mark (don't reuse the photographic start JPGs as
splash — they're already the in-app start screen; the splash should be
quieter and load-time-neutral).

### P0-6. Real IAP: one non-consumable, "Pro Garage"
The single most substantive remaining feature. Recommendation:
**RevenueCat's Capacitor plugin** (free tier covers this volume, wraps
StoreKit 2 + Play Billing 7+, entitlement checks survive
reinstall/multi-device) — alternative is `cordova-plugin-purchase` v13
if a third-party dependency is unwanted.
- Product: non-consumable / one-time in-app product `pro_garage`, both
  consoles, same id.
- Replace `wirePro()`'s sandbox unlock: native → plugin purchase flow →
  entitlement check sets `save.pro`; keep the sandbox unlock **web-only**
  (gate on `Capacitor.isNativePlatform()`), it's how the flow stays
  testable in a browser.
- **Restore must really work** — Apple Guideline 3.1.1 requires a
  functioning restore mechanism for non-consumables; the current toast
  stub is a guaranteed rejection. Both `restoreBtn`s call the plugin's
  restore and re-check entitlement.
- Price the localized tiers at console level; the paywall UI is done.

### P0-7. Android back button
Add `@capacitor/app`; on `backButton`: if any overlay has `.show`, close
the topmost (respecting the same non-dismissable list as the tap-outside
handler in js/game.js:2134); if mid-level, go to start screen; else
`App.exitApp()`. Small, but Android reviewers and users hit it in the
first 30 seconds.

### P0-8. Admin mode vs. App Review
The 5-tap admin backdoor (Sandbox, Asset Library, level jump) is exactly
the kind of "hidden feature" Apple's 2.3.1 exists for. Two acceptable
paths: (a) disclose it in App Review notes as a dev/QA tool, or (b) add
a build-time kill switch the release build sets. Recommendation: **(b)**
— one `const ADMIN_ENABLED` in js/game.js the build step can flip; the
tool has no player-facing value and disclosure invites questions.
Decision needed either way; silence is the only wrong option.

### P0-9. Privacy policy + support page (business/web work)
Both stores require a privacy-policy URL even for zero-collection apps,
and Apple requires a support URL. With `js/config.js` left blank the
truthful policy is one paragraph: nothing collected, nothing leaves the
device, no accounts, no third-party SDKs phoning home. **Decision:
ship v1.0 with analytics OFF (blank config).** It makes both privacy
forms trivially clean ("No data collected"), removes the only network
dependency, and the funnel can be enabled in 1.0.1 once the Supabase
project + updated privacy labels are ready together.

## 3. P1 — polish that should precede review

- **Audio diet**: re-encode the 12 MP3s ~128 kbps / normalize loudness;
  target ≤ 15 MB of audio, app ≤ ~35 MB total. Biggest single lever on
  Play install conversion.
- **Background/interruption QA**: backgrounding mid-Pursuit (timer must
  freeze or the level must fail gracefully, not silently keep counting),
  phone-call interruption during music, resume after lock screen.
  `js/analytics.js` handles visibilitychange; audio needs the same QA
  natively.
- **Device matrix**: iPhone SE (smallest supported), current Pro Max,
  low-end Android (2 GB RAM WebView), one tablet each. The layout is
  responsive but has never been touched on a physical device.
- **iPad decision**: either QA the tablet layout properly (App Store
  then needs iPad screenshots) or mark iPhone-only in Xcode. The 6-col
  grid scales; recommendation: iPhone-only for v1.0, iPad in a point
  release — one less review surface.
- **Rate-app prompt**: native `SKStoreReviewController` / Play In-App
  Review after the Nth win (N≈15, once ever). Cheap, high-leverage,
  fits the "no nags" covenant if capped at once.
- **Final full-locale smoke test** in the native shells (the ja/ko/zh/ru
  strings have only ever rendered in desktop Chromium).
- **Trademark/handle check for "Midnight Garage"** (PLAN-STATUS 0.1's
  open flag) — do this BEFORE creating store listings; a rename after
  listing creation is 10× the work.

## 4. P2 — explicitly deferred past v1.0

- Game Center / Play Games leaderboards + achievements, cloud save
  (Preferences → iCloud KV / Play backup) — PLAN-STATUS 1.2.
- Analytics-on (Supabase) + updated privacy labels — v1.0.1.
- App preview video / ASO iteration — post-launch.
- Rewarded-video hint refill — stays cut until an ad-SDK decision (and
  it fights the premium positioning; likely never).
- Chapters 8–10 gate/hitch variety (see VARIETY-PLAN §10 — needs a new
  generator strategy, not release-gating).

## 5. Apple submission checklist

| Item | Notes |
|---|---|
| Developer Program account active | $99/yr, needs D-U-N-S if company |
| App record, bundle id `app.midnightgarage` | matches capacitor.config.json |
| Agreements, tax, banking complete | blocks paid IAP silently if skipped |
| IAP product `pro_garage` (non-consumable) approved | submit WITH the binary first time |
| Restore purchases functional | 3.1.1 — currently a stub, P0-6 |
| Privacy nutrition labels: "Data not collected" | true only with blank config (P0-9) |
| `ITSAppUsesNonExemptEncryption = NO` | HTTPS-only exemption |
| Age rating questionnaire → 4+ | no UGC exposure (Sandbox is local + admin-gated) |
| Screenshots: 6.9" and 6.5" iPhone (+iPad 13" only if iPad enabled) | portrait |
| Support URL + privacy policy URL | P0-9 |
| Hidden-feature stance on admin mode | P0-8, review notes or kill switch |
| TestFlight internal → external pass | full IAP sandbox test incl. restore |

## 6. Google Play submission checklist

| Item | Notes |
|---|---|
| Play Console account | **if a NEW personal account: 12 testers for 14 days closed-testing requirement before production — this is the schedule long-pole; start closed testing the moment a build exists** (org accounts exempt) |
| AAB build, Play App Signing enrolled | AAB mandatory |
| targetSdk 35 (plan 36 by ~Aug 2026) | P0-3 |
| IAP product `pro_garage` + license testers | test purchases without spending |
| Data safety form: no data collected/shared | true only with blank config |
| Content rating (IARC questionnaire) → Everyone | |
| Privacy policy URL | mandatory regardless of collection |
| Store listing + screenshots (phone; 7"/10" tablet optional) | |
| Pre-launch report reviewed | free crawler QA on real devices, fix what it flags |
| Hardware back button behaves | P0-7 |

## 7. Suggested sequence

**M1 — repo-only, no accounts or Mac needed:**

| Item | Status |
|---|---|
| P0-1 build step (`tools/build-www.mjs`, `webDir` fixed) | ✅ done |
| P0-2 real fonts | ✅ done |
| P0-7 back-button handler | ✅ done (logic verified via a temporary test hook, not a shipped keyboard shim — see below) |
| P0-8 admin kill switch (`js/build-flags.js`) | ✅ done, verified: release build leaves the 5-tap backdoor fully unreachable |
| `@capacitor/android` + `@capacitor/app` deps | ✅ done |
| P0-5 icon/splash **source images** | ✅ done (`resources/`) — composition verified by direct inspection (readable at 1024px, adaptive-icon safe zone respected, real alpha transparency confirmed); **not yet verified through the actual `@capacitor/assets generate` → device/simulator pipeline**, since that needs P0-3/P0-4's platforms to exist first |
| P1 audio re-encode | ⬜ blocked in this environment — no system `ffmpeg` and the package mirror needed to install it is failing on unrelated broken URLs pulling in a large, unnecessary dependency chain (video drivers, speech recognition data); the WASM alternative (`@ffmpeg/ffmpeg`) is a heavyweight, uncertain install for a P1 nice-to-have and wasn't worth gambling the session on. Needs a real dev machine with ffmpeg. |

Note on P0-7's testing: rather than shipping a keyboard shim into
production code (Escape-key-triggers-back is exactly the kind of
surprise behavior that shouldn't ride along to a store build for
developer convenience), the back-button logic was verified by
temporarily exposing the handler function on `window`, driving all four
branches with Playwright, then removing the expose before committing.
The plugin-access pattern itself (`globalThis.Capacitor?.Plugins?.App`)
means the real native event is still what's untested — that only
becomes possible once P0-3/P0-4 produce an actual Android build.

**M2 — platform bring-up (Mac + developer accounts, not available in
this environment):**
`cap add ios` / `cap add android`, native config (P0-3/4), running
`@capacitor/assets generate` against the sources already prepared in
`resources/` and checking the result on a simulator/device, RevenueCat +
store products (P0-6), physical-device QA matrix, background/audio QA,
and finishing the audio re-encode with real `ffmpeg`.

**M3 — store operations (parallel with M2's tail):**
Trademark check → listings, screenshots, privacy policy + support page
(P0-9), TestFlight + Play closed testing (start Play's 14-day clock
ASAP if on a personal account), IAP sandbox passes on both, submit.

Realistic effort: M1 is a day or two of repo work. M2/M3 are dominated
by account setup, the Play 14-day testing clock (if applicable), and
review turnaround (1–3 days Apple, hours–days Google) — call it 3–4
weeks calendar time from starting M2, mostly waiting, not working.

## 8. Acceptance = ready to submit

- [x] `npm run build` produces a `www/` with only game files; `cap sync`
      bundles nothing else. (`npm run build:release` additionally
      disables admin mode.)
- [x] Real fonts load with zero console errors (verified via
      `document.fonts` + a Playwright console-error check).
- [ ] Fresh-install purchase AND restore succeed in Apple sandbox and
      Play license testing; web build still sandbox-unlocks. (IAP itself
      — P0-6 — hasn't been built yet; needs M2.)
- [x] Android back button never hard-exits from an overlay or mid-level.
      (Logic verified in Chrome; the real native `backButton` event
      still needs an actual Android build to confirm end-to-end.)
- [x] Admin mode unreachable in release builds (or disclosed in notes).
      Verified with Playwright: 5 taps on the title in a `--release`
      build leaves the admin chip/bar hidden.
- [ ] App ≤ ~40 MB installed; audio re-encoded. (Currently ~61 MB
      unpacked, 40 MB of which is unencoded audio — blocked on a real
      `ffmpeg`, see §7.)
- [ ] Both privacy forms filed as "no data collected"; policy URL live.
- [ ] Pursuit timer behaves across backgrounding on both platforms.
- [ ] All 10 locales spot-checked in native shells.
- [ ] verify-levels.mjs green on the exact commit that gets tagged.
