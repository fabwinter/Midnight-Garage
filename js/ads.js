/* Ad network interface (docs/MONETIZATION-PLAN.md phase M2) — the only
   file allowed to know an ad network exists. Backed by
   @capacitor-community/admob on native builds; web/dev keeps the original
   fake-resolve stubs below so the full earn -> grant -> entitlement flow
   stays testable headlessly. Every exported function's signature and
   contract is unchanged from the pre-AdMob stub version — no caller
   elsewhere in the codebase needs to change.

   This repo has no JS bundler (see CLAUDE.md), so the plugin's own TS
   wrapper/enums are never imported — only its runtime-registered bridge is
   used, same convention as js/storage.js's capPrefs() and js/notify.js's
   plugin(). Enum member string values below were read out of the actual
   installed package (node_modules/@capacitor-community/admob/dist/esm,
   the *.enum.js files under each ad-type folder), not guessed. */

function adMob(){
  return globalThis.Capacitor?.Plugins?.AdMob ?? null;
}

// Google's official, publicly-documented AdMob TEST ad unit IDs. Safe to
// ship as-is — they only ever serve clearly-labelled test creatives.
// Swap each `[FILL IN]` for this app's real AdMob ad unit ID before
// flipping AD_TEST_MODE to false; until then these are what's live, on
// purpose, so a stray build can never accidentally serve real ads.
const AD_TEST_MODE = true;
const AD_UNIT_IDS = {
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716', // [FILL IN production iOS banner ID]
    interstitial: 'ca-app-pub-3940256099942544/4411468910', // [FILL IN production iOS interstitial ID]
    rewarded: 'ca-app-pub-3940256099942544/1712485313', // [FILL IN production iOS rewarded ID]
  },
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111', // [FILL IN production Android banner ID]
    interstitial: 'ca-app-pub-3940256099942544/1033173712', // [FILL IN production Android interstitial ID]
    rewarded: 'ca-app-pub-3940256099942544/5224354917', // [FILL IN production Android rewarded ID]
  },
};

function adUnitId(kind){
  const platform = globalThis.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'ios';
  return AD_UNIT_IDS[platform][kind];
}

// Consent (UMP/GDPR) + ATT (iOS 14.5+) state, resolved once at first ad use
// and reused after. Defaults are the safe/closed ones: no personalized
// ads, and — if consent info can't even be read (offline, misconfigured) —
// no ads at all rather than guessing a region doesn't need one.
let adsPermitted = true;
let personalizedAdsAllowed = false;

async function resolveConsent(AdMob){
  try{
    let info = await AdMob.requestConsentInfo({});
    if(info.status === 'REQUIRED' && info.isConsentFormAvailable){
      info = await AdMob.showConsentForm();
    }
    adsPermitted = info.canRequestAds !== false;
    personalizedAdsAllowed = adsPermitted && info.status !== 'REQUIRED';
  }catch(e){
    adsPermitted = true;
    personalizedAdsAllowed = false;
  }

  try{
    let track = await AdMob.trackingAuthorizationStatus();
    if(track.status === 'notDetermined'){
      await AdMob.requestTrackingAuthorization();
      track = await AdMob.trackingAuthorizationStatus();
    }
    personalizedAdsAllowed = personalizedAdsAllowed && track.status === 'authorized';
  }catch(e){
    personalizedAdsAllowed = false;
  }
}

function npaFlag(){
  return !personalizedAdsAllowed;
}

let initPromise = null;
function ensureInitialized(){
  const AdMob = adMob();
  if(!AdMob) return Promise.resolve(false);
  if(!initPromise){
    initPromise = (async () => {
      try{
        await AdMob.initialize({
          initializeForTesting: AD_TEST_MODE,
          maxAdContentRating: 'General',
        });
        await resolveConsent(AdMob);
      }catch(e){
        adsPermitted = false;
      }
      return true;
    })();
  }
  return initPromise;
}

// Resolves once with whichever of the named events fires first, removing
// every listener it registered so a one-shot ad view never leaks a handle.
function onceEventOf(AdMob, eventNames){
  return new Promise((resolve) => {
    const handles = [];
    let settled = false;
    const finish = (name, arg) => {
      if(settled) return;
      settled = true;
      handles.forEach(h => h.remove());
      resolve({ name, arg });
    };
    eventNames.forEach(name => {
      AdMob.addListener(name, (arg) => finish(name, arg)).then(h => handles.push(h));
    });
  });
}

// True in dev/web too — the stub always serves, so every "Watch" button
// stays clickable and the whole earn flow is exercisable headlessly.
export function adsAvailable(){
  return true;
}

