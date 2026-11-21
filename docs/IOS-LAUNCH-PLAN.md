# iOS App Store launch plan

Audit date: 2026-11-21. Based on a read of the repo at `05586a4` plus a live
`npm run verify`. Nothing was built on a Mac or run on a device (this
environment has neither), so every "works" below means "reads correctly",
not "verified on hardware".

**Bottom line:** the game content and web layer are in good shape (500 levels
verified, audio AAC, privacy manifest, icon, CI pipeline all present). What
stands between you and the App Store is almost entirely *accounts, real
keys, one native build, and a handful of small defects*. There is one real
code bug (daily puzzle), one likely upload-blocker (iPad orientations), and
one legal risk (vehicle art) that need decisions, not just work.

---

## 1. Audit findings

### Bugs / defects found in the code

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| A1 | **High** | **Daily puzzle crashes on some dates.** `dailyLevel('2026-11-25')` returns `null` (all 400 seeded attempts miss the band). `loadDailyLevel` then does `lv.m` on null, so every player who taps Daily that day gets a broken screen. The code comment calls this "unreachable in practice"; it is not. `verify-levels.mjs` only checks 14 days, so it caught this only because the window happens to include it. | `npm run verify` → `✗ daily 2026-11-25: generation failed`; `js/generate.js:548-559`, `js/game.js:1149-1153` | Add a guaranteed last-resort fallback in `dailyLevel` (widen band further, or pick best-scoring candidate seen), keep it deterministic. Add a null-guard in `loadDailyLevel`. Extend verify to ~400 days and fail on any null. How many other dates fail was not measured (see §6). |
| A2 | **High** | **iPad multitasking orientation validation.** Target is `TARGETED_DEVICE_FAMILY = "1,2"` (iPad supported), but `UISupportedInterfaceOrientations~ipad` lists only Portrait + PortraitUpsideDown and there is no `UIRequiresFullScreen`. Apple's upload validation rejects iPad apps that opt into multitasking without all four orientations. | `ios/App/App/Info.plist`, `project.pbxproj:363,382` | Either add `UIRequiresFullScreen = true`, or go iPhone-only (`TARGETED_DEVICE_FAMILY = 1`). iPhone-only also removes the need for iPad screenshots and iPad layout QA. **Recommended for v1.0.** |
| A3 | **High** | **Placeholder keys ship.** `js/iap.js:26` RevenueCat key is the literal string `[FILL IN RevenueCat iOS SDK key]`; `configure()` fails silently, `purchase()` returns `{success:false}`. Every IAP button would do nothing in review → Guideline 2.1 rejection. | `js/iap.js:25-28` | Create RevenueCat project, paste the public iOS key. Add a startup assertion in release builds that fails the build if a `[FILL IN]` string remains. |
| A4 | **High** | **Google *test* ads ship.** `AD_TEST_MODE = true`, test unit IDs, and the test `GADApplicationIdentifier` are live. Reviewers would see "Test Ad" creatives. | `js/ads.js:23-31`, `Info.plist` | Real AdMob account + app + units; flip the flag; swap `GADApplicationIdentifier`. Or cut ads from v1.0 (see decision D2). |
| A5 | Med | **Listing/review-notes say a banner exists; code disables it.** `BANNER_ENABLED = false`, yet `APP-STORE.md` review notes and description promise a start-screen banner. Mismatched claims invite a reviewer question. | `js/ads.js:~190`, `docs/store-listing/APP-STORE.md` | Make copy match shipped behaviour. |
| A6 | Med | **`[FILL IN]` still in legal pages / listing.** 5 markers across `APP-STORE.md` and `README.md`; `privacy-policy.html` etc. currently show 0 but the README says the hosted `gh-pages` copy still has yellow markers and the Pages toggle is off. Apple requires a working privacy-policy URL and support URL. | `docs/store-listing/README.md:20-47` | Fill, re-push `gh-pages`, enable Pages, open all three URLs in a browser. |
| A7 | Med | **Tracking declaration must match reality.** `PrivacyInfo.xcprivacy` has `NSPrivacyTracking = true` and an IDFA entry; ATT string is present. That is correct *if* personalized ads can happen. If ads are cut or non-personalized only (D2), flip to `false`, drop the ATT string, and drop "Data Used to Track You" from the nutrition label. Mismatch between manifest, ATT prompt and App Privacy answers is a common rejection. | `ios/App/App/PrivacyInfo.xcprivacy`, `js/ads.js:49-70` | Decide D2 first, then make all three agree. |
| A8 | Med | **Only one SKAdNetwork ID.** Info.plist carries Google's ID only; the file's own comment says to add Google's current list. Not a rejection cause; costs ad revenue. | `Info.plist` | Pull current list from Google's AdMob iOS docs. Skip if ads are cut. |
| A9 | Low | `UIRequiredDeviceCapabilities` = `armv7`. Capacitor's default, ships fine, but `arm64` is the correct modern value. | `Info.plist` | Change to `arm64`. |
| A10 | Low | `CODE_SIGN_STYLE = Automatic` with no team in the project; CI overrides via `xcode-project use-profiles`. Fine for Codemagic, but a local Xcode archive will need a team picked. | `project.pbxproj:352` | None needed if CI is the build path. |
| A11 | Low | **Toolchain age.** Capacitor 6 / iOS deployment target 13. Apple requires submissions built with the current Xcode/iOS SDK (the iOS 26 SDK as of April 2026). `codemagic.yaml` uses `xcode: latest`, which is right, but Capacitor 6 + newest Xcode is untested here. | `package.json`, `codemagic.yaml` | First CI build will tell you. If it fails, upgrade to the current Capacitor major (plugins `admob`, `revenuecat` need matching versions). Budget a day. |
| A12 | Low | **Release flag is opt-in per build.** `js/build-flags.js` has `ADMIN_ENABLED = true` in source; only `npm run build:release` turns it off. CI uses release (good), but a hand-run `npm run cap:sync` would ship the 5-tap admin backdoor. | `js/build-flags.js`, `package.json` scripts | Make `cap:sync` call the release build, or default the flag to `false` and have the dev server override it. |

