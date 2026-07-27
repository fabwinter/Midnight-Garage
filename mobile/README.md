# Midnight Garage — Expo preview shell

A thin Expo app whose only job is to open the real game (the vanilla-JS
app in the repo root) inside a `WebView`, so you can preview it on a
phone via Expo Go without a native build. This is a **testing** shim —
`../capacitor.config.json` and `npm run cap:*` in the repo root are still
the real path to an App Store/Play Store build. Nothing about the game
itself changed to support this: `js/storage.js`, `js/haptics.js`, and
`js/notify.js` already fall back gracefully to plain web behavior
whenever `Capacitor` isn't present (which it won't be here), so the game
just works, minus native haptics/persistent-storage/notifications.

## Point it at the game

Edit `expo.extra.gameUrl` in `app.json`. Two ways to fill it in:

- **Deployed URL** (recommended — works from any phone, anywhere, no
  network setup): if the game is deployed (e.g. to Vercel), just use that
  URL: `"gameUrl": "https://your-app.vercel.app"`.
- **Local dev server** (to preview changes before they're deployed): run
  `npm run dev` from the repo root (starts `tools/serve.mjs` on `:8080`),
  find your computer's LAN IP, and use
  `"gameUrl": "http://192.168.1.23:8080"` (**not** `localhost` — on a
  real phone that would mean the phone itself, not your computer). Your
  phone and computer need to be on the same Wi-Fi network.

The default (`http://localhost:8080`) only resolves correctly from an iOS
Simulator or an Android emulator with port forwarding set up — not from
Expo Go on a real device. If the game fails to load, the app shows an
error screen with the current URL and a pointer back here.

## Run it

```bash
cd mobile
npm start
```

This prints a QR code. Scan it with the Expo Go app (iOS or Android) —
your phone and computer must be on the same network unless `gameUrl`
points at a deployed URL, in which case any network works. `npm run ios`
/ `npm run android` launch a simulator/emulator instead, if you have one
set up.

## What's actually in here

- `App.js` — the whole app: a full-screen `WebView` pointed at
  `gameUrl`, Android hardware-back wired to the WebView's own history,
  a loading spinner, and an error screen if the URL doesn't resolve.
- `app.json` — Expo config; `expo.extra.gameUrl` is the one field you'll
  touch.
- Everything else is what `create-expo-app`'s blank template generates.

This folder is its own npm project (`mobile/package.json`, separate
`node_modules/`) — it doesn't affect the repo root's `npm run dev` /
`npm run build` / `npm run verify` at all.
