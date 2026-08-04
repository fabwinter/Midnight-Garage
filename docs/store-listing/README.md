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
3. **Hosting is set up, one manual toggle left.** A `gh-pages` branch
   already exists on this repo (2026-08-04) with exactly 4 files —
   `index.html`, `privacy-policy.html`, `support.html`, `terms.html` —
   copied from here, deliberately kept as an orphan branch with no
   shared history with `main` so none of this repo's other docs (asset
   IP audit, business strategy) are reachable from it. **What's still
   needed:** in this repo's GitHub Settings → Pages, set Source to
   "Deploy from a branch" → `gh-pages` → `/ (root)`. Once that's flipped,
   the URLs are:
   - `https://fabwinter.github.io/Midnight-Garage/privacy-policy.html`
   - `https://fabwinter.github.io/Midnight-Garage/support.html`
   - `https://fabwinter.github.io/Midnight-Garage/terms.html`

   These go into App Store Connect's App Information page and Play
   Console's Store presence → Main store listing. **Don't flip that
   toggle until step 1 above is actually done** — the branch currently
   has the same `[FILL IN]` placeholders as the source files here, and
   publishing a legal-ish page with visible yellow "[FILL IN]" markers
   isn't ready for a store listing. After editing the source files here,
   re-push to `gh-pages` (copy the 3 html files + keep `index.html` as
   the simple links-only page it is) to update the live site — pushing
   to `main` alone does **not** update what's published, since
   `gh-pages` is a separate, non-syncing branch.
4. Pricing lines in `APP-STORE.md`/`PLAY-STORE.md` reference the
   placeholder USD strings currently in `js/iap.js` — update once P0-6
   sets real store-localized prices, so the listing copy never promises
   a price the paywall doesn't actually show.
