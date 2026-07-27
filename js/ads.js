/* Ad network interface (docs/MONETIZATION-PLAN.md phase M2) — the only
   file allowed to know an ad network exists. No mediation SDK is wired in
   yet; every function below is a dev/web stub so the full earn -> grant ->
   entitlement flow is exercised and testable headlessly before a real
   network lands. When a native SDK is integrated, only the bodies here
   change — no caller anywhere else should need to. */

// True in dev/web too — the stub below always serves, so every "Watch"
// button stays clickable and the whole earn flow is exercisable
// headlessly before a real network lands. Once mediation is wired in,
// this becomes a real fill/init check instead of a constant.
export function adsAvailable(){
  return true;
}

// Resolves { completed: true } after a short simulated delay, so callers'
// "grant on completion" flow runs the same way in dev/web as it will once
// a real network is wired in. Rewarded stays available to EVERYONE,
// including Pro/legacy owners (see MONETIZATION-PLAN.md §5.1: "remove
// ads" must never mean "remove rewarded") — this function is never gated
// by adsSuppressed(), only by adsAvailable() at the call site's UI layer.
export async function showRewarded(placement){
  await new Promise(resolve => setTimeout(resolve, 500));
  return { completed: true };
}

/* Renders a real, dismissible full-screen stand-in and resolves once it's
   closed — so the frequency-cap/eligibility logic that calls this
   (js/game.js's maybeShowInterstitial) is genuinely testable headlessly:
   click-to-close, not a timer. Deliberately closeable immediately rather
   than after a delay — Google Play's Better Ads policy sets a 15s MAX
   before a close button must appear, not a minimum wait, and dev
   iteration shouldn't be throttled by a rule meant to stop ads from being
   inescapable. Styled inline and outside this app's own overlay/CSS
   system on purpose: a real mediation SDK renders its own native view
   the same way, entirely outside this app's DOM/component tree. */
export function showInterstitial(placement){
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.dataset.adStub = 'interstitial';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0e14;color:#e8ecf4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:sans-serif;text-align:center;padding:24px;';
    el.innerHTML = `
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.5">Ad stub — no mediation SDK wired in</div>
      <div style="font-size:20px;font-weight:700">Interstitial · ${placement}</div>
      <button type="button" data-ad-stub-close style="padding:10px 26px;border-radius:10px;border:1px solid #333;background:#1c2230;color:inherit;cursor:pointer;font-size:14px">Close</button>
    `;
    document.body.appendChild(el);
    el.querySelector('[data-ad-stub-close]').addEventListener('click', () => { el.remove(); resolve(); });
  });
}

// MONETIZATION-PLAN.md §5.2: banner stays OFF by default even once wired
// up — "treat as optional and default it off until data justifies it".
// The call sites in js/game.js (loadLevel hides it, entering the start
// screen shows it) are real and safe to leave in place either way, since
// this flag makes every call a no-op until someone flips it deliberately.
const BANNER_ENABLED = false;
let bannerEl = null;
export function setBannerVisible(visible){
  if(!BANNER_ENABLED) return;
  if(visible && !bannerEl){
    bannerEl = document.createElement('div');
    bannerEl.dataset.adStub = 'banner';
    bannerEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:50px;z-index:9998;background:#1c2230;color:#8a93a6;display:flex;align-items:center;justify-content:center;font-size:11px;font-family:sans-serif;';
    bannerEl.textContent = 'Ad stub — banner (no mediation SDK wired in)';
    document.body.appendChild(bannerEl);
  } else if(!visible && bannerEl){
    bannerEl.remove();
    bannerEl = null;
  }
}

// Suppresses the INTRUSIVE ad tiers only (banner/interstitial). Rewarded
// is opt-in by nature and never checked against this — every player,
// including someone who bought Remove Ads, can still watch one for
// Wrenches.
export function adsSuppressed(save){
  return !!(save.entitlements?.proLegacy || save.entitlements?.removeAds || save.pro);
}