### Larger risks (need a decision, not just a patch)

| # | Sev | Risk |
|---|---|---|
| R1 | **High** | **Vehicle art provenance.** `docs/ASSET-PROVENANCE.md` states the art is *not cleared*: photoreal renders of identifiable production vehicles, some with third-party wordmarks. 29 flagged files were deleted, but the audit says it "is not proven exhaustive" (≈20 of 71 files were visually inspected, about a third of those had marks, ~50 uninspected). Group-5 look-alike silhouettes (wedge, hypercar, offroader, rear-engine classic) are still shipping. Guideline 5.2 puts the burden on you; a rightsholder complaint after launch means takedown. The remaining set is ~54 files, so this is a finite job. |
| R2 | Med | **Music provenance** is recorded as "owned/licensed by developer" with no stored licence/AI-service terms. Apple rarely asks; claims can arrive after launch. Keep receipts/terms retrievable. |
| R3 | Med | **Trademark.** First-pass check found real automotive businesses trading as "Midnight Garage". Listing name was changed to "Midnight Garage: Escape" to mitigate; a proper clearance is still a business decision. |
| R4 | Med | **Never compiled or run on a device.** AVAudioSession setup, AdMob, RevenueCat, local notifications, haptics, WKWebView audio (AAC) and the ATT/UMP flow are all unexercised on iOS. Expect a few first-build surprises. |
| R5 | Low | **Quality gating.** There's no test framework beyond `verify-levels`. UI regressions are caught only by hand/Playwright. Acceptable for v1.0 if a real-device pass is done. |

### What's already good (don't redo)

- 500 campaign + bounty + impound boards verified optimal; chapter curve intact.
- All audio is AAC `.m4a` (Safari-safe), continuous-music invariants documented.
- `PrivacyInfo.xcprivacy` present and registered in the Xcode Resources phase; required-reason API (UserDefaults, CA92.1) declared.
- 1024×1024 no-alpha App Store icon, splash assets, portrait lock, `ITSAppUsesNonExemptEncryption = false`.
- Restore Purchases exists in two places in the UI (`js/game.js:2448-2449`), as Apple requires.
- No accounts, so no Sign in with Apple / account-deletion obligations.
- `codemagic.yaml` iOS workflow is complete and conservative (TestFlight only, `submit_to_app_store: false`).
- Store copy, privacy policy, support and terms pages are drafted.
- Total asset payload ≈55 MB, well under size limits.

---

## 2. Decisions needed from you (before work starts)

