# Native icon/splash sources (STORE-SHIP-PLAN.md P0-5)

Source images for `@capacitor/assets` (installed as a devDependency). This
folder is a separate source path from the app's own `assets/` (which ships
inside the game itself) — pass `--assetPath resources` explicitly since
`resources` isn't the tool's first default lookup.

All four files are re-derived from `assets/icon.svg`'s design (same
colors/composition), rasterized via a headless-Chromium screenshot script
(not committed — throwaway, matches the pattern in CLAUDE.md's "Testing UI
changes" section). Regenerate by re-running the same approach if the mark
ever changes: load an SVG string in a page sized to the target pixel
dimensions, screenshot with `omitBackground: true` for the files that need
real alpha transparency.

- **icon-only.png** (1024×1024, full bleed, no baked-in corner rounding) —
  iOS icon + PWA icon source. iOS/PWA apply their own corner mask at
  display time; a source with rounding already baked in would double up.
- **icon-background.png** (1024×1024, full bleed) + **icon-foreground.png**
  (1024×1024, transparent, car mark scaled to ~72% and centered) — Android
  adaptive icon layers. The foreground is deliberately conservative on
  size: adaptive icon launchers apply circle/squircle/rounded-square/
  teardrop masks depending on the device, and only roughly the middle 66%
  ("safe zone") is guaranteed visible across all of them — 72% leaves a
  small margin past that minimum rather than shipping to the exact edge.
- **splash.png** (2732×2732) — native launch screen for both platforms:
  solid `#0b0e14` background + small centered mark. Deliberately quieter
  than the in-app start screen (`assets/start/*.jpg`) — that's the actual
  first-launch content the native splash hands off to, not something to
  duplicate here.

## Generating platform assets

Only meaningful **after** `npx cap add ios` / `npx cap add android` exist
(STORE-SHIP-PLAN.md P0-3/P0-4) — the tool writes into `ios/App/App/` and
`android/app/src/main/res/`, which don't exist yet on this branch:

```bash
npx @capacitor/assets generate --assetPath resources \
  --iconBackgroundColor '#0b0e14' --iconBackgroundColorDark '#0b0e14' \
  --splashBackgroundColor '#0b0e14' --splashBackgroundColorDark '#0b0e14'
```

Re-run after any change to the source PNGs here, then `npx cap sync`.

**Not yet visually verified on a real device or simulator** — the
composition was checked by rendering each source file directly (readable
at 1024px, foreground mark sits comfortably inside the adaptive-icon safe
zone, real alpha transparency confirmed on the foreground layer), but how
`@capacitor/assets` actually crops/masks these per platform still needs a
look on a physical device or Xcode/Android Studio simulator before relying
on it for a store submission.
