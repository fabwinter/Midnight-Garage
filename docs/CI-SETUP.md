# CI setup: building and submitting without a Mac

`codemagic.yaml` (repo root) is the pipeline that does the one genuinely
Mac-locked part of shipping this app — compiling with Xcode, code
signing, and uploading to App Store Connect / Play Console — on a cloud
Mac instead of physical Apple hardware. Everything else (generating
`ios/`/`android/`, native config, icon/splash assets) is already done and
committed; see STORE-SHIP-PLAN.md's P0-3/P0-4/P0-5 for what.

**This file was written without live access to Codemagic's current docs**
(the sandbox this was authored in blocks outbound access to
`docs.codemagic.io`) — the shape of `codemagic.yaml` matches Codemagic's
documented conventions as confirmed via web search (`xcode-project
use-profiles`, `xcode-project build-ipa`, the `app_store_connect`
publishing block), but exact current syntax/flag names should be checked
against [docs.codemagic.io](https://docs.codemagic.io/) at setup time
before assuming a first failed build is this app's fault rather than a
stale command name.

## One-time setup (all web-based, no Mac needed)

1. **Sign up at [codemagic.io](https://codemagic.io/)** and connect this
   GitHub repo. Free tier should cover this app's build cadence.
2. **iOS signing — App Store Connect API key integration** (Codemagic
   dashboard → Team settings → Integrations → App Store Connect):
   generate an API key in App Store Connect (Users and Access → Keys →
   App Store Connect API), upload it to Codemagic, name the integration
   to match `codemagic.yaml`'s `app_store_connect: app_store_credentials`
   reference (or edit the yaml to match whatever you name it). This lets
   `app-store-connect fetch-signing-files` pull (or create, with
   `--create`, if none exist yet) a distribution certificate and
   provisioning profile for `$BUNDLE_ID`, `keychain add-certificates`
   install the certificate on the build machine, and `xcode-project
   use-profiles` apply the fetched profile to the Xcode project — no
   manual certificate/profile management, no Xcode signing UI, ever. All
   three steps are required; `use-profiles` alone only applies profiles
   already on disk, it doesn't fetch them (an earlier version of this
   pipeline had only that last step and failed archiving with "requires a
   provisioning profile" as a result).
3. **Android signing — upload keystore**: generate a keystore once
   (`keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA
   -keysize 2048 -validity 10000 -alias <alias>` — this can run on any
   machine with a JDK, doesn't need Android Studio). **Back this up
   somewhere safe outside this repo — losing it means you can never
   update the app under the same Play listing.** Base64-encode it
   (`base64 -i upload-keystore.jks | pbcopy` or equivalent) and set it as
   an encrypted `CM_KEYSTORE` variable in a Codemagic environment group
   named `google_play_credentials`, alongside `CM_KEYSTORE_PASSWORD`,
   `CM_KEY_ALIAS`, `CM_KEY_ALIAS_PASSWORD`.
4. **Android publishing — Play Console service account**: Play Console →
   Setup → API access → create a service account, grant it release
   permissions, download its JSON key, set it as
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` in the same `google_play_
   credentials` group.
5. **App Store Connect app record** and **Play Console app listing** both
   need to exist before the pipeline's publishing step can target them
   (STORE-SHIP-PLAN.md §5/§6 cover what each console needs — agreements,
   tax/banking, IAP products, content ratings, etc; none of that is
   automated by this pipeline, all of it is browser-based).

## What the pipeline does NOT do

- **Doesn't create real AdMob/RevenueCat accounts or products.** `js/
  ads.js`/`js/iap.js` and the native config ship with Google's public
  *test* App IDs (crash-safe defaults, real ad-unit IDs still
  `[FILL IN]`) — swap those for real values once those accounts exist
  (STORE-SHIP-PLAN.md P0-6/P0-11), then flip `AD_TEST_MODE`/
  `AD_TEST_MODE`-equivalent flags off.
- **Doesn't run App Review or Play's 14-day closed-testing clock for
  you** — those are Apple's/Google's own processes once a build is
  uploaded.
- **`submit_to_app_store` and Play's `track` are deliberately
  conservative** (`false` / `internal`) so a routine push to `main`
  can't accidentally submit for review or push straight to production —
  promote a build manually once you've actually looked at it.

## GitHub Actions alternative

If a second CI vendor account isn't wanted, the same pipeline shape
works as a `.github/workflows/*.yml` using a `macos-14` runner (real
Apple hardware, GitHub's own cloud) for iOS and any `ubuntu-latest`
runner for Android — same `cap sync` / `pod install` / `xcodebuild` /
`fastlane` steps, just YAML-shaped for Actions instead of Codemagic, and
signing secrets stored as GitHub Actions repo secrets instead of a
Codemagic environment group. Ask if you'd rather have that written
instead of (or alongside) `codemagic.yaml` — not written speculatively
here since maintaining two parallel CI configs long-term is its own
cost, and it's easy to add later if Codemagic's free tier or workflow
doesn't fit.