- **D1. iPhone-only or iPhone + iPad for v1.0?** Recommend **iPhone-only**: the layout is portrait-phone-first, it fixes A2 cleanly, and it removes iPad screenshots and QA. Add iPad in 1.1.
- **D2. Ads in v1.0 or not?** Recommend **ship v1.0 without ads**, keep rewarded/interstitial code dormant. This removes A4, A5, A7, A8, the ATT prompt, the UMP consent flow, the tracking declaration and the biggest unverified native dependency. Your own `PLAN-STATUS` originally called the business model "premium, ad-clean". Re-enable in 1.1 once there's real data. If you do want ads at launch, the work is in Phase 2 below.
- **D3. Art: replace or repaint?** Recommend replacing the whole vehicle set with commissioned/generated art that depicts no real model, because the audit itself concludes that's cheaper than proving a negative over ~54 photoreal files. Minimum viable alternative: visually inspect every remaining file at full zoom and delete or repaint anything with text, badges, or a recognisable body.
- **D4. Legal name for the developer account.** Individual vs company (Apple shows this as the seller name; the copyright line says "Fabian Winterbine").

---

## 3. The plan

Phases are ordered by dependency. Items marked 🧑 need you (accounts, money, legal); 🤖 I can do in the repo.

### Phase 0: start the slow clocks today (all 🧑, no code)

These have lead times that nothing else can shorten, so begin them first.

1. Enrol in the **Apple Developer Program** ($99/yr; individual approval is usually 1-2 days, organisation needs a D-U-N-S number and can take weeks).
2. In App Store Connect: accept the **Paid Applications Agreement**, add **banking and tax** details. IAP cannot be tested or sold until this is done.
3. Create the **app record** with bundle ID `app.midnightgarage` (register the ID in the developer portal first).
4. Create an **App Store Connect API key (Admin role)** and the `CERTIFICATE_PRIVATE_KEY` variable per `docs/CI-SETUP.md`; connect the repo in Codemagic.
5. Start **art replacement** (D3) in parallel; it is the longest creative task.

### Phase 1: code fixes (🤖, about 1-2 days)

1. **A1** daily-puzzle fallback + null guard + verify across ~400 days (regression-proof it).
2. **A2/D1** set `TARGETED_DEVICE_FAMILY = 1` (or add `UIRequiresFullScreen`).
3. **A9** `arm64` required capability.
4. **A12** make the Capacitor sync path release-only by default.
5. **A3** add a release-build guard that fails if any `[FILL IN` string remains in `www/`.
6. If **D2 = no ads**: remove the `@capacitor-community/admob` pod and plugin from the iOS build, delete the `GADApplicationIdentifier`/SKAdNetwork/ATT entries, set `NSPrivacyTracking = false`, strip the interstitial/banner calls from the UI, and update `PrivacyInfo.xcprivacy`, the listing copy, privacy policy and data-safety doc together.
7. **A5/A6** correct the listing/review-note claims and fill the remaining `[FILL IN]` fields.
8. Run `npm run verify` and the Playwright smoke test from CLAUDE.md; commit.

### Phase 2: store integrations (🧑 + 🤖)

1. **RevenueCat:** create the project, add the iOS app, paste the public SDK key into `js/iap.js`, define entitlements named exactly `pro_garage` and `remove_ads` (the code assumes sku-named entitlements).
2. **App Store Connect IAP products:** create `pro_garage`, `remove_ads`, `wrenches_small`, `wrenches_medium`, `wrenches_large` with the exact IDs in `js/iap.js:30-36`, set real prices, add review screenshots and localised names, and attach them to the first submission. Update the dollar figures in `APP-STORE.md` to match.
3. *(Only if ads at launch)* AdMob account, iOS app, three real ad units, swap IDs, set `AD_TEST_MODE = false`, real `GADApplicationIdentifier`, full SKAdNetwork list, UMP consent message configured in the AdMob console.
4. **Host legal pages:** finish `[FILL IN]`s, push `gh-pages`, enable GitHub Pages, confirm privacy/support/terms URLs load publicly.

### Phase 3: first real build (🧑 triggers, 🤖 fixes whatever breaks)

1. Push to `main`; Codemagic builds, signs, and uploads to TestFlight.
2. Expect to debug: Xcode-version vs Capacitor 6 (A11), pod resolution, signing. Budget a day for this.
3. Install via TestFlight on **at least two real iPhones** (one small-screen, one with Dynamic Island).

### Phase 4: on-device QA checklist (🧑 with 🤖 triage)

