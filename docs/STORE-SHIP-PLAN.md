# STORE-SHIP-PLAN: remaining work to ship on the App Store + Google Play

Status: **all M1 (repo-only) work done as of 2026-08-04; M2 (real
accounts + an actual compile) is next** — see §7's M1 table for the
itemized list. Originally written 2026-07-26 from a fresh audit of the
repo; revised 2026-07-31 after a second audit (asset IP, ads/IAP stubs,
privacy manifest) and after reconciling against a generic "Expo app →
App Store" guide the user supplied (§9 below explains what did and
didn't carry over). Read [CLAUDE.md](../CLAUDE.md) first.
[PLAN-STATUS.md](PLAN-STATUS.md) tracks the game itself;
[ASSET-PROVENANCE.md](ASSET-PROVENANCE.md) tracks art/audio rights in
detail; [CI-SETUP.md](CI-SETUP.md) covers building/submitting without a
Mac; this doc covers only the distance between "the web game is done"
and "approved and live on both stores."

## 0. This app ships via Capacitor, not Expo/EAS — read this first

If you're following a generic "Expo app to App Store" guide (`eas build`,
`eas submit`, `app.json`'s `bundleIdentifier`, `eas.json`'s
`autoIncrement`), **none of those commands apply to this repo.** This is a
vanilla-JS web game wrapped natively with **Capacitor** — `npx cap add
ios`/`android`, then Xcode/Android Studio build and archive, not EAS's
managed build service. The two toolchains share vocabulary (bundle ID,
signing, TestFlight, Play Console) but not commands or config files.

There is a **separate `mobile/` directory** in this repo — a thin Expo
+ WebView shell used only to preview the live web build on a phone during
development (see `mobile/README.md`). **It must never be what gets
submitted.** Its `app.midnightgarage.preview` bundle ID differs from the
real app's `app.midnightgarage` specifically so the two can't be confused,
but the distinction is easy to lose if someone hands an Expo-flavored
checklist to whoever's doing the submission. Say so explicitly if you're
briefing someone else on this.

§9 at the bottom keeps a short reconciliation against the PDF checklist:
what's genuinely reusable (it's mostly stack-agnostic — testing discipline,
required text assets, screenshot specs, common rejection reasons) and what
to ignore (all EAS-specific commands).

## 1. Where things actually stand (re-audited 2026-07-31)

**Done and solid:**
- The game: 500 verified levels / 10 chapters, 3 pacings, Daily, Bounty,
  Impound, 51 gate/hitch variety levels, collection/garage, tutorials,
  i18n in 10 locales, admin tools. `verify-levels.mjs` green.
- Capacitor 6 scaffold: `capacitor.config.json` (`webDir: "www"`, correct),
  iOS plugin deps (`core/ios/haptics/local-notifications/preferences/
  splash-screen`), `@capacitor/android` + `@capacitor/app` deps present,
  safe-area CSS, haptics bridge, Preferences-backed saves.
- Streak-reminder notification (`js/notify.js`) — the only push type, by
  design; silent no-op on web, LocalNotifications on native.
- Analytics (`js/analytics.js`) — privacy-clean by construction (random
  device id, game facts only); ships fully offline with `js/config.js`
  left blank (**confirmed still blank** as of this audit), batches to
  Supabase REST only once configured.
- Real fonts: `assets/fonts/*.woff2` verified via `file` — genuine WOFF2,
  not the broken error-page files an earlier audit found. OFL license
  files still need to ship alongside them (P0-2 residual, see below).
- Build step: `npm run build` / `build:release` produce a clean `www/`
  with only game files — confirmed by inspection, 66 MB currently (see
  audio note below for why that's up from the last audit's 60 MB).
- Android back-button handling and the admin-mode kill switch
  (`js/build-flags.js`) are both implemented — see §7's M1 table for what
  "done" means for each given neither has run on a real device yet.

**Newly found this session (2026-07-31) — none of these were in the plan
before now:**
- **Vehicle art carries real IP exposure.** A close-up audit of the 71
  files in `assets/cars/` (prompted by this same App Store prep work,
  since Guideline 5.2 puts the burden of proof on the developer) found
  legible third-party wordmarks, a full manufacturer crest, several
  vendor watermarks, and multiple highly recognisable production-vehicle
  silhouettes. Filenames were neutralised (no pixels changed by that) and
  several offending assets have since been deleted, retouched, or held
  back — but the audit is not complete and at least one held asset (a
  branded racing/model-designation livery) is still outstanding. Full
  detail, per-file exposure list, and what's been resolved vs. still open
  lives in [ASSET-PROVENANCE.md](ASSET-PROVENANCE.md) — **read it before
  submitting; this is now P0-10 below.**
- **Ads were complete stubs**, not a partial integration — `js/ads.js`'s
  interstitial used to render a literal on-screen label reading "Ad stub
  — no mediation SDK wired in", with nothing behind any "Watch a video"
  button. That would have been Guideline 2.1 (App Completeness) the
  moment a reviewer tapped one. **2026-08-02: resolved at the code level**
  — `js/ads.js` now bridges to a real AdMob plugin on native builds; see
  P0-11 for what's done vs. still blocked on native bring-up.
- **IAP were also complete stubs** (already partially known — P0-6 below
  covers the fix): `purchase()` used to resolve `{success:true}` after a
  fixed 500 ms timer with no StoreKit/Play Billing behind it,
  `restorePurchases()` always returned `{restored:[]}`, and prices were
  hardcoded USD strings rather than store-localized. **2026-08-03:
  resolved at the code level** — `js/iap.js` now bridges to RevenueCat's
  Capacitor plugin on native builds; see P0-6 for what's done vs. still
  blocked on native bring-up.