// Rewarded stays available to EVERYONE, including Pro/legacy owners (see
// MONETIZATION-PLAN.md §5.1: "remove ads" must never mean "remove
// rewarded") — this function is never gated by adsSuppressed(), only by
// adsAvailable() at the call site's UI layer.
export async function showRewarded(placement){
  const AdMob = adMob();
  if(!AdMob) return stubShowRewarded(placement);
  try{
    await ensureInitialized();
    if(!adsPermitted) return { completed: false };
    let earnedReward = null;
    const rewardHandle = await AdMob.addListener('onRewardedVideoAdReward', (reward) => { earnedReward = reward; });
    const settled = onceEventOf(AdMob, ['onRewardedVideoAdDismissed', 'onRewardedVideoAdFailedToShow']);
    await AdMob.prepareRewardVideoAd({ adId: adUnitId('rewarded'), isTesting: AD_TEST_MODE, npa: npaFlag() });
    AdMob.showRewardVideoAd().catch(() => {});
    await settled;
    rewardHandle.remove();
    return { completed: !!(earnedReward && earnedReward.amount > 0) };
  }catch(e){
    return { completed: false };
  }
}

// Resolves { completed: true } after a short simulated delay, so callers'
// "grant on completion" flow runs the same way in dev/web as on native.
async function stubShowRewarded(placement){
  await new Promise(resolve => setTimeout(resolve, 500));
  return { completed: true };
}

export async function showInterstitial(placement){
  const AdMob = adMob();
  if(!AdMob) return stubShowInterstitial(placement);
  try{
    await ensureInitialized();
    if(!adsPermitted) return;
    const settled = onceEventOf(AdMob, ['interstitialAdDismissed', 'interstitialAdFailedToShow']);
    await AdMob.prepareInterstitial({ adId: adUnitId('interstitial'), isTesting: AD_TEST_MODE, npa: npaFlag() });
    AdMob.showInterstitial().catch(() => {});
    await settled;
  }catch(e){
    // ad failed to load/show — fail open, never block the player on an ad
  }
}

/* Renders a real, dismissible full-screen stand-in and resolves once it's
   closed — so the frequency-cap/eligibility logic that calls this
   (js/game.js's maybeShowInterstitial) is genuinely testable headlessly:
   click-to-close, not a timer. Deliberately closeable immediately rather
   than after a delay — Google Play's Better Ads policy sets a 15s MAX
   before a close button must appear, not a minimum wait, and dev
   iteration shouldn't be throttled by a rule meant to stop ads from being
   inescapable. */
function stubShowInterstitial(placement){
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.dataset.adStub = 'interstitial';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0b0e14;color:#e8ecf4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:sans-serif;text-align:center;padding:24px;';
    el.innerHTML = `
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.5">Ad stub — no native AdMob bridge present</div>
      <div style="font-size:20px;font-weight:700">Interstitial · ${placement}</div>
      <button type="button" data-ad-stub-close style="padding:10px 26px;border-radius:10px;border:1px solid #333;background:#1c2230;color:inherit;cursor:pointer;font-size:14px">Close</button>
    `;
    document.body.appendChild(el);
    el.querySelector('[data-ad-stub-close]').addEventListener('click', () => { el.remove(); resolve(); });
  });
}

// MONETIZATION-PLAN.md §5.2: banner stays OFF by default even once wired
// up — "treat as optional and default it off until data justifies it".
// Integrating the SDK is not the same decision as turning the banner on;
// this flag makes every call a no-op until someone flips it deliberately.
const BANNER_ENABLED = false;
let bannerEl = null;
let nativeBannerVisible = false;
export async function setBannerVisible(visible){
  if(!BANNER_ENABLED) return;
  const AdMob = adMob();
  if(!AdMob){
    if(visible && !bannerEl){
      bannerEl = document.createElement('div');
      bannerEl.dataset.adStub = 'banner';
      bannerEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:50px;z-index:9998;background:#1c2230;color:#8a93a6;display:flex;align-items:center;justify-content:center;font-size:11px;font-family:sans-serif;';
      bannerEl.textContent = 'Ad stub — banner (no native AdMob bridge present)';
      document.body.appendChild(bannerEl);
    } else if(!visible && bannerEl){
      bannerEl.remove();
      bannerEl = null;
    }
    return;
  }
  try{
    await ensureInitialized();
    if(!adsPermitted) return;
    if(visible && !nativeBannerVisible){
      await AdMob.showBanner({ adId: adUnitId('banner'), adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', isTesting: AD_TEST_MODE, npa: npaFlag() });
      nativeBannerVisible = true;
    } else if(!visible && nativeBannerVisible){
      await AdMob.hideBanner();
      nativeBannerVisible = false;
    }
  }catch(e){
    // no-op — banner is a nice-to-have, never worth surfacing an error for
  }
}

// Suppresses the INTRUSIVE ad tiers only (banner/interstitial). Rewarded
// is opt-in by nature and never checked against this — every player,
// including someone who bought Remove Ads, can still watch one for
// Wrenches.
export function adsSuppressed(save){
  return !!(save.entitlements?.proLegacy || save.entitlements?.removeAds || save.pro);
}
