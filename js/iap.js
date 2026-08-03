/* In-app purchase interface (docs/MONETIZATION-PLAN.md phase M4) — the
   only file allowed to know a store SDK exists. Backed by
   @revenuecat/purchases-capacitor on native builds; web/dev keeps the
   original fake-resolve stubs so the full purchase -> entitlement flow
   stays testable headlessly. Every exported function's signature and
   contract is unchanged from the pre-RevenueCat stub version — no caller
   elsewhere in the codebase needs to change, same approach as js/ads.js.

   This repo has no JS bundler (see CLAUDE.md), so the plugin's own TS
   wrapper/enums are never imported — only its runtime-registered bridge
   is used, same convention as js/storage.js's capPrefs() and js/ads.js's
   adMob(). Method/type shapes below were read out of the actual installed
   package (node_modules/@revenuecat/purchases-capacitor/dist/esm/
   definitions.d.ts and node_modules/@revenuecat/purchases-typescript-
   internal-esm/dist/*.d.ts), not guessed. */

function purchases(){
  return globalThis.Capacitor?.Plugins?.Purchases ?? null;
}

// [FILL IN] once a real RevenueCat project exists: each platform's public
// SDK key from app.revenuecat.com (Project settings -> API keys). These
// are client-side keys, not secrets, but still shouldn't be invented or
// committed as real values before an actual project backs them.
const REVENUECAT_API_KEY = {
  ios: '[FILL IN RevenueCat iOS SDK key]',
  android: '[FILL IN RevenueCat Android SDK key]',
};

function apiKeyForPlatform(){
  const platform = globalThis.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'ios';
  return REVENUECAT_API_KEY[platform];
}

export const PRODUCTS = {
  remove_ads:     { price: '$3.99', kind: 'nonconsumable' },
  pro_garage:     { price: '$6.99', kind: 'nonconsumable' },
  wrenches_small: { price: '$0.99', kind: 'consumable', wrenches: 50 },
  wrenches_medium: { price: '$2.99', kind: 'consumable', wrenches: 200 },
  wrenches_large: { price: '$9.99', kind: 'consumable', wrenches: 800 },
};

// Real PurchasesStoreProduct objects, keyed by sku, once fetched — RevenueCat's
// purchaseStoreProduct() needs the actual product object (not just an id
// string), so this is the cache purchase() reads from. Also the source for
// updating PRODUCTS[sku].price to a real store-localized string in place:
// callers read PRODUCTS live (js/game.js's updateShopUI()), so mutating the
// existing object's fields — never reassigning the PRODUCTS export itself
// — is what makes a late-arriving price show up without any caller change.
const productCache = {};

async function refreshProductCache(P){
  try{
    const { products } = await P.getProducts({
      productIdentifiers: Object.keys(PRODUCTS),
      type: 'NON_SUBSCRIPTION',
    });
    for(const product of products){
      productCache[product.identifier] = product;
      if(PRODUCTS[product.identifier]) PRODUCTS[product.identifier].price = product.priceString;
    }
  }catch(e){
    // offline, misconfigured project, etc — keep whatever prices/cache
    // already exist rather than clearing them
  }
}

let initPromise = null;
function ensureInitialized(){
  const P = purchases();
  if(!P) return Promise.resolve(false);
  if(!initPromise){
    initPromise = (async () => {
      try{
        await P.configure({ apiKey: apiKeyForPlatform() });
        await refreshProductCache(P);
      }catch(e){
        // configure() failing (bad/missing key) leaves initPromise resolved
        // rather than retried forever; purchase()/restorePurchases() below
        // handle a still-unconfigured plugin as a normal failure, not a crash
      }
      return true;
    })();
  }
  return initPromise;
}

// Fire-and-forget at module load (app boot, since js/game.js imports this
// module at the top level) — real store-localized prices are usually ready
// well before a player reaches any paywall UI, without needing a new export
// for game.js's boot sequence to call.
if(purchases()) ensureInitialized();

// True in dev/web too, same reasoning as ads.js's adsAvailable() — the
// stub always serves, so purchase flows stay testable. Real failures
// (no plugin, configure failed, product not found) are handled inside
// purchase()/restorePurchases() as an honest { success: false }/{ restored:
// [] }, not by this function lying about availability up front.
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
  const P = purchases();
  if(!P) return stubPurchase(sku);
  try{
    await ensureInitialized();
    let product = productCache[sku];
    if(!product){ await refreshProductCache(P); product = productCache[sku]; }
    if(!product) return { success: false, sku };
    const result = await P.purchaseStoreProduct({ product });
    return { success: true, sku: result.productIdentifier };
  }catch(e){
    // covers both a real store error and the user cancelling the sheet —
    // js/game.js's purchaseProduct() already treats any !success as a
    // silent no-op (button re-enables, nothing else happens), which is
    // the right UX for a cancel and a tolerable one for a real failure
    return { success: false, sku };
  }
}

async function stubPurchase(sku){
  await new Promise(resolve => setTimeout(resolve, 500));
  return { success: true, sku };
}

/* A real implementation re-queries the platform store for this account's
   purchase history and returns which non-consumables it found there. The
   stub has no history to query — returning none is the honest answer for
   a build with no store wired in, not a placeholder success. This still
   closes the real gap it's meant to close: the Restore button now calls
   a real function with a real (if currently empty) result, instead of
   showing a toast and doing nothing.

   Assumes the RevenueCat dashboard defines one entitlement per
   non-consumable product, named identically to the product's own sku
   (`pro_garage`, `remove_ads`) — a standard, simple RevenueCat setup for
   an app with no subscription tiers. If the real project's dashboard uses
   different entitlement identifiers, update the lookup below to match;
   consumables (Wrench packs) are never restorable by design and aren't
   part of this check, same as any other IAP store's restore behavior. */
export async function restorePurchases(){
  const P = purchases();
  if(!P) return stubRestorePurchases();
  try{
    await ensureInitialized();
    const { customerInfo } = await P.restorePurchases();
    const restored = Object.keys(PRODUCTS).filter(sku =>
      PRODUCTS[sku].kind === 'nonconsumable' && customerInfo.entitlements.active[sku]?.isActive
    );
    return { restored };
  }catch(e){
    return { restored: [] };
  }
}

async function stubRestorePurchases(){
  await new Promise(resolve => setTimeout(resolve, 400));
  return { restored: [] };
}