- **No `PrivacyInfo.xcprivacy`.** Mandatory for all App Store submissions
  since May 2024 (required-reason API declarations). `MONETIZATION-
  PLAN.md` mentions this once, in passing, under deferred work — it was
  never gated into this plan's actual Apple checklist. New P0-12 below.
- **Audio re-encode is partially done, not blocked.** The last audit
  recorded this as blocked on a missing `ffmpeg`; `ffmpeg` has since been
  used successfully in this environment. All 12 Heist-mode tracks (the
  full continuous set list, plus the shared menu theme and Settings
  track) now ship as AAC in `.m4a` — **not Opus**, which matters: Opus in
  an MP4 wrapper is silent on iOS/macOS Safari's `<audio>` element even
  though it plays fine in Chromium, so verifying the codec (not just the
  file extension) genuinely mattered here and is now a standing rule in
  `CLAUDE.md`. **2026-08-03: all remaining audio is done — Relaxed's 5
  tracks were replaced** with new AAC/`.m4a` masters the developer
  supplied directly (not a re-encode of the old MP3s; the old files were
  deleted, not kept alongside), **and Pursuit's 4 tracks were re-encoded**
  from their original MP3s via `ffmpeg -c:a aac -b:a 128k -ar 48000 -ac 2`
  (matching the Heist set's measured settings; durations matched the
  source MP3s to within ~40 ms). Every file verified via `ffprobe` (all
  real `aac`, ~128-133 kbps, 48 kHz stereo — not Opus-in-`.m4a`) and a
  headless Playwright pass confirming `js/audio.js`'s Relaxed and
  Pursuit pools request the new files with 200/206 responses and no
  console errors. **The whole P1 "finish the audio re-encode" item is
  closed** — every shipped track (Heist, menu/Settings, Relaxed,
  Pursuit) is AAC in `.m4a` now, none Opus. Net effect on size: the 9
  converted files measured ~31 MB as MP3, ~21 MB as AAC (`du -ch`,
  actually measured, not estimated) — a real ~10 MB reduction, not the
  "roughly matches or beats MP3 size" wash predicted earlier in this
  section. `assets/audio/` now totals **49 MB** (measured 2026-08-03),
  down from the ~59 MB noted after Heist's 10-track expansion — so the
  P1 "≤15 MB audio" target below should be re-baselined against this
  49 MB figure, not the original 40→15 MB estimate.

**2026-08-04: `ios/` and `android/` both now exist, generated and
configured (P0-3/P0-4/P0-5 below) — the "not started, needs a Mac"
framing throughout the rest of this doc is now specifically about
*compiling and signing*, not about generating the projects in the first
place.** Neither has ever been compiled — no Xcode/macOS or Android SDK
exists in this environment to do that — but the projects, native config
files, and generated icon/splash assets are real and committed.

## 2. P0 — blockers, in dependency order

### P0-1. Build step + webDir (repo work, no Mac needed) — ✅ done
`tools/build-www.mjs` copies exactly `index.html`, `css/`, `js/`,
`assets/` into `www/` (gitignored); `capacitor.config.json`'s `webDir` is
`"www"`. `npm run build` / `npm run build:release` both confirmed working.

### P0-2. Fix the fonts (repo work) — ✅ done
Real Inter (Variable) and Chakra Petch (500/600/700) woff2 files are in
`assets/fonts/`, verified via `file` as genuine WOFF2. OFL license text
for both families now ships alongside them (`assets/fonts/Inter-OFL.txt`,
`assets/fonts/ChakraPetch-OFL.txt`) — not required by Apple/Google, but
the honest thing to do for an OFL font.

