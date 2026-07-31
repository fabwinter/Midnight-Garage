# STORE-SHIP-PLAN: remaining work to ship on the App Store + Google Play

Status: **plan — not started.** Originally written 2026-07-26 from a fresh
audit of the repo; revised 2026-07-31 after a second audit (asset IP,
ads/IAP stubs, privacy manifest) and after reconciling against a generic
"Expo app → App Store" guide the user supplied (§9 below explains what did
and didn't carry over). Read [CLAUDE.md](../CLAUDE.md) first.
[PLAN-STATUS.md](PLAN-STATUS.md) tracks the game itself;
[ASSET-PROVENANCE.md](ASSET-PROVENANCE.md) tracks art/audio rights in
detail; this doc covers only the distance between "the web game is done"
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
- **Ads are complete stubs**, not a partial integration. `js/ads.js`'s
  interstitial renders a literal on-screen label reading "Ad stub — no
  mediation SDK wired in"; `adsAvailable()` is hardcoded `true` so every
  "Watch a video" button is live and clickable with nothing behind it.
  This was never called out as a P0 item before — it's Guideline 2.1
  (App Completeness) the moment a reviewer taps one. See new P0-11.
- **IAP are also complete stubs** (already partially known — P0-6 below
  covers the fix), confirmed again this session: `purchase()` resolves
  `{success:true}` after a fixed 500 ms timer with no StoreKit/Play
  Billing behind it, `restorePurchases()` always returns `{restored:[]}`,
  and prices are hardcoded USD strings rather than store-localized.
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
  `CLAUDE.md`. Pursuit's 4 tracks and Relaxed's 5 are **still MP3, not
  yet re-encoded.** Net effect on size: audio grew from ~40 MB to **59
  MB** in this same window (Heist went from 1 track to a 10-track
  continuous set list — a deliberate music/UX decision made this
  session, independent of the store-prep work), so the P1 "≤15 MB audio"
  target below needs re-baselining once Pursuit/Relaxed are converted —
  AAC at the same bitrate roughly matches or beats MP3 size, so
  converting the remaining 9 files should claw back a few MB, not the
  large win the original 40→15 MB estimate implied.

**Scaffolded only / stubbed (carried over, still accurate):**
- `npx cap add ios` has never been run — no `ios/` project exists.
- `npx cap add android` has never been run either — the dependency is
  present but no `android/` project has been generated.
- No native app icons or splash assets generated yet — source art exists
  in `resources/` (see P0-5's status in §7), but nothing has gone through
  `@capacitor/assets generate` because that needs a platform to exist
  first.

## 2. P0 — blockers, in dependency order

### P0-1. Build step + webDir (repo work, no Mac needed) — ✅ done
`tools/build-www.mjs` copies exactly `index.html`, `css/`, `js/`,
`assets/` into `www/` (gitignored); `capacitor.config.json`'s `webDir` is
`"www"`. `npm run build` / `npm run build:release` both confirmed working.

### P0-2. Fix the fonts (repo work) — ✅ fonts fixed, licenses still owed
Real Inter (Variable) and Chakra Petch (500/600/700) woff2 files are in
`assets/fonts/`, verified via `file` as genuine WOFF2. Still owed: the
OFL license text for both families should ship alongside them (a
`LICENSE` file per family, or one combined file) — cheap, and Apple/Google
don't require it, but it's the honest thing to do for an OFL font and
costs nothing to add before submission.

### P0-3. Android platform bring-up
`@capacitor/android` dep is present; `npx cap add android` has not been
run. Once it is: commit the `android/` project, set applicationId
(`app.midnightgarage`), portrait-lock the activity, min SDK per Capacitor
6 default (22/23), **targetSdk 35** (Play's current floor for new apps;
36 becomes the floor ~Aug 2026 — building against 35+ now keeps both
dates safe). Play App Signing at console setup.

### P0-4. iOS platform bring-up (needs a Mac + Xcode)
`npx cap add ios` → commit `ios/`. Portrait lock, launch storyboard from
the splash assets, `AVAudioSession` category `.ambient` (music apps keep
playing — this matters concretely now that Heist runs a real continuous
set list, not a single loop), `ITSAppUsesNonExemptEncryption = NO` in
Info.plist (HTTPS-only → export-compliance exempt, and the app is fully
offline by default anyway).

### P0-5. Icons + splash for both platforms
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
Status: source images exist in `resources/` and were verified by direct
inspection (readable at 1024px, adaptive-icon safe zone respected, real
alpha transparency on the *source* — which is fine, since `@capacitor/
assets generate` is what needs to flatten it for the final Store icon,
not the source itself). **Not yet run through the actual generate →
device/simulator pipeline** — needs P0-3/P0-4's platforms to exist first.

### P0-6. Real IAP: one non-consumable, "Pro Garage"
The single most substantive remaining feature. Recommendation:
**RevenueCat's Capacitor plugin** (free tier covers this volume, wraps
StoreKit 2 + Play Billing 7+, entitlement checks survive
reinstall/multi-device) — alternative is `cordova-plugin-purchase` v13
if a third-party dependency is unwanted.
- Product: non-consumable / one-time in-app product `pro_garage`, both
  consoles, same id. (`js/iap.js`'s `PRODUCTS` also lists `remove_ads`
  and three consumable wrench packs — same treatment, same file.)
- Replace `purchase()`/`restorePurchases()`'s fixed-delay stubs: native →
  plugin purchase flow → entitlement check sets `save.pro` (and the
  matching flags for the other products); keep the stub **web-only**
  (gate on `Capacitor.isNativePlatform()`), it's how the flow stays
  testable in a browser — this pattern (one file owns the fake-vs-real
  split, callers never branch on platform themselves) is already how
  `js/ads.js` is written too, so `js/iap.js` should follow the same shape.
- **Restore must really work** — Apple Guideline 3.1.1 requires a
  functioning restore mechanism for non-consumables; the current
  `{restored:[]}` stub is a guaranteed rejection the moment a reviewer
  tests it with a prior purchase. Both `restoreBtn`s call the plugin's
  restore and re-check entitlement.
- Prices are currently hardcoded USD strings in `PRODUCTS` (`'$6.99'`
  etc.) — these need to become store-localized prices read from the
  platform at runtime, not shipped as fixed English-locale text; a
  German or Japanese buyer should see their own currency and formatting.
- Price the localized tiers at console level; the paywall UI is done.

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

### P0-10. Vehicle art IP clearance — new, from this session's audit
Not previously tracked anywhere in this plan. Full detail lives in
[ASSET-PROVENANCE.md](ASSET-PROVENANCE.md); summary for this checklist:
- Filenames/color-tags/comments naming real marques were neutralised
  (hygiene only — changed no pixels).
- Several assets carrying legible third-party wordmarks or a
  manufacturer crest have been deleted or held out of the shipped pool
  rather than fixed; a couple of small, isolated marks (a chrome badge,
  a vendor logo baked into stock art) were successfully retouched out.
- **At least one held asset — a livery carrying a full manufacturer
  crest plus the model name spelled out in text — is still outstanding**,
  and the original file wasn't retained; it needs either a redo (crest +
  text removed) or to stay excluded permanently.
