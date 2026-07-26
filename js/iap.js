/* In-app purchase interface (docs/MONETIZATION-PLAN.md phase M4) — the
   only file allowed to know a store SDK exists. No real StoreKit/Play
   Billing plugin is wired in yet: purchase()/restorePurchases() are
   dev/web stubs so the full purchase -> entitlement flow is exercised and
   testable headlessly before a real plugin (@capacitor-community/in-app-
   purchases or RevenueCat) lands. Same pattern as js/ads.js — swap the
   bodies here later; nothing outside this file should need to change. */

export const PRODUCTS = {
  remove_ads:     { price: '$3.99', kind: 'nonconsumable' },
  pro_garage:     { price: '$6.99', kind: 'nonconsumable' },
  wrenches_small: { price: '$0.99', kind: 'consumable', wrenches: 50 },
  wrenches_medium: { price: '$2.99', kind: 'consumable', wrenches: 200 },
  wrenches_large: { price: '$9.99', kind: 'consumable', wrenches: 800 },
};

// True in dev/web too, same reasoning as ads.js's adsAvailable() — the
// stub always serves, so purchase flows stay testable. Becomes a real
// store-init check once a plugin is wired in.
export function iapAvailable(){
  return true;
}

/* Resolves { success: true, sku } after a short simulated delay. A real
   implementation resolves only once the platform store confirms the
   transaction, and must NEVER grant the entitlement itself — that stays
   the caller's job (js/game.js's purchaseProduct()), the same split
   js/ads.js's showRewarded() keeps between "the ad finished" and "what
   that pays for". */
export async function purchase(sku){
  await new Promise(resolve => setTimeout(resolve, 500));
  return { success: true, sku };
}

/* A real implementation re-queries the platform store for this account's
   purchase history and returns which non-consumables it found there. The
   stub has no history to query — returning none is the honest answer for
   a build with no store wired in, not a placeholder success. This still
   closes the real gap it's meant to close: the Restore button now calls
   a real function with a real (if currently empty) result, instead of
   showing a toast and doing nothing. */
export async function restorePurchases(){
  await new Promise(resolve => setTimeout(resolve, 400));
  return { restored: [] };
}