### P0-3. Android platform bring-up — ✅ generated + configured, unverified compile
Done 2026-08-04: `npx cap add android` was run (confirmed cross-platform —
it's pure templating, no Android SDK needed for this step) and
`android/` is now committed, not gitignored (`.gitignore` updated —
this app has real hand-maintained native config that a fresh `cap add`
wouldn't reproduce). `applicationId` is already `app.midnightgarage`
via `capacitor.config.json`. Configured: `android:screenOrientation=
"portrait"` on `MainActivity`, `targetSdkVersion`/`compileSdkVersion`
bumped to **35** in `android/variables.gradle` (min SDK stays the
Capacitor 6 default, 22), a `com.google.android.gms.ads.APPLICATION_ID`
meta-data entry using Google's public test App ID (verified via search,
not guessed — see P0-11's own AdMob work) so the app doesn't crash on
first launch before a real AdMob account exists.

**Not done / blocked:** Play App Signing enrollment (console-side).
**Not verified:** this environment has no Android SDK/JDK toolchain
beyond bare `java`/`javac`, so `./gradlew assembleDebug` was never run —
the manifest/gradle edits are believed correct (validated as
well-formed XML, matches documented Capacitor/AdMob conventions) but
unverified to actually compile. First real build should happen in CI
(Codemagic/GitHub Actions) or Android Studio, whichever comes first.

### P0-4. iOS platform bring-up — ✅ generated + configured, unverified compile (still needs a Mac to actually build)
Done 2026-08-04, same caveat structure as P0-3: `npx cap add ios` also
runs fine outside macOS (confirmed empirically — it's templating, only
the actual Xcode build step is Mac-locked) and `ios/` is now committed.
Configured in `Info.plist`: `UISupportedInterfaceOrientations` trimmed
to portrait-only on iPhone (iPad kept portrait + upside-down, per the
P1 "iPhone-only for v1.0" recommendation not yet being a final
decision), `ITSAppUsesNonExemptEncryption = false`,
`NSUserTrackingUsageDescription` (needed for P0-11's ATT flow),
`GADApplicationIdentifier` set to Google's public test App ID (same
crash-avoidance reasoning as Android — the Mobile Ads SDK validates
this key's format at init and a `[FILL IN]`-style placeholder string
would crash the app on first native launch, confirmed via research, not
assumed), and a minimal `SKAdNetworkItems` array (Google's own
`cstr6suwn9.skadnetwork` ID only — the dozens of additional
third-party-buyer IDs Google publishes are a living list, deliberately
not hardcoded stale; pull the current set from
developers.google.com/admob/ios/ios14 before submission). `AppDelegate.
swift` now sets `AVAudioSession` category `.ambient` + `.mixWithOthers`
at launch, addressing the Heist-continuous-set-list concern this item
originally flagged. `resources/PrivacyInfo.xcprivacy` was copied into
`ios/App/App/` **and** properly registered in the Xcode project's
Resources build phase — using the `xcodeproj` Ruby gem (the same tool
fastlane/CocoaPods use internally) rather than hand-editing
`project.pbxproj`'s UUIDs directly, then round-trip-verified by
re-opening the project and confirming the file appears in the target's
resources list.

**Still needs an actual Mac (or cloud equivalent)** for: `pod install`
(CocoaPods isn't installable in this environment), `xcodebuild`
archive/build, code signing, and any real device/simulator
verification. None of the above has been compiled even once — it's
believed structurally correct (valid plist/XML, `xcodeproj` gem
round-trip passed) but that is not the same as "builds." See the "no
Mac" discussion below (§7) for how to close this gap without owning
Apple hardware.

### P0-5. Icons + splash for both platforms — ✅ done, generated and verified (not yet seen on a device/simulator)
Use `@capacitor/assets` with `assets/icon.svg` as source. Concrete specs,
worth stating explicitly since getting this wrong is an easy silent
rejection:
- **App Store icon: 1024×1024 PNG, no alpha channel, no transparency, no
  pre-rounded corners** (Apple composites the mask itself — a
  transparent or already-rounded source is rejected or looks wrong).
  `@capacitor/assets generate` handles this correctly from a source SVG,
  but it's worth a manual check of the generated 1024px PNG before
  upload (`file` or an image inspector should report no alpha channel).
- Full iOS icon set + Android adaptive icon (foreground layer +
  `#0b0e14` background layer).
- Splash screens both platforms, from the dark background + centered
  mark — not the photographic start-screen stills (those are already
  the in-app start screen; splash should be quieter and load-time-
  neutral).

Done 2026-08-04: `npx @capacitor/assets generate` was actually run
against the real `ios/`/`android/` projects (previously blocked on
those existing — now unblocked, since P0-3/P0-4 above generated them).
The App Store icon was verified directly — not just assumed correct —
by reading the PNG's own IHDR chunk: 1024×1024, color type 2 (RGB, no
alpha channel), exactly matching Apple's requirement. Modern single-size
`AppIcon.appiconset/Contents.json` format (Xcode 14+), not the old
full-matrix icon set. Android adaptive icon layers + all splash density
variants generated for both platforms. **Still not seen rendered on an
actual device or simulator** — that needs the same Mac/CI access as
P0-4.

### P0-6. Real IAP: one non-consumable, "Pro Garage" — ✅ code-level integration done, native bring-up still blocked
Decided/built 2026-08-03, same shape as P0-11's AdMob work: `js/iap.js`
now bridges to `@revenuecat/purchases-capacitor` (added to
`package.json`, `^9.2.2` — the latest version whose peer dependency is
`@capacitor/core ^6.0.0`, matching this repo's Capacitor 6; the plugin's
own "latest" tag, 13.x, requires Capacitor 8) on native builds, while
keeping the exact original dev/web stub behavior when no native bridge is
present, so nothing above `js/iap.js` in the call chain (`js/game.js`'s
`purchaseProduct()` and `restore()`) needed to change — verified by
re-reading every call site against the new file's exported contract, and
by a headless Playwright pass confirming the stub path (`purchase()`,
`restorePurchases()`, `PRODUCTS` mutation) behaves identically to before.

What's actually implemented, read out of the real installed package
(`node_modules/@revenuecat/purchases-capacitor/dist/esm/definitions.d.ts`
+ `node_modules/@revenuecat/purchases-typescript-internal-esm/dist/*.d.ts`,
fetched the same way as P0-11's AdMob source — via `registry.npmjs.org`,
which the sandbox's outbound proxy allows even though GitHub/unpkg/
jsdelivr are blocked):
- `configure({apiKey})` + `getProducts({productIdentifiers, type:
  'NON_SUBSCRIPTION'})` fetched once at module load (fire-and-forget, not
  awaited by any caller) so real store-localized `priceString` values are
  ready before a player is likely to reach any paywall — `PRODUCTS[sku]
  .price` is mutated in place (never reassigning the exported object
  itself), so `js/game.js`'s existing `updateShopUI()` picks the real
  price up automatically the next time it renders. No more hardcoded USD
  strings once a real project exists.
- `purchase(sku)` → `purchaseStoreProduct({product})` using the cached
  real product object (RevenueCat needs the full product, not just an id
  string); any failure — real error or the user cancelling the sheet —
  resolves `{success: false}`, matching `js/game.js`'s existing silent-
  no-op handling of a failed purchase exactly.
- `restorePurchases()` → RevenueCat's own `restorePurchases()`, checking
  `customerInfo.entitlements.active[sku]?.isActive` for each
  non-consumable sku. **This assumes the RevenueCat dashboard defines one
  entitlement per non-consumable product, named identically to the
  product's own sku** (`pro_garage`, `remove_ads`) — a standard, simple
  setup for an app with no subscription tiers; if the real project uses
  different entitlement names, `js/iap.js`'s lookup needs to match.
  Consumables (Wrench packs) are correctly never part of restore, same as
  any other store's non-consumable-only restore behavior.

**Still blocked on M2 (native platform bring-up, needs a Mac + real
accounts — not available in this environment), same boundary as P0-11:**
- An actual RevenueCat project + both platforms' apps configured there,
  to get real (non-placeholder) SDK keys — `js/iap.js` currently ships
  `[FILL IN RevenueCat iOS/Android SDK key]` markers.
- The 5 real products (`remove_ads`, `pro_garage`, 3 wrench packs)
  created in App Store Connect / Play Console AND mapped in RevenueCat's
  dashboard, plus the entitlement-identifier assumption above actually
  confirmed against whatever the real dashboard ends up using.
- Real-device verification: does `purchaseStoreProduct()` actually
  complete a StoreKit/Play Billing sandbox purchase, does `restore()`
  correctly recover a prior non-consumable after reinstall, do the
  fetched `priceString` values render correctly for a non-US locale. None
  of this is checkable in this headless sandbox.
- **Receipt validation / server-side entitlement check.** `save.pro` is
  still a client-side boolean in editable local storage even after this
  integration — RevenueCat's own backend is the source of truth for
  `customerInfo`, but nothing here pushes that back through a server
  check (the Supabase project already exists, per MONETIZATION-PLAN.md
  §5.3) before trusting the local flag. Explicitly out of scope for this
  pass — it's a separate, larger initiative (a Supabase edge function +
  RevenueCat webhook), not part of "integrate the plugin."
- `starter_bundle` SKU (from MONETIZATION-PLAN.md's product table) was
  never added to `PRODUCTS` in the first place — still not shipped,
  unrelated to this integration.

### P0-7. Android back button — ✅ implemented, unverified on-device
`@capacitor/app` is installed; `backButton` handling exists in
`js/game.js` (closes the topmost non-dismissable overlay, else returns to
start screen, else `App.exitApp()`). Verified via a temporary
Playwright-exposed hook driving all four branches, then removed before
committing — genuinely tested logic, but the real native `backButton`
event itself is still unexercised, since that only becomes possible once
P0-3 produces an actual Android build.

### P0-8. Admin mode vs. App Review — ✅ done
`js/build-flags.js`'s `ADMIN_ENABLED` is flipped to `false` by
`tools/build-www.mjs --release`; verified with Playwright that 5 taps on
the title in a release build leaves the admin chip/bar unreachable. A
non-release build (anyone running `npm run build` without `--release`)
still ships the admin backdoor — this is a **manual step, not an
automatic one**, worth double-checking on whatever build actually gets
archived and uploaded, since the failure mode (admin tools live in a
shipped build) is silent.

### P0-9. Store-listing text, privacy policy, support page
Every text asset needed for both consoles' listings, in one place so
nothing gets improvised at submission time:

| Asset | Where it's used | Notes |
|---|---|---|
| Promotional text (170 char) | App Store | can be updated anytime without a new build |
| App Store description (4000 char) | App Store | |
| Play short description (80 char) | Play | |
| Play full description (4000 char) | Play | shorter paragraphs/bullets, not ALL-CAPS headers |
| Keywords (100 char, comma-sep) | App Store search | singular forms, don't repeat the app name's own words |
| Copyright line | App Store | `2026 <legal name>` |
| App Review notes | both, internal only | this app needs **no test account** — no sign-in exists at all; say so explicitly so a reviewer doesn't go looking for a login screen |
| Privacy policy (hosted HTML) | both, mandatory | see below — should be a short, true document given the current config |
| Support page (hosted HTML) | both, mandatory (Apple) | FAQ + contact email is enough |
| Terms of Service (hosted HTML) | optional but cheap to have | |
| Release notes, v1.0 | both | "Initial release" is fine |

With `js/config.js` left blank the privacy policy is genuinely one honest
paragraph: nothing collected, nothing leaves the device, no accounts, no
third-party SDKs phoning home. **Decision, unchanged: ship v1.0 with
analytics OFF (blank config).** Makes both privacy forms trivially clean
("No data collected"), removes the only network dependency, and the
funnel can be enabled in 1.0.1 once the Supabase project + updated
privacy labels are ready together.

Trademark/handle check for "Midnight Garage" (PLAN-STATUS 0.1's open
flag) belongs here too — do it **before** creating store listings, since
a rename after listing creation is far more work than before.

**Done 2026-08-04 (web search, not a paid trademark-clearance search —
treat as a first pass, not a legal opinion):**
- **No exact-title collision** on either the App Store or Play Store —
  no app currently listed as "Midnight Garage" on either platform, so
  the store-level name reservation itself should go through cleanly.
- **No federal USPTO trademark registration found** for "Midnight
  Garage" specifically.
- **Real risk found anyway: multiple existing automotive businesses
  already trade under this exact name**, most notably an active car
  customization shop in Fremont, CA (midnight77.com, operating since
  2020, Yelp/Instagram/Facebook presence, D&B company profile) plus
  several smaller car-culture brands/shops (MidnightGarageShop.com,
  garagemidnight.com, "Midnight Garage LTD"). None of these appear to
  hold a registered federal trademark, but common-law trademark rights
  exist from actual commercial use regardless of registration — and
  "Midnight Garage" being independently reused by several unrelated
  car-themed businesses already suggests it's a generically appealing
  phrase in this exact space, not a distinctive, ownable-feeling name.
  Low near-term risk (a local auto shop is unlikely to pursue a mobile
  game over a name), but not zero, and worth being aware of rather than
  assuming the name is clean because no exact app-store collision
  turned up. A real decision for the developer, not something this
  research resolves on its own.

### P0-10. Vehicle art IP clearance — ✅ every flagged asset removed, replacements pending
Not previously tracked anywhere in this plan until this session's audit.
Full detail lives in [ASSET-PROVENANCE.md](ASSET-PROVENANCE.md).
- Filenames/color-tags/comments naming real marques were neutralised
  (hygiene only — changed no pixels; this alone didn't clear anything).
- 2026-08-02: **every flagged asset was removed from the shipped pool at
  the developer's direction** — 29 files deleted (24 pool entries + 5
  already-orphaned files sharing a flagged model), `verify-levels.mjs`
  still green, live render confirmed zero errors. `ASSET-PROVENANCE.md`
  has the full removed-file list with body-type descriptions for
  briefing replacements — roughly 15 distinct designs cover the 29 files
  (two are many-to-one: an 11-file wedge-body recolor set, and a
  2-file same-model hypercar pair).
- **Blocking**: the game now needs replacement art for those ~15
  silhouettes before it has its previous variety back — this isn't
  release-blocking in the sense of "can't ship," since the pool still
  passes every invariant with 34 sedans, but it's a real content gap
  worth closing before launch, not after.
- Two items were surfaced but deliberately **not** auto-resolved —
  see ASSET-PROVENANCE.md's "intentionally NOT removed" note: two
  library recolors sharing a just-removed body's silhouette (never
  explicitly named as flagged, so left for a decision rather than swept
  up by inference), and the generic police livery (always framed as
  low-risk/confirm-only, not a flagged exposure).
- The audit itself is **not proven exhaustive** — it covers the assets
  actually looked at closely, not a guaranteed-clean sweep of all 71
  files; ASSET-PROVENANCE.md says plainly where its own coverage stops.

This is a real Guideline 5.2 exposure, not a style nit — treat it as
release-gating alongside the IAP/ads work, not as post-launch cleanup.

### P0-11. Ads: integrate a real network — ✅ code-level integration done, native bring-up still blocked
Decided 2026-08-02 by the developer: **integrate AdMob for real**, not cut
ads. `js/ads.js` now bridges to `@capacitor-community/admob` (added to
`package.json`, `^6.2.0` — matched to this repo's Capacitor 6 core, not
the plugin's own latest `8.0.0`, which requires Capacitor 8) on native
builds, while keeping the exact original dev/web stub behavior when no
native bridge is present, so nothing above `js/ads.js` in the call chain
(`js/game.js`'s rescue/offer/shop-watch and interstitial-eligibility
flows) needed to change — verified by re-reading every call site against
the new file's exported contract.

What's actually implemented, read out of the real installed package
(`node_modules/@capacitor-community/admob/dist/esm/**`, not guessed or
summarized from docs — the sandbox's outbound proxy blocks GitHub/unpkg/
jsdelivr but not `registry.npmjs.org`, which is how the real source got
fetched):
- `initialize()` + the full consent (UMP) and ATT (iOS 14.5+) flow before
  any ad is requested. Default is deliberately closed: no personalized
  ads unless consent is affirmatively `OBTAINED`/`NOT_REQUIRED` **and**
  ATT is `authorized`; if consent info can't even be read (offline,
  misconfigured), no ads are requested at all rather than guessing a
  region doesn't need one.
- Rewarded (`prepareRewardVideoAd`/`showRewardVideoAd`), interstitial
  (`prepareInterstitial`/`showInterstitial`), and banner
  (`showBanner`/`hideBanner`) all wired to real plugin calls, gated on
  the resolved consent state. Events (`onRewardedVideoAdReward`,
  `interstitialAdDismissed`, etc.) are real enum string values read from
  the package source, not assumed from README prose.
- Google's official public TEST ad unit IDs ship as the working default
  (`AD_TEST_MODE = true` in `js/ads.js`) — safe to build/submit as-is,
  since they only ever serve clearly-labelled test creatives. Each
  platform/format slot has a `[FILL IN production ID]` marker next to it
  for when this app's own AdMob account exists.
- Banner stays `BANNER_ENABLED = false` — integrating the SDK is a
  separate decision from turning the banner on, per MONETIZATION-PLAN.md
  §5.2's "default it off until data justifies it."

**Still blocked on M2 (native platform bring-up, needs a Mac + real
accounts — not available in this environment):**
- An actual AdMob account + registered app to get real (non-test) ad
  unit IDs and an AdMob App ID.
- The AdMob App ID has to go into `ios/App/App/Info.plist`
  (`GADApplicationIdentifier`) and `android/app/src/main/
  AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`
  meta-data) — unlike `PrivacyInfo.xcprivacy`, this can't be staged as a
  standalone file in `resources/` ahead of time, since `ios/`/`android/`
  don't exist yet (P0-3/P0-4). Do this as part of that native bring-up,
  not forgotten as a separate later step.
