# Privacy policy template

A from-scratch, placeholder-driven template for Midnight Garage's privacy
policy. **This is not the live policy** — the actual, already-drafted
policy text (written for the current shipped app, not a template) is
`docs/store-listing/privacy-policy.html`, which is what actually gets
hosted and linked from the store listings. Use this template only if that
file needs to be rebuilt from scratch, if a fork/rebrand needs its own
policy, or as a reference for what every future data-collection addition
needs to be reflected in.

**This is not legal advice.** Privacy-law requirements (GDPR, CCPA, COPPA,
platform-specific rules) vary by jurisdiction and change over time — have
this reviewed by qualified counsel before relying on it, especially for
any territory with children's-privacy or biometric-data rules.

Every `[PLACEHOLDER]` below must be filled in with real information before
publishing. Do not invent a legal entity name, address, or jurisdiction —
leave the placeholder rather than guess.

---

## Template

```
# Privacy Policy — [APP NAME]

Last updated: [DATE]

[APP NAME] ("the app") is developed by [DEVELOPER/COMPANY LEGAL NAME]
("we", "us"). This policy explains what the app does — and does not —
collect.

## The short version

[One or two sentences accurately summarizing the data-processing
inventory below. Do not claim "we don't collect any data" if the
inventory lists anything collected — even anonymous/device-local data —
without being precise about what "collect" means in context.]

## Data-processing inventory

[Fill this table in from the actual current codebase — see "How to
derive the inventory" below. Do not copy this table from another app or
from memory; every row must be traceable to a real dependency,
permission, or code path.]

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose | Where in the code |
|---|---|---|---|---|---|
| [e.g. Game progress/save data] | [Yes/No] | [Yes/No] | [Yes/No] | [why it's collected] | [file path] |

## Third-party services

[List every SDK/service that can transmit data off the device, with a
link to that service's own privacy policy. Do not omit a service just
because it's currently inactive/unconfigured in this build — note that
status explicitly instead.]

- [Service name] — [what it's used for] — [status: active / present in
  code but inactive until configured] — [link to their privacy policy]

## What we don't collect

[Only list categories genuinely never requested — cross-check against
native permission declarations (AndroidManifest.xml `<uses-permission>`,
iOS Info.plist `NS*UsageDescription` keys) before asserting "never
requests".]

## In-app purchases

[If applicable: purchases are processed by Apple/Google; this policy
should state plainly whether the developer ever sees payment details
(normally: no, only entitlement/purchase-completion signals).]

## Account deletion

[If the app has user accounts: link to docs/ACCOUNT_DELETION.md or an
equivalent in-app path. If it doesn't: state that plainly, and describe
how a user removes any locally-stored data (uninstalling the app) and
how to request deletion of anything held server-side, if anything is.]

## Children's privacy

[State the actual age-targeting/rating of the app and what that implies.
Do not claim COPPA compliance without having actually reviewed the
questionnaire and your data practices against it — this is a legal
determination, not a boilerplate line.]

## Changes to this policy

We will update this page and the "Last updated" date above when this
policy changes, and reflect material changes in that release's store
listing/release notes.

## Contact

Questions about this policy: [SUPPORT EMAIL] · [PHYSICAL ADDRESS, if
required by your jurisdiction — many do not require one for an
individual developer, but some do; confirm rather than guess]
```

---

## How to derive the inventory (don't guess — read the code)

For this specific codebase, the inventory should be built by checking:

| Source | What it tells you |
|---|---|
| `js/storage.js` | What's persisted locally on-device (via `@capacitor/preferences` natively, `localStorage` on web) — currently: level progress, settings, streaks, purchase entitlement state, the analytics device ID + local event ring buffer. Never transmitted by this file itself. |
| `js/analytics.js` + `js/config.js` | Whether analytics is actually active. As shipped, `CONFIG.supabaseUrl`/`supabaseAnonKey` are blank, so `flush()` returns immediately and nothing leaves the device — the *code path* exists (a random, non-identifying device ID + gameplay-event facts) but is inert until those two fields are filled in. State this precisely: "present in code, inactive in this build" is different from "does not exist." |
| `supabase/schema.sql` | The exact shape of what would be sent if analytics is turned on: `device_id`, `session_id`, event `name`, a `props` JSON blob, and timestamps. No name/email/account identifier of any kind — RLS only permits anonymous `insert`, never `select`/`update`/`delete` from the client. |
| `js/ads.js` | Whether the AdMob SDK is wired in, and its consent flow (ATT + Google's UMP) — determines whether the advertising identifier is ever used for tracking (only with affirmative consent; non-personalized by default). |
| `js/iap.js` | Whether RevenueCat is wired in for purchases, and that payment details are never seen/stored by this app's own code (handled by Apple/Google + RevenueCat). |
| `ios/App/App/Info.plist` `NS*UsageDescription` keys, `android/app/src/main/AndroidManifest.xml` `<uses-permission>` entries | The authoritative list of what the native app can access. Currently: `NSUserTrackingUsageDescription` (ATT prompt, ads-related only) on iOS, `android.permission.INTERNET` on Android. No camera/microphone/contacts/location/photos permission exists in either — do not assert "we don't access X" for anything not already checked against these two files at write time. |
| `resources/PrivacyInfo.xcprivacy` / `ios/App/App/PrivacyInfo.xcprivacy` | Apple's own machine-readable version of the same declaration — keep the prose policy consistent with it, not just the store nutrition-label form. |

`docs/store-listing/data-safety.md` already contains a fully worked
version of this inventory for the current shipped app, mapped to both
Apple's App Privacy and Google's Data Safety form shapes — treat it as
the canonical current answer, and this file as the reusable process for
producing the next one when the app's data practices change.
