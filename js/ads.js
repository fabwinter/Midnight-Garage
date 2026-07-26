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

export function showInterstitial(placement){
  // no-op until phase M3 (mediation SDK + Better Ads frequency cap)
}

export function setBannerVisible(visible){
  // no-op until phase M3
}

// Suppresses the INTRUSIVE ad tiers only (banner/interstitial). Rewarded
// is opt-in by nature and never checked against this — every player,
// including someone who bought Remove Ads, can still watch one for
// Wrenches.
export function adsSuppressed(save){
  return !!(save.entitlements?.proLegacy || save.entitlements?.removeAds || save.pro);
}