- iOS also needs the `SKAdNetworkItems` list in `Info.plist` for AdMob's
  mediated networks — same blocker, same timing.
- Real-device verification of the whole flow: does the UMP consent form
  actually render for an EEA-simulated test device, does the ATT prompt
  fire correctly on a real iOS build, do real (test-ID) ads actually
  load and show. None of this is checkable in this headless sandbox —
  the web/dev path was verified with Playwright (stub renders, resolves,
  no console errors; `npm run verify` still green), but that only proves
  the non-native branch and the call contract, not the AdMob bridge
  itself.
- `docs/store-listing/data-safety.md` and `privacy-policy.html`'s
  "Advertising" sections still say `[FILL IN once P0-11 is finalized]` —
  now fillable in outline (AdMob, non-personalized-by-default, consent
  form shown where required) but worth a final pass once the above
  native testing confirms the flow actually behaves as coded.

### P0-12. Privacy manifest (`PrivacyInfo.xcprivacy`)
Mandatory for every App Store submission since May 2024: a manifest
declaring required-reason API usage (even indirect, via a dependency)
and, once analytics is ever turned on, the data-collection summary that
should match the App Privacy nutrition label exactly. With analytics off
for v1.0 this is a short, honest file — but it still needs to exist; its
absence is a binary-validation failure at upload, not a review-time
judgment call, so it blocks submission outright rather than risking
rejection.