- Cold launch: no white flash, splash → start screen, safe areas and notch correct.
- **Audio:** start-screen theme plays (AAC in WKWebView), silent switch respected, a Heist run continues across levels without restarting, phone-call/Siri interruption recovers, backgrounding and returning resumes sanely.
- Haptics fire; reduced-motion respected.
- **IAP with a sandbox tester:** buy Pro Garage → chapters 3-10 unlock; buy Remove Ads; buy each Wrench pack; kill the app, relaunch, entitlement persists; delete + reinstall → **Restore Purchases** re-grants; cancel mid-sheet leaves the UI sane; airplane mode shows a sane failure.
- Local notification permission prompt appears only when the user opts in; reminder fires at 20:30.
- Daily puzzle opens for today and for several back-dated days, including 2026-11-25.
- Save/progress survives app kill, update, and (TestFlight) update over an older build.
- Admin backdoor is **absent**: tap the title 5× on the release build.
- Level 1 with the default hero car (the null `skinFor()` case from CLAUDE.md).
- Low-end device performance and thermal behaviour on a long session.
- Accessibility: VoiceOver reads pieces; Dynamic Type doesn't break layout.
- *(If ads)* ATT prompt text and timing, UMP form in a EU-simulated region, test-ad labels gone.

### Phase 5: store listing and compliance (🧑, with copy drafted by 🤖)

1. **Screenshots:** 6.9" iPhone (required) and, if D1 includes iPad, 13" iPad. Optional preview video.
2. Paste name, subtitle, promo text, description, keywords, support URL, privacy URL, copyright.
3. **App Privacy nutrition label** from `data-safety.md` (must match the final privacy manifest, A7).
4. **Age rating** questionnaire (expected 4+; recheck if ads ship).
5. **Export compliance:** already `ITSAppUsesNonExemptEncryption = false`.
6. **App Review notes:** no login, sandbox IAP instructions, how to reach Daily/Bounty. Remove the Sandbox/level-editor paragraph if the admin tools are not reachable in release builds, or keep it short and truthful.
7. Select the TestFlight build, attach the IAPs, choose **manual release**.

### Phase 6: submit and launch

1. Flip `submit_to_app_store` only for the final build, or submit manually from App Store Connect (preferred for v1.0).
2. Typical review is about 24-48 hours; first submissions with IAP often get one question round. Keep the reviewer notes handy and respond fast.
3. On approval, release manually on a day you can monitor it. Watch crash reports (Xcode Organizer / TestFlight feedback) and IAP receipts for the first 48 hours.

---

## 4. Critical path and rough effort

```
Phase 0 (accounts, agreements, API key) ──┐
Art replacement (D3) ─────────────────────┼─► Phase 3 build ─► Phase 4 QA ─► Phase 5 listing ─► Phase 6 submit
Phase 1 code fixes (1-2 days) ────────────┤
Phase 2 RevenueCat/IAP products ──────────┘
```

| Work | Who | Effort |
|---|---|---|
| Accounts, agreements, tax/banking | 🧑 | 1-3 days wall-clock (org account: weeks) |
| Code fixes (A1-A3, A5, A9, A12, ads removal) | 🤖 | 1-2 days |
| RevenueCat + ASC IAP products | 🧑 + 🤖 | 0.5-1 day |
| Art replacement or full inspection and repaint | 🧑 (+ tools) | 3-10 days, the long pole |
| First CI build and fixes | 🤖 | 1-2 days |
| On-device QA and fixes | both | 2-4 days |
| Listing, screenshots, privacy forms | 🧑 | 1 day |
| App Review | Apple | 1-3 days, plus any resubmission |

Realistic total: **about 2-3 weeks** if the art is replaced rather than audited,
**about 1.5 weeks** if you accept the art risk and ship the current set (not
recommended; see R1).

## 5. Most likely rejection reasons, ranked

1. IAP not working in review (A3, products not attached, or Paid Apps agreement unsigned) → Guideline 2.1 / 3.1.1.
2. Privacy mismatch between manifest, ATT prompt, nutrition label and policy (A7) → 5.1.1 / 5.1.2.
3. Broken or placeholder privacy/support URLs (A6) → 5.1.1.
4. Test ads or "Test Ad" labels visible (A4) → 2.3 / 2.1.
5. Third-party trademarks/likeness in the art (R1) → 5.2.
6. Crash on launch from an unverified native path (R4) → 2.1.

## 6. Open item from this audit

How many dates beyond 2026-11-25 return `null` was **not measured**: the sweep
was too slow to finish (about 0.1-1.5 s per date) and was stopped. Treat A1 as
"add a guaranteed fallback and verify ~400 days", not "special-case one date".
Nothing in the repo was changed by this audit except adding this file.
