# Store listing template

A reusable, structured template for Apple App Store + Google Play listing
copy, asset requirements, review notes, and a pre-submission disclosure
checklist. **The already-filled version for the current shipped app is
`docs/store-listing/APP-STORE.md` and `docs/store-listing/PLAY-STORE.md`**
— this file is the reusable shape those were built from, useful when a
new version's copy needs a from-scratch pass or a field was missed.

Every `[PLACEHOLDER]` below must be replaced with real, verified copy —
never invented product claims, review-response promises, or business
details that aren't actually true of the shipped build.

---

## Apple App Store Connect fields

| Field | Limit | Notes |
|---|---|---|
| App Name | 30 chars | Heaviest-weighted search field. |
| Subtitle | 30 chars | Second-heaviest; pair genre + mechanic, don't repeat Name. |
| Promotional Text | 170 chars | Editable without a new binary submission — update opportunistically. |
| Description | 4000 chars | Not indexed for search (unlike Play) — optimize for conversion, not keywords. |
| Keywords | 100 chars, comma-separated, no spaces | Don't repeat words already in Name/Subtitle — wasted budget. |
| Copyright | — | `[YEAR] [LEGAL NAME]` |
| Support URL | — | Must resolve publicly; Apple checks it. |
| Marketing URL | optional | — |
| Privacy Policy URL | — | Must resolve publicly; required at submission. |
| Age Rating questionnaire | — | Answer from actual shipped content, not aspirational — see disclosure checklist below. |
| App Review Notes | up to 4000 chars | Sign-in instructions (or "no accounts exist"), how to reach gated/IAP content, sandbox tester guidance. |

```
## App Name
[PLACEHOLDER — ≤30 chars]

## Subtitle
[PLACEHOLDER — ≤30 chars]

## Promotional Text
[PLACEHOLDER — ≤170 chars]

## Description
[PLACEHOLDER — ≤4000 chars]

## Keywords
[placeholder,keywords,comma,separated]

## Copyright
[YEAR] [LEGAL NAME]

## App Review Notes
[Sign-in: state plainly whether accounts exist and how to bypass any
gate for review. List every IAP product and how a reviewer completes a
sandbox purchase. Describe every ad placement and its trigger. Note
whether any admin/debug/hidden mode exists and confirm it's disabled in
the submitted build — do not let a reviewer discover a hidden dev menu
you didn't disclose.]
```

## Google Play Console fields

| Field | Limit | Notes |
|---|---|---|
| App title | 30 chars | Match Apple's Name where possible for brand consistency. |
| Short description | 80 chars | Shown above the fold on the listing. |
| Full description | 4000 chars | **Is indexed for Play search**, unlike Apple — keyword-relevant phrasing here matters more than on Apple. |
| Release notes | 500 chars per release | Written per-version, not a static template field. |
| Content rating (IARC questionnaire) | — | Answered in-console via a structured questionnaire, not free text — draft expected answers here first so the console pass is fast and consistent. |
| Target audience / children's section | — | Determines ad-SDK behavior (COPPA/Play Families restrictions) — get this right, it isn't cosmetic. |
| Data Safety section | — | See `docs/store-listing/data-safety.md` / `docs/PRIVACY_POLICY_TEMPLATE.md`. |
| Privacy Policy URL | — | Same URL as Apple's, ideally. |

```
## App title
[PLACEHOLDER — ≤30 chars]

## Short description
[PLACEHOLDER — ≤80 chars]

## Full description
[PLACEHOLDER — ≤4000 chars]

## Release notes (this version)
[PLACEHOLDER — ≤500 chars, written per release]
```

---

## Asset / screenshot requirements

| Asset | Apple | Google Play |
|---|---|---|
| App icon | 1024×1024 PNG, **no alpha channel**, no rounded corners (Apple masks it) | 512×512 PNG, 32-bit with alpha |
| Feature graphic | — | 1024×500 JPG/PNG, no alpha, required |
| Screenshots | Per required device-size class (currently: 6.7" iPhone at minimum; iPad if `supportsTablet`) — 3–10 per size class | Phone: min 2, up to 8; 16:9 or 9:16, JPG/PNG |
| Promo video | optional | optional, YouTube link |

Screenshots **must be taken from an actual running build** (device or
simulator) — none exist yet in this repo as of this writing. Do not
mock up screenshots that don't reflect the real, current UI; both stores
have rejected listings for misleading screenshots before, and it erodes
review trust even when technically allowed.

---

## Review-notes template (both stores)

```
Accounts: [state plainly — "no accounts of any kind exist; progress is
stored locally on-device" is the current true answer for this app].

Gated content: [list every paywall/unlock and exactly how a reviewer
reaches it — level number, IAP product ID, whether a sandbox/test
purchase is required and how to trigger one].

Ads: [list every placement, its trigger condition, and confirm none
interrupt gameplay mid-session if that's true; state which ad network].

Hidden/admin/debug modes: [disclose any developer-only surface reachable
in the submitted build, even if intentionally hard to find — e.g. a
tap-5-times gesture — and confirm it's excluded from release builds if
it is (see js/build-flags.js's release kill switch, if applicable)].

Anything requiring reviewer action beyond normal play: [e.g. "please use
a Sandbox/test account, purchase completes instantly with no real
charge"].
```

---

## Disclosure checklist (verify before submitting, don't assume)

- [ ] Does the app collect any data at all in this exact build?
      Cross-check against `docs/store-listing/data-safety.md` /
      `docs/PRIVACY_POLICY_TEMPLATE.md` — don't answer from memory of a
      previous version.
- [ ] Does the app show ads? Which network, which placements, are any
      removable via purchase?
- [ ] Are there in-app purchases? Consumable vs. non-consumable vs.
      subscription — each has different disclosure requirements.
- [ ] Does the app request any permission (camera, location, contacts,
      etc.)? If yes, is the usage description string accurate to what
      the code actually does with it — not a generic template sentence?
- [ ] Is there any user-generated content visible to other users? (If an
      in-app editor/sandbox exists but nothing it produces is shared with
      other users, that distinction matters for the moderation-policy
      question — state it precisely.)
- [ ] Does the app use third-party content (licensed art/audio/fonts)
      whose provenance/licensing needs disclosing? Check the project's
      asset-provenance documentation, not memory.
- [ ] Does the app have any hidden/admin/debug mode reachable in the
      submitted build? If yes, is it disclosed in review notes, and
      confirmed disabled/gated in the actual release artifact being
      uploaded?
- [ ] Are the prices shown in the listing copy the same as what the
      actual paywall/store product will charge? A placeholder price
      quoted in marketing copy that doesn't match the configured store
      product is a common, easily-missed inconsistency.
- [ ] Are the Privacy Policy and Support URLs both live, public, and free
      of any `[FILL IN]`/placeholder text before pasting them into either
      console?