## 3. P1 — polish that should precede review

- ~~Finish the audio re-encode.~~ **Done 2026-08-03.** Relaxed's 5 tracks
  were replaced with new AAC masters the developer supplied; Pursuit's 4
  were re-encoded from their original MP3s via `ffmpeg -c:a aac -b:a
  128k -ar 48000 -ac 2`, matching the Heist set. See ASSET-PROVENANCE.md
  and §1 above for verification detail and the re-baselined size figure
  (`assets/audio/` now 49 MB, measured — the P1 "≤15 MB audio" target
  predates the 10-track Heist set list and is stale; treat 49 MB as the
  real current baseline to shrink from, not 15 MB).
- **Background/interruption QA**: backgrounding mid-Pursuit (timer must
  freeze or the level must fail gracefully, not silently keep counting),
  phone-call interruption during music, resume after lock screen.
  `js/analytics.js` handles visibilitychange; audio needs the same QA
  natively — and now specifically needs checking against Heist's
  continuous set-list behavior (`CONTINUOUS_MODES` in `js/audio.js`):
  a level boundary must not cut or restart the music, including across
  a backgrounding event.
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
- **Full-locale smoke test** in the native shells (the ja/ko/zh/ru
  strings have only ever rendered in desktop Chromium).
- **End-to-end pass as a first-time player**, on a real device once one
  exists: fresh install, work through the intro/mode picker, play a
  handful of levels across all three modes, background and resume
  mid-level, force-quit and relaunch (does progress persist?), rotate
  where relevant. This app has no accounts/sign-up to test, which
  simplifies this pass relative to most checklists — but "no crashes,
  no dead ends, no placeholder content" still needs a live run-through,
  not just the automated verify script.

