# Store submission checklist

A single, ordered checklist to work through before submitting Midnight
Garage to the Apple App Store and Google Play. This is the "what do I
still have to do" list; it deliberately doesn't repeat the *why* behind
each item where a more detailed doc already covers it — those are linked
inline. Run `npm run preflight` (see [Automated checks](#automated-checks)
below) before working through this list; it catches a subset of
mechanical mistakes automatically.

Each item is tagged with what it needs:

- 🔑 **Account** — needs a real Apple Developer / Google Play Console /
  AdMob / RevenueCat account or credential that doesn't exist in this
  environment.
- ⚖️ **Legal** — needs review by the developer/business as the legal
  entity, not something an engineering change can complete. Nothing in
  this repo's docs is legal advice.
- 📱 **Device** — needs a physical iOS/Android device or, at minimum, a
  simulator/emulator with a full native toolchain (Xcode/Android Studio),
  neither of which exists in this environment.
- 🖥️ **Console** — a manual step performed in App Store Connect / Play
  Console's web UI, not something committed to this repo.
- ✅ **Repo work** — already done in this repository; verify, don't redo.

## 1. Versioning

- ✅ **Repo work** — Android `versionCode`/`versionName` and iOS
  `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` are set and validated by
  `npm run preflight` (`android/app/build.gradle`,
  `ios/App/App.xcodeproj/project.pbxproj`).
- [ ] 🔑📱 Before each store upload: bump `versionCode` (Android, must
      strictly increase every Play upload) and/or `CURRENT_PROJECT_VERSION`
      (iOS build number — Codemagic's pipeline auto-increments this from
      the latest TestFlight build, see `codemagic.yaml`). Bump
      `versionName`/`MARKETING_VERSION` only for a user-visible release,
      not every internal build.

## 2. Android — signed AAB, Play App Signing

- [ ] 🔑 Generate an upload keystore once (`docs/CI-SETUP.md` §3 has the
      exact `keytool` command) and store it somewhere safe **outside this
      repo** — losing it before Play App Signing is enrolled means you can
      never update the app under the same listing.
- [ ] 🖥️ Enroll in **Play App Signing** when creating the Play Console
      app listing (opt-in is the default and recommended path — Google
      holds the app signing key, you keep only the upload key above).
- [ ] 🔑📱 Produce a signed release AAB: `codemagic.yaml`'s
      `android-release` workflow runs `./gradlew bundleRelease` against the
      keystore secrets described in `docs/CI-SETUP.md`. This cannot be
      produced in this sandboxed environment (no Android SDK/build tools
      installed) — it's CI/local-machine-only work.
- [ ] 🖥️ Upload the AAB to an **internal testing** track first (already
      `codemagic.yaml`'s default `track: internal`, `submit_as_draft:
      true` — nothing auto-promotes to production).

## 3. iOS — archive, signing, provisioning, TestFlight

- [ ] 🔑 Apple Developer Program membership active; App Store Connect API
      key with Admin role for automated signing (`docs/CI-SETUP.md` §2).
- [ ] 🔑📱 Archive + sign via `codemagic.yaml`'s `ios-release` workflow
      (`xcode-project use-profiles` + `xcode-project build-ipa`) — cannot
      be produced here (no macOS/Xcode). A local Mac with Xcode is the
      alternative path if not using Codemagic.
- [ ] 🖥️ Confirm the build lands in TestFlight (`submit_to_testflight:
      true` is already set; `submit_to_app_store: false` is deliberate —
      flip that only once TestFlight testing below has actually happened).
- [ ] 📱 Run at least one TestFlight build through internal testers before
      submitting for App Review.

## 4. Device testing

- [ ] 📱 See [docs/RELEASE_TEST_PLAN.md](RELEASE_TEST_PLAN.md) for the
      concrete pass/fail checklist. Needs at least one physical iOS device
      and one physical Android device — none of this is executable from
      this repo/CI environment.

## 5. Store listing — copy, assets, screenshots

- ✅ **Repo work** — listing copy is already drafted from the shipped app
  in `docs/store-listing/APP-STORE.md` and `docs/store-listing/PLAY-STORE.md`.
  See [docs/STORE_LISTING_TEMPLATE.md](STORE_LISTING_TEMPLATE.md) for the
  reusable structure both of those follow, plus the asset checklist.
- [ ] 📱🖥️ Screenshots must come from a real device or simulator running
  an actual build — none exist yet in this repo. Sizes/counts required
  per platform are listed in `docs/STORE_LISTING_TEMPLATE.md`.
- [ ] ⚖️ Re-confirm `docs/ASSET-PROVENANCE.md`'s current state (vehicle
  art licensing) before answering either store's "third-party content"
  question — do not answer it from memory.

## 6. Google Play Data Safety

- ✅ **Repo work** — `docs/store-listing/data-safety.md` maps every data
  type Play's Data Safety form asks about, derived from the actual code
  (`js/analytics.js`, `js/config.js`, `js/ads.js`, `js/iap.js`,
  `js/storage.js`), not guessed.
- [ ] 🖥️ Transcribe that mapping into Play Console's Data Safety form
  manually — the form has no import mechanism from a markdown file.
- [ ] Re-derive this mapping if `js/config.js` is ever filled in with real
  Supabase credentials, or if the AdMob/RevenueCat integrations change —
  the doc explicitly flags itself as stale the moment either happens.

## 7. Apple App Privacy ("nutrition label")

- ✅ **Repo work** — same source doc (`docs/store-listing/data-safety.md`)
  covers Apple's version of the same questions, plus
  `resources/PrivacyInfo.xcprivacy` / `ios/App/App/PrivacyInfo.xcprivacy`
  (kept in sync — `npm run preflight` checks the iOS copy exists and is
  registered in the Xcode project).
- [ ] 🖥️ Transcribe into App Store Connect's App Privacy section manually.

## 8. Age / content ratings

- ✅ **Repo work** — expected answers drafted in
  `docs/store-listing/APP-STORE.md` ("Age Rating questionnaire") and
  `docs/store-listing/PLAY-STORE.md` (content rating section), both
  reasoned from the actual shipped content (no violence, no UGC visible
  to others, no gambling mechanics — Wrenches are purchased/earned at a
  fixed rate, never randomized odds).
- [ ] 🖥️ Answer the actual IARC (Play) / age rating (Apple) questionnaires
  in-console using that drafted reasoning — the questionnaires themselves
  only exist inside each console.

## 9. Reviewer access instructions

- ✅ **Repo work** — App Review notes are drafted in
  `docs/store-listing/APP-STORE.md` ("App Review Notes" section): no
  accounts/sign-in exist, how to reach gated content (Pro Garage IAP,
  sandbox tester), what the ad placements are.
- [ ] 🔑 If IAP sandbox testing is required for review, a **sandbox
  tester account** (Apple) / **license tester** (Google) must be set up
  in each console — not something this repo can create.

## 10. Export compliance

- [ ] 🖥️⚖️ App Store Connect's export compliance question: this app uses
  only standard HTTPS/TLS (its own network calls — Supabase REST, AdMob,
  RevenueCat SDKs) with no custom cryptography. `ITSAppUsesNonExemptEncryption`
  is already set to `false` in `ios/App/App/Info.plist` on that basis. If
  that changes (e.g. custom encryption is added), this flag and the
  console answer both need to change together. This is not legal advice —
  confirm against Apple's current export-compliance guidance, especially
  if targeting any embargoed country.

## 11. Pricing & countries

- [ ] ⚖️🖥️ Decide base price + territories in each console. Listing copy
  currently references placeholder USD prices from `js/iap.js` — see
  `docs/store-listing/README.md` item 4 and `docs/STORE-SHIP-PLAN.md`
  P0-6 for what still needs a real RevenueCat/store product setup before
  those prices are real.

## 12. Privacy policy / support URLs

- ✅ **Repo work** — `docs/store-listing/privacy-policy.html` and
  `docs/store-listing/support.html` are written and ready to host (see
  [docs/PRIVACY_POLICY_TEMPLATE.md](PRIVACY_POLICY_TEMPLATE.md) for the
  reusable template these were built from, if the policy ever needs a
  from-scratch rewrite).
- [ ] 🖥️ **Manual toggle still pending**: `docs/store-listing/README.md`
  step 3 — flip this repo's GitHub Pages source to the existing
  `gh-pages` branch so the URLs actually resolve, then paste those URLs
  into both consoles' privacy-policy/support-URL fields.

## 13. Account deletion

- ✅ **Repo work** — see [docs/ACCOUNT_DELETION.md](ACCOUNT_DELETION.md).
  Midnight Garage has **no user accounts anywhere** (verified: no
  auth/session code exists; `supabase/schema.sql` has an insert-only,
  anonymous-analytics table, nothing identity-bearing) — so neither
  store's account-deletion requirements currently apply in the way they
  do for an app with sign-in. That doc lays out exactly what would be
  required if accounts are ever added, and the one real gap that exists
  today (no self-service way to request analytics data be purged, since
  the anon key can only insert).
- [ ] ⚖️ If Google's Play Console "Account deletion" declaration form asks
  whether the app supports account creation — answer **No** based on the
  current codebase, and re-answer if that ever changes.

## 14. Release sign-off

- [ ] Run `npm run verify` (500-level regression) and `npm run preflight`
  (this repo's mechanical release checks) with a clean result.
- [ ] Confirm the build was produced with `npm run build:release` (strips
  admin mode — see `js/build-flags.js`, `docs/STORE-SHIP-PLAN.md` P0-8),
  not `npm run build`.
- [ ] Every open item above with 🔑, ⚖️, 📱, or 🖥️ is either done or
  explicitly accepted as a known gap by whoever owns the Apple/Google
  accounts — this checklist does not get "completed" by an engineering
  change alone.

## Automated checks

```bash
npm ci
npm run build       # tools/build-www.mjs → www/
npm run verify      # re-solves all 661 campaign/bounty/impound boards + daily determinism
npm run preflight   # tools/preflight-release.js — see below
```

`npm run preflight` (`tools/preflight-release.js`) is a Node-only,
no-native-toolchain script that fails (non-zero exit) on:

- placeholder bundle/package IDs (`com.example.*`, `io.ionic.starter`,
  etc.) in `capacitor.config.json`, `android/app/build.gradle`, or the
  iOS project;
- app-ID mismatches between Capacitor config, Android, and iOS;
- a missing or unregistered iOS `PrivacyInfo.xcprivacy`;
- missing/invalid Android `versionCode`/`versionName` or iOS
  `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`;
- a `capacitor.config.json` `server.url` override or a `js/config.js`
  endpoint pointing at `localhost`/a dev host;
- any of the release docs listed above being absent.

It also **warns** (non-blocking) on things that are known, tracked gaps
in this repo rather than release blockers detectable from source alone —
e.g. the `[FILL IN]` AdMob/RevenueCat IDs in `js/ads.js`/`js/iap.js`,
which stay placeholders until real accounts exist. Warnings are listed in
the script's output; read them before every submission, they're not
noise.

It cannot check anything that requires a native build (compiling, code
signing, running on-device) or a store account — those remain the manual
items above.