- A tier of "recognisable silhouette, no visible branding" assets (an
  angular supercar wedge, a hypercar shape, a couple of others) was
  identified as lower-but-nonzero trade-dress risk and has not been
  resolved either way — that's a judgment call for the developer, not
  something further automated inspection can close out.
- The audit itself is **not proven exhaustive** — it covers the assets
  actually looked at closely, not a guaranteed-clean sweep of all 71
  files; ASSET-PROVENANCE.md says plainly where its own coverage stops.

This is a real Guideline 5.2 exposure, not a style nit — treat it as
release-gating alongside the IAP/ads work, not as post-launch cleanup.

### P0-11. Ads: ship without them, or actually integrate a network
`js/ads.js` is a complete stub end to end — not partially wired, not
missing polish, functionally absent. Two honest paths for v1.0, pick one
rather than shipping the stub as-is:
- **(a) Recommended: cut ads from v1.0 entirely.** The banner already
  defaults off (`BANNER_ENABLED = false`), and rewarded-video hint refill
  is separately noted in this plan (§4) as something that "fights the
  premium positioning; likely never." Removing interstitial/rewarded
  call sites (or leaving them present but permanently non-functional
  behind a build flag, mirroring `ADMIN_ENABLED`'s pattern) removes an
  entire class of review risk and an SDK integration for a revenue
  stream this plan already treats as secondary to Pro Garage.
- **(b) Integrate a real mediation SDK** (AdMob is the common Capacitor
  path) if ads are actually wanted for v1.0 — this is a real scope
  addition, comparable in size to P0-6's IAP work, and should be
  budgeted as such rather than assumed to be a small follow-up to the
  stub already being "mostly done."
Either way, this needs an explicit decision before submission; shipping
the stub unmodified is not a real third option — a reviewer who taps
"Watch a video" sees literal placeholder text.

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

- **Finish the audio re-encode.** Pursuit's 4 tracks and Relaxed's 5 are
  still MP3; re-encode to AAC in `.m4a` at the same ~160 kbps used for
  the Heist set (see ASSET-PROVENANCE.md's music section for the
  measured null-test numbers behind that choice) for the same iOS-Safari
  reason the Heist tracks needed it. Re-baseline the size target after —
  see §1's note on why "≤15 MB audio" no longer reflects the current
  10-track Heist set list.
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
- Rewarded-video hint refill — stays cut until an ad-SDK decision (see
  P0-11 — this is the same decision, not a separate one).
- Chapters 8–10 gate/hitch variety (see VARIETY-PLAN §10 — needs a new
  generator strategy, not release-gating).

## 5. Apple submission checklist

| Item | Notes |
|---|---|
| Developer Program account active | $99/yr, needs D-U-N-S if company |
| App record, bundle id `app.midnightgarage` | matches capacitor.config.json — **and is permanent once set, cannot change after first submission** |
| Agreements, tax, banking complete | blocks paid IAP silently if skipped |
| IAP product `pro_garage` (non-consumable) approved | submit WITH the binary first time; P0-6 |
| Restore purchases functional | 3.1.1 — currently a stub, P0-6 |
| Ads decision made and shipped (real SDK or removed) | not the stub as-is; P0-11 |
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
| IAP product `pro_garage` + license testers | test purchases without spending; P0-6 |
| Ads decision made and shipped | same P0-11 decision as Apple's checklist |
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
| P0-2 real fonts | ✅ fonts done; OFL license files still owed |
| P0-7 back-button handler | ✅ done (logic verified via a temporary test hook, not a shipped keyboard shim) |
| P0-8 admin kill switch (`js/build-flags.js`) | ✅ done, verified |
| `@capacitor/android` + `@capacitor/app` deps | ✅ done |
| P0-5 icon/splash **source images** | ✅ done (`resources/`) — not yet run through `@capacitor/assets generate` |
| P1 audio re-encode | 🟡 partial — Heist's 10 tracks + menu/settings themes done (AAC/m4a); Pursuit (4) + Relaxed (5) still MP3 |
| P0-10 vehicle art IP audit | 🟡 in progress — several fixes landed, one flagged asset still outstanding, coverage not proven exhaustive; see ASSET-PROVENANCE.md |
| P0-11 ads decision | ⬜ not yet decided — recommend (a) cut from v1.0 |
| P0-12 privacy manifest | ⬜ not started |
| P0-9 store-listing text + privacy/support pages | ⬜ not started — table in §2 lists every deliverable needed |

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
store products (P0-6), physical-device QA matrix, background/audio QA
(now including the Heist continuous-set-list behavior specifically), and
finishing the audio re-encode with real `ffmpeg` (available in this
environment now, if that work happens here rather than on the Mac).

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
- [ ] Fresh-install purchase AND restore succeed in Apple sandbox and
      Play license testing; web build still sandbox-unlocks. (IAP itself
      — P0-6 — hasn't been built yet; needs M2.)
- [x] Android back button never hard-exits from an overlay or mid-level.
      (Logic verified in Chrome; the real native `backButton` event
      still needs an actual Android build to confirm end-to-end.)
- [x] Admin mode unreachable in release builds (or disclosed in notes).
      Verified with Playwright: 5 taps on the title in a `--release`
      build leaves the admin chip/bar hidden.
- [ ] Ads either genuinely functional or genuinely absent — not the
      current stub. (P0-11.)
- [ ] Vehicle art IP exposure resolved or knowingly accepted, not
      silently shipped. (P0-10.)
- [ ] `PrivacyInfo.xcprivacy` present and accurate. (P0-12.)
- [ ] All Heist/Pursuit/Relaxed audio ships as AAC, none as Opus-in-.m4a;
      verified via `ffprobe`, not by file extension. (P1, currently
      Heist-only.)
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
