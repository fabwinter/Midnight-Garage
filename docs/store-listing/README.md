# Store listing assets (P0-9)

Everything needed for the App Store Connect and Google Play Console
listings, drafted from the actual shipped app — not generic placeholder
copy. Search each file for `[FILL IN]` before submitting; those are the
only genuine placeholders (legal name, support email, jurisdiction,
publish dates, and the final ad-network name once P0-11 settles).

| File | What it's for |
|---|---|
| `APP-STORE.md` | Promotional text, description, keywords, copyright line, App Review notes, age-rating/content-rights answers |
| `PLAY-STORE.md` | Title, short/full description, release notes, Play-only asset checklist (feature graphic etc.), content-rating/target-audience answers |
| `data-safety.md` | The App Privacy (Apple) / Data Safety (Google) declaration, mapped once for both forms |
| `privacy-policy.html` | Host this at a public URL; both stores require the link |
| `support.html` | Host this too; Apple requires a support URL, Play strongly expects one |
| `terms.html` | Optional but cheap to have; not store-mandatory |

## Before you host these

1. Fill in every `[FILL IN]` marker (legal/company name, support email,
   governing jurisdiction, publish dates).
2. **Ads sections are filled in** (`privacy-policy.html`'s "Advertising"
   section, `data-safety.md`'s ads-dependent table, both stores' "does
   the app have ads" answers) for the P0-11 decision actually made and
   code-integrated: Google AdMob, banner + interstitial removable via
   Pro Garage/Remove Ads, rewarded video always optional, non-personalized
   ads by default with an ATT/UMP consent path to personalized. If that
   decision changes later, all of these need to change with it —
   `resources/PrivacyInfo.xcprivacy`'s `NSPrivacyTracking` flag too.
3. Host `privacy-policy.html`, `support.html`, and `terms.html` at
   stable URLs on infrastructure you control — a GitHub Pages site off
   this same repo works fine, or any static host. The exact URLs then
   go into App Store Connect's App Information page and Play Console's
   Store presence → Main store listing.
4. Pricing lines in `APP-STORE.md`/`PLAY-STORE.md` reference the
   placeholder USD strings currently in `js/iap.js` — update once P0-6
   sets real store-localized prices, so the listing copy never promises
   a price the paywall doesn't actually show.