## 4. P2 — explicitly deferred past v1.0

- Game Center / Play Games leaderboards + achievements, cloud save
  (Preferences → iCloud KV / Play backup) — PLAN-STATUS 1.2.
- Analytics-on (Supabase) + updated privacy labels — v1.0.1.
- App preview video / ASO iteration — post-launch.
- Rewarded-video hint refill — the ad-SDK decision this was blocked on
  is now made (P0-11, AdMob integrated), but adding a new rewarded
  placement is a separate product call the developer hasn't made; stays
  deferred until asked for.
- Chapters 8–10 gate/hitch variety (see VARIETY-PLAN §10 — needs a new
  generator strategy, not release-gating).

## 5. Apple submission checklist

| Item | Notes |
|---|---|
| Developer Program account active | $99/yr, needs D-U-N-S if company |
| App record, bundle id `app.midnightgarage` | matches capacitor.config.json — **and is permanent once set, cannot change after first submission** |
| Agreements, tax, banking complete | blocks paid IAP silently if skipped |
| IAP product `pro_garage` (non-consumable) approved | submit WITH the binary first time; code-level integration done, real RevenueCat project + App Store Connect product still needed — P0-6 |
| Restore purchases functional | 3.1.1 — code-level integration done (`js/iap.js` calls RevenueCat's real `restorePurchases()`), on-device verification still needed — P0-6 |
| AdMob real ad unit IDs + App ID in `Info.plist`/`SKAdNetworkItems` | code-level integration done, `Info.plist` wired with Google's test App ID + Google's own SKAdNetwork ID (crash-safe default); real AdMob account still needed to swap in production values — P0-11 |
| Vehicle art IP exposure resolved or accepted as a known risk | P0-10, ASSET-PROVENANCE.md |
| `PrivacyInfo.xcprivacy` present | P0-12 |
| Privacy nutrition labels: "Data not collected" | true only with blank config (P0-9) |
| `ITSAppUsesNonExemptEncryption = NO` | HTTPS-only exemption |
| Age rating questionnaire → 4+ | no UGC exposure (Sandbox is local + admin-gated); no sign-in of any kind |
| App icon 1024×1024, no alpha channel | P0-5 — a common, easy-to-miss silent-rejection cause |
| Screenshots: current iPhone + iPad size classes (+iPad only if iPad enabled) | portrait; **confirm exact current pixel dimensions in App Store Connect at submission time** — Apple's required sizes shift as new device sizes ship, so treat any number written down today as a snapshot, not a fixed spec |
| Support URL + privacy policy URL | P0-9 |
| Hidden-feature stance on admin mode | P0-8 — kill switch is implemented; confirm the actual build being uploaded used `--release` |
| App Review notes: no test account exists/needed | this app has no sign-in — say so explicitly, don't leave the reviewer looking for a login screen |
| TestFlight internal → external pass | full IAP sandbox test incl. restore |

## 6. Google Play submission checklist

| Item | Notes |
|---|---|
| Play Console account | **if a NEW personal account: 12 testers for 14 days closed-testing requirement before production — this is the schedule long-pole; start closed testing the moment a build exists** (org accounts exempt) |
| AAB build, Play App Signing enrolled | AAB mandatory |
| targetSdk 35 (plan 36 by ~Aug 2026) | P0-3 |
| Upload keystore backed up somewhere safe outside this repo | generated on first `android/` signing setup — **lose it and you can never update the app under the same listing**; Play App Signing means Google can help recover the *signing* key but not this *upload* key |
| IAP product `pro_garage` + license testers | test purchases without spending; code-level integration done, real RevenueCat project + Play Console product still needed — P0-6 |
| AdMob App ID + real ad unit IDs wired into `AndroidManifest.xml` | code-level integration done, manifest wired with Google's test App ID (crash-safe default); real AdMob account still needed to swap in production values — P0-11 |
| Data safety form: no data collected/shared | true only with blank config |
| Content rating (IARC questionnaire) → Everyone | |
| Feature graphic (1024×500px) + app icon (512×512px) + phone screenshots | store listing requirements, separate from the App Store assets |
| Privacy policy URL | mandatory regardless of collection |
| Pre-launch report reviewed | free crawler QA on real devices, fix what it flags |
| Hardware back button behaves | P0-7 |

## 7. Suggested sequence

**M1 — repo-only, no accounts or Mac needed:**

| Item | Status |
|---|---|
| P0-1 build step (`tools/build-www.mjs`, `webDir` fixed) | ✅ done |
| P0-2 real fonts + OFL licenses | ✅ done — `assets/fonts/{Inter,ChakraPetch}-OFL.txt` added |
| P0-7 back-button handler | ✅ done (logic verified via a temporary test hook, not a shipped keyboard shim) |
| P0-8 admin kill switch (`js/build-flags.js`) | ✅ done, verified |
| `@capacitor/android` + `@capacitor/app` deps | ✅ done |
| P0-5 icon/splash | ✅ done — generated for real via `@capacitor/assets`, App Store icon verified 1024×1024/no-alpha at the byte level |
| P1 audio re-encode | ✅ done — every shipped track (Heist's 10 + menu/Settings + Relaxed's 5 + Pursuit's 4) is AAC in `.m4a`, verified via `ffprobe` |
| P0-10 vehicle art IP audit | ✅ every flagged asset removed (29 files); 🟡 ~15 replacement designs needed before variety is back to where it was — see ASSET-PROVENANCE.md |
| P0-3 Android platform bring-up | ✅ `android/` generated + committed, portrait lock + targetSdk 35 + AdMob test App ID configured; 🟡 never compiled (no Android SDK in this environment) |
| P0-4 iOS platform bring-up | ✅ `ios/` generated + committed, portrait lock + ATT string + AVAudioSession + PrivacyInfo.xcprivacy (properly registered in Xcode's Resources build phase, not just copied) configured; 🟡 never compiled (no macOS/Xcode in this environment) — see §7's "no Mac" plan for closing this specific gap |
| P0-11 ads integration | ✅ code-level integration done AND real AdMob test App ID wired into both platforms' native config (crash-safe default, not a placeholder string); 🟡 real AdMob account + on-device testing still needed at M2 — see P0-11 |
| P0-12 privacy manifest | ✅ done — staged **and** now actually placed in `ios/App/App/` with real Xcode-project resource membership, not just staged in `resources/` |
| P0-9 store-listing text + privacy/support pages | ✅ drafted in `docs/store-listing/` — search for `[FILL IN]` before submitting |
| P0-6 real IAP | ✅ code-level integration done (`js/iap.js` bridges to `@revenuecat/purchases-capacitor`, web/dev stub preserved, `npm run verify` + Playwright smoke test both green); 🟡 real RevenueCat project, both platforms' store products, and on-device testing still needed at M2 — see P0-6 |

Note on P0-7's testing: rather than shipping a keyboard shim into
production code (Escape-key-triggers-back is exactly the kind of
surprise behavior that shouldn't ride along to a store build for
developer convenience), the back-button logic was verified by
temporarily exposing the handler function on `window`, driving all four
branches with Playwright, then removing the expose before committing.
The plugin-access pattern itself (`globalThis.Capacitor?.Plugins?.App`)
means the real native event is still what's untested — that only
becomes possible once P0-3/P0-4's projects actually get **compiled**,
not just generated and configured (see below — that's now the whole
remaining gap, not native config work).

**M2 — the part that actually needs Xcode/a Mac (or a cloud equivalent
— see the dedicated "no Mac" plan a few sections down):** everything
that requires *compiling*, not just generating/configuring, is now
concentrated here: `pod install`, `xcodebuild`/Gradle actually building
both platforms, code signing, TestFlight/Play upload, and on-device or
simulator verification (icon/splash rendering, audio session behavior,
the AdMob/RevenueCat native bridges actually initializing). Also here:
real developer accounts (Apple Developer Program, Play Console,
RevenueCat project, AdMob account) and the store products they need to
contain (P0-6, P0-11), physical-device QA matrix, and background/audio
QA (now including the Heist continuous-set-list behavior specifically —
the audio re-encode itself is done, see P1 above). **What used to be
here and now isn't:** `cap add ios`/`cap add android` and all their
native config (P0-3/P0-4), and `@capacitor/assets generate` (P0-5) —
all three turned out not to need macOS at all and are done as of
2026-08-04.

**No Mac available? M2 is still doable.** `codemagic.yaml` (repo root)
+ [`docs/CI-SETUP.md`](CI-SETUP.md) run the whole compile-sign-upload
step on a cloud Mac instead of physical Apple hardware — connect a
Codemagic account, add the signing credentials CI-SETUP.md walks
through, push, and the pipeline builds + uploads to TestFlight/Play
without ever touching a real Mac. A rented remote Mac (MacStadium,
MacinCloud, AWS EC2 Mac instances) is the fallback if something ever
needs interactive Xcode debugging a CI log can't show.

**M3 — store operations (parallel with M2's tail):**
Trademark check → listings, screenshots, privacy policy + support page
(P0-9), TestFlight + Play closed testing (start Play's 14-day clock
ASAP if on a personal account), IAP sandbox passes on both, submit.

Realistic effort: M1 is a few days of repo work — longer than the
2026-07-26 estimate now that P0-10/11/12 have been added, since the
asset-IP work in particular isn't fully bounded yet. M2/M3 are dominated
by account setup, the Play 14-day testing clock (if applicable), and
review turnaround (1–3 days Apple, hours–days Google) — call it 3–4
weeks calendar time from starting M2, mostly waiting, not working.

## 8. Acceptance = ready to submit

- [x] `npm run build` produces a `www/` with only game files; `cap sync`
      bundles nothing else. (`npm run build:release` additionally
      disables admin mode.)
- [x] Real fonts load with zero console errors (verified via
      `document.fonts` + a Playwright console-error check).
- [x] IAP: code-level RevenueCat integration done, not the old stub.
      (P0-6.)
- [ ] Fresh-install purchase AND restore succeed in Apple sandbox and
      Play license testing; web build still sandbox-unlocks. Needs a
      real RevenueCat project + store products + on-device testing.
      Blocked on M2. (P0-6.)
- [x] Android back button never hard-exits from an overlay or mid-level.
      (Logic verified in Chrome; the real native `backButton` event
      still needs an actual Android build to confirm end-to-end.)
- [x] Admin mode unreachable in release builds (or disclosed in notes).
      Verified with Playwright: 5 taps on the title in a `--release`
      build leaves the admin chip/bar hidden.
- [x] Ads: code-level AdMob integration done, not the old stub. (P0-11.)
- [ ] AdMob App ID/real ad unit IDs wired into native manifests and
      verified on a real device (consent form, ATT prompt, actual ad
      fill). Blocked on M2. (P0-11.)
- [ ] Vehicle art IP exposure resolved or knowingly accepted, not
      silently shipped. (P0-10.)
- [ ] `PrivacyInfo.xcprivacy` present and accurate. (P0-12.)
- [x] All Heist/Pursuit/Relaxed/menu/Settings audio ships as AAC, none as
      Opus-in-.m4a; verified via `ffprobe`, not by file extension. (P1,
      done 2026-08-03.)
- [ ] Both privacy forms filed as "no data collected"; policy URL live.
- [ ] Pursuit timer behaves across backgrounding on both platforms; Heist
      set-list music survives backgrounding without cutting/restarting.
- [ ] All 10 locales spot-checked in native shells.
- [ ] verify-levels.mjs green on the exact commit that gets tagged.

## 9. Reconciliation against the generic "Expo → App Store" checklist

The user supplied a general-purpose guide for shipping an Expo-managed
app. Since this repo is Capacitor-based (§0), most of its exact commands
don't apply — but the guide is a reasonable checklist in the abstract, so
here's what carried over into this plan and what didn't, and why.

**Folded in above, genuinely useful regardless of toolchain:**
- The concrete list of text assets needed for a store listing (promo
  text, description, keywords, copyright line, review notes, privacy/
  support/ToS pages) — now §2's P0-9 table.
- "1024×1024, no alpha channel" as an explicit icon gotcha — now P0-5.
- The reminder that Play's upload keystore, once lost, can never be
  recovered the way Apple's signing can't be either — now in §6.
- The general "test as a first-time user" E2E discipline — folded into
  §3's new end-to-end pass item, adapted to this app's actual shape (no
  accounts, no sign-up, so several of the guide's specific steps like
  "log out and log back in" don't apply and were dropped rather than
  kept as dead checklist items).
- Its list of common Apple rejection reasons (crashes, incomplete
  metadata, Guideline 2.1/2.3/4.0/5.1.1, sign-in issues) is a reasonable
  quick-reference; not reproduced verbatim here since this plan's own
  §5/§6 checklists already cover the specific ways *this app* could hit
  each one, which is more useful than the generic list.

**Deliberately not carried over:**
- Every `eas build` / `eas submit` / `eas.json` / `eas credentials`
  command — this repo has no EAS project and isn't going to get one;
  the equivalent steps are P0-3/P0-4 (`cap add` + native IDE build) and
  the manual TestFlight/Play Console upload flows already in §5–§7.
- `app.json`'s `bundleIdentifier`/`ITSAppUsesNonExemptEncryption`/
  `infoPlist` fields — this app's equivalents live in
  `capacitor.config.json` and the native `Info.plist` that P0-4 generates
  once `ios/` exists, not in an Expo config file that doesn't exist here.
- The Google Play "Service Account Key for EAS" section (A.5/A.6 in the
  source guide) — that's specifically for EAS's automated upload; a
  Capacitor project uploads the AAB through Play Console directly (or a
  Gradle-level Play publish plugin, if that gets automated later), never
  through EAS.
