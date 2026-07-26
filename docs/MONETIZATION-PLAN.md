# MONETIZATION-PLAN: hybrid (IAA + IAP) for Midnight Garage

Implements the hybrid model recommended in the strategy brief (rewarded
video as the primary lever, capped interstitials, a light consumable
economy, "remove ads" as a quality-of-life IAP, subscription only if the
data earns it) — adapted to what this game actually is, rather than
applied as a generic casual-puzzle template.

Read §1 and §2 before writing any code. §2 is a business decision that has
to be made by a human before Phase M1 is worth starting, because it
changes a promise already made to paying customers.

---

## 1. Where things stand today (audited, not guessed)

**Business model as shipped: premium, ad-free.** `docs/PLAN-STATUS.md`
records it as "**premium (Variant A)**, ad-clean, no-RNG".

| Thing | State | Where |
|---|---|---|
| Ads | **None, of any format.** No SDK, no mediation, no consent flow. | — |
| Pro unlock | One-time, unlocks campaign ch. 3–10 + unlimited hints | `save.pro`, `FREE_LEVELS = CHAPTER_SIZE * 2` (100 of 500 levels free) |
| Purchase plumbing | **Stub.** `wirePro()` sets `save.pro = true` locally. No StoreKit/Play Billing, no receipt validation, no restore. | `js/game.js: wirePro` |
| Soft currency | **None.** | — |
| Consumables | **None.** Hints are a free daily allowance (`HINT_TOKENS_PER_DAY = 3`, unlimited for Pro); undo is unlimited and free; Pursuit pauses are 3/attempt. | `save.hints`, `undo()`, `PURSUIT_PAUSES_MAX` |
| Retention meta | Daily puzzle + `save.streak3`, Bounty (nightly mark), Impound Lot, 500-level campaign, car collection | `js/bounty.js`, `js/collection.js` |
| Analytics | Live, batched to Supabase; `iap_view` / `iap_purchase` already emitted at every paywall touchpoint | `js/analytics.js` |
| Native shell | Capacitor 6 (iOS + Android), `webDir: www`, release build strips admin | `capacitor.config.json`, `tools/build-www.mjs` |

**Assets this plan gets for free** — the natural rewarded-ad and
consumable moments already exist as *designed mechanics*, not
retrofits:

- **Heist** mode has a per-move alarm budget (`alarmBudgetFor()`) and a
  hard "busted" fail state.
- **Pursuit** has a real-time timer plus 3 pause tokens.
- **Hints** are already a metered daily token (`save.hints.left`).
- **Skip** already exists as a quiet valve after 8 minutes stuck
  (`SKIP_AFTER_MS`).
- **Level end** already renders a win sheet — the compliant interstitial
  slot and the natural "double your payout" slot.
- **Daily streak** already exists — the natural "streak freeze" slot.

**Two hard covenants this plan must not break:**

1. **Par integrity.** `m` is verified-optimal for all 500 campaign + 61
   bounty + 100 impound boards (`tools/verify-levels.mjs`). Stars/best are
   measured against it. Nothing sold may alter a board or its par.
2. **No purchase gates a specific car.** `js/collection.js` is explicit:
   cars are "cosmetic hero skins — zero gameplay effect, no RNG, no
   purchase gates a specific car (the distinction that keeps this out of
   gacha-adjacent territory)". Selling job cars or bounty marks breaks the
   game's stated design ethic. §5.3 routes cosmetic IAP around this.

---

## 2. The conflict that must be resolved before Phase M1

The Pro Garage sales pitch, in all 10 locales, currently reads:

> `'pro.none': 'No ads. No subscriptions.'`

That is a promise made **at the point of sale** to everyone who has
already bought Pro. Shipping ads into their build would be a bait-and-
switch — the brief's own §6 lists exactly this ("making 'remove ads' fail
to remove ads") as a trust-destroying, refund-generating indie pitfall,
and here it would be worse, because the promise was absolute rather than
partial.

**Decision required (human, not code):** confirm the move from premium to
hybrid, on these terms.

**Non-negotiable term this plan assumes:** *everyone who owns Pro before
the hybrid build ships is grandfathered permanently ad-free — banner,
interstitial and rewarded alike — and keeps every entitlement they have
today.* Implementation: stamp `save.proLegacy = true` during migration for
any save with `pro === true`, and have the ad gate check
`proLegacy || removeAds`. It is a one-line check and it is the difference
between an honest model change and a broken promise.

Three viable shapes, in descending order of how much they honour the
existing positioning:

| | Shape | Free tier | Paid | Trade-off |
|---|---|---|---|---|
| **A** | **Hybrid, new users only** *(recommended)* | Ads + consumables | "Remove Ads" ($3.99) and/or Pro | Honours every existing promise; slower ramp |
| **B** | Full hybrid, legacy grandfathered | Same as A | Same as A | Same trust posture as A; A *is* B — listed to make the grandfathering explicit, not optional |
| **C** | Stay premium, add consumables only | 100 free levels | Pro + coin packs | No ad revenue at all; leaves the brief's biggest lever unused |

The brief is right that hybrid out-earns ad-only and premium in this
genre. It is also right that trust breaks are the top churn driver. A/B
gets both. **This plan implements A/B.** If the answer is C, stop after
Phase M1 and skip M2/M3 — M1 is written to be independently shippable
precisely so that option stays open.

The Pro pitch copy has to change for new users regardless (see §5.4); it
is also *already stale* — `pro.f1` still says "Chapters 3 & 4 — 100 expert
levels", from the 200-level era, when Pro now unlocks 400 levels across
8 chapters.

---

## 3. Target model

```
FREE                                    PAID
├── Rewarded video (opt-in, uncapped)   ├── Remove Ads          $3.99
│   └── earns Wrenches (soft currency)  │   └── kills banner + interstitial
├── Interstitial (level end, capped)    │       NEVER rewarded (stays opt-in)
├── Banner (menus only, never board)    ├── Wrench packs   $0.99–$9.99
└── Daily free Wrench                   ├── Pro Garage         $6.99
                                        │   └── 400 levels + unlimited hints
                                        │       + Remove Ads included
                                        └── Garage Pass (M6, conditional)
```

**Soft currency: "Wrenches."** Fits the fiction (a garage), avoids the
generic "coins", and reads as a *tool* — which is what it buys.

**What Wrenches buy** (all of these are already-metered mechanics, so
none of them is a new gameplay concept the player has to learn):

| Spend | Cost | Earned by | Guard |
|---|---|---|---|
| Hint beyond the daily 3 | 1 | rewarded ad, daily free, IAP | unchanged hint logic |
| +5 moves on a Heist alarm | 2 | " | §4.2 — must not touch par |
| +20 s on a Pursuit timer | 2 | " | " |
| Extra Pursuit pause | 1 | " | " |
| Skip a level (before the 8-min valve) | 3 | " | already exists, still 1★ |
| Daily-streak freeze | 5 | " | protects `save.streak3` |
| Cosmetic skins/themes | 25–100 | " | §5.3 — **not** job cars |

**What Wrenches must never buy:** a specific job car or bounty mark
(covenant 2), a lower par, a star rating, or anything that changes a
verified board.

---

## 4. Phase M1 — the economy substrate (ship first, ships alone)

No ads, no new SDKs. Pure gameplay + storage work. Independently
releasable, and it is the piece the brief says is costly to retrofit
later, so it goes first regardless of the §2 decision.

### 4.1 Currency + entitlement in the save

Extend `save` (`js/game.js`) and the migration in `loadSave()`:

```js
wrenches: 0,
entitlements: { pro: false, removeAds: false, proLegacy: false },
econ: { dailyWrenchDay: '', lifetimeEarned: 0, lifetimeSpent: 0 },
```

Keep the existing top-level `save.pro` as the read path for now
(`entitlements.pro` mirrors it) so no call site changes in this phase —
migrate call sites in M4 when real receipts land.

**Migration:** any existing save with `pro === true` gets
`entitlements = { pro: true, removeAds: true, proLegacy: true }`. This is
the §2 grandfathering clause, and it must land in M1 — *before* any ad
code exists — so it can never be forgotten later.

New module **`js/economy.js`**, mirroring `js/library.js`'s shape (own
storage key, version counter, small exported API):

```js
export function wrenches();
export async function grant(n, source);   // tracks 'wrench_grant'
export async function spend(n, sink);     // false if insufficient; tracks 'wrench_spend'
export function priceOf(sink);            // single source of truth for the table in §3
```

Every grant/spend goes through here so the economy has exactly one ledger
and one analytics choke point.

### 4.2 Spending against Heist/Pursuit budgets without breaking par

The delicate one. `alarmBudgetFor(par)` derives the Heist move budget
*from the verified par*, and busting it is a real fail state. "+5 moves"
must therefore be a **per-attempt grant that never touches `parOf()`**:

```js
let alarmBonus = 0;             // reset in startBoard(), never persisted
// budget check becomes:
moves > alarmBudgetFor(parOf()) + alarmBonus
```

Same for Pursuit: a `timeBonus` added to the attempt's remaining seconds,
not to the formula.

Consequences to honour, so buying moves stays a convenience and not a way
to buy a score:
- `parOf()`, star thresholds and `best` stay computed from the untouched
  par. A bought win still scores what the moves earned.
- An attempt that used bonus moves records `assisted: true` in
  `level_win` telemetry, so difficulty tuning isn't polluted by purchases.
- **Bounty conditions must reject assisted runs** — `bountyConditionMet()`
  already reads `hintsUsed`; add `assisted` to the same guard. A limited-
  edition mark must not be purchasable, per covenant 2.

### 4.3 UI surfaces

- Wrench counter in the HUD next to the hint badge (`updateHintBadge()`
  neighbours it).
- A **Shop** overlay (`.overlay` + `.show` pattern per house style,
  reachable from the start screen and the pause sheet).
- Offer sheets at the friction points: out of hints, alarm about to bust,
  timer nearly out, 3rd failure on a level. Each shows **"Watch" (M2) OR
  "Spend N ⚙" OR "Buy"** — the brief's "every player monetizes" rule.
- All new strings through `js/i18n.js`, all 10 locales, same as the gate
  tutorial work.

### 4.4 Sources before ads exist

Daily free Wrench, streak milestones, chapter completion, first clear of a
bounty tier. This makes M1 a complete, satisfying feature on its own —
and means if §2 lands on option C, the game still gained an economy.

---

## 5. Phases M2–M5

### 5.1 Phase M2 — rewarded video (the primary lever)

Mediation: **AppLovin MAX** or **Unity LevelPlay** per the brief. AdMob
alone is simplest but the brief cites 25–60% of rewarded revenue left on
the table. Recommendation: integrate through a thin internal interface so
the network is swappable —

**`js/ads.js`**, the *only* file that knows an ad network exists:

```js
export function adsAvailable();                  // false on web build
export async function showRewarded(placement);   // -> {completed:bool}
export function showInterstitial(placement);     // fire-and-forget, respects cap
export function setBannerVisible(v);
export function adsSuppressed();                 // proLegacy || removeAds || pro
```

Web/dev build stubs `showRewarded` to resolve `{completed:true}` after a
fake delay, so the whole flow is testable headlessly — same philosophy as
`wirePro()`'s existing sandbox unlock and the admin tooling.

Placements (all opt-in, all granting Wrenches or the thing directly):
`hint_empty`, `alarm_rescue`, `pursuit_time`, `level_skip`,
`daily_wrench`, `streak_freeze`, `double_payout` (win sheet).

`adsSuppressed()` **must not** gate rewarded — rewarded stays available to
everyone, including Pro. That is the brief's core "remove ads ≠ remove
rewarded" point, and it is also why Pro owners keep earning Wrenches.

### 5.2 Phase M3 — interstitials + banner (the intrusive tier)

Ship *after* M2 has retention data, and conservatively:

- **Interstitial: level end only.** Never mid-puzzle, never on a loading
  screen, closeable at 15 s — Google Play Better Ads policy, quoted in the
  brief §5. Cap: every 3rd level completion **and** ≥ 120 s since the last
  one, whichever is longer. Never after a *failed* attempt (busted/timeout
  is already a bad moment; an ad on top of it is the #1 review complaint
  in the brief's §6).
- **Never** during Daily, Bounty, or a first-session tutorial level.
- **Banner: menus only.** Never on the board screen — the board is a
  6×6 grid sized by `layout()` against viewport height, and a banner would
  either shrink the play area or overlap it. Low eCPM, high annoyance;
  treat as optional and default it **off** until data justifies it.

### 5.3 Phase M4 — real IAP

Replace the `wirePro()` stub with an actual store integration
(`@capacitor-community/in-app-purchases` or RevenueCat if the
subscription in M6 is likely — RevenueCat pays for itself the moment
subscriptions and cross-platform restore are in play).

Products:

| SKU | Type | Price | Grants |
|---|---|---|---|
| `remove_ads` | non-consumable | $3.99 | banner + interstitial off, forever |
| `pro_garage` | non-consumable | $6.99 | 400 levels + unlimited hints + `remove_ads` |
| `wrenches_small/med/large` | consumable | $0.99 / $2.99 / $9.99 | 50 / 200 / 800 ⚙ |
| `starter_bundle` | non-consumable | $4.99 | `remove_ads` + 100 ⚙ (first-week offer) |

Also in this phase, and overdue independently of monetization:

- **Receipt validation.** `save.pro` is today a client-side boolean in
  editable storage — anyone can grant themselves Pro from a console. Move
  entitlements behind validated receipts, with a server check (the
  Supabase project already exists) before trusting a local flag.
- **Restore purchases.** `t('btn.restore')` currently shows a toast and
  does nothing (`js/game.js` ~line 2057). Apple *requires* a working
  restore path for non-consumables; this is a review-rejection risk today.
- **Cosmetic-only cars.** Per covenant 2, purchasable cosmetics must be a
  **separate pool** from job cars and bounty marks — new skins/board
  themes that are never a job's assigned mark. Do not make any existing
  earned car purchasable, and do not make any purchased car appear in the
  collection's earn-progress counters.

### 5.4 Phase M5 — copy, positioning, and the trust surface

- Rewrite `pro.*` strings (10 locales). `pro.none` cannot survive as-is.
  Replace with an honest statement of what Pro does now — e.g. "No banner
  or interstitial ads. Rewarded boosts stay optional." Fix the stale
  `pro.f1` "Chapters 3 & 4 — 100 expert levels" → 400 levels / 8 chapters.
- Legacy Pro owners: one-time in-app note confirming they keep an
  ad-free build permanently. Cheap, and it converts a potential 1-star
  review into goodwill.
- Store listing + screenshots updated to reflect ads.

---

## 6. Phase M6 — subscription (conditional, do not pre-build)

Only if, after 4–6 weeks of M2/M3 data: D7 ≥ 15%, and rewarded engagement
is healthy. Then a "Garage Pass" (~$4.99/mo): ad-free + daily Wrench
stipend + exclusive cosmetic drops. Per the brief, consider the Mob
Control pattern — *any* purchase suppresses forced ads — to lower the
first-transaction barrier.

Do not build this speculatively. It is the highest-complexity, highest-
churn-risk layer and the brief itself rates it as an emerging secondary.

---

## 7. Compliance work (blocking for store submission)

Adding ad SDKs changes the app's regulatory surface. None of this is
optional:

- **ATT (iOS):** prompt *after* first level completion with a value
  message, never on cold start. Brief §5.
- **GDPR/UMP consent** for EU users, wired before the first ad request.
- **COPPA / age signals:** puzzle games skew broad; set the SDK's
  child-directed flags correctly or lose fill and risk policy action.
- **Privacy manifests + `NSUserTrackingUsageDescription`** (iOS 17+
  required reasons API), and **Play Data Safety** re-declaration —
  currently the app collects analytics only; ad SDKs add device
  identifiers.
- **Google Play Families / Better Ads** compliance re-check on the
  interstitial rules in §5.2.

---

## 8. Analytics (extend `js/analytics.js`)

New events: `wrench_grant`, `wrench_spend`, `ad_request`, `ad_impression`,
`ad_complete`, `ad_failed` (all with `placement`), `offer_view`,
`offer_accept` (with `method: 'ad'|'wrenches'|'iap'`), `shop_open`.
Extend `level_win` with `assisted`.

Dashboard the decision thresholds from the brief verbatim, because they
are what tell you to change course:

| Signal | Threshold | Action |
|---|---|---|
| ad ARPDAU | < $0.01 with healthy DAU | placement/mediation is broken — fix before UA |
| rewarded engagement high, IAP conv. | < 1% | strengthen consumable value / offer timing / bundles |
| D7 retention | < ~15% | do not scale paid UA; invest in content + tuning |
| reviews citing ad frequency | any material volume | cut interstitial cadence immediately |

---

## 9. Explicitly out of scope / do-not-touch

- **Par, `d`, level data, the solver.** Nothing in this plan changes a
  board or a par. `npm run verify` must stay green through every commit.
- **Job cars and bounty marks stay earn-only** (covenant 2).
- No loot boxes, gacha, or randomized rewards — the codebase's no-RNG
  stance is a stated design position, not an accident.
- No energy/lives system. The brief mentions it as a genre norm; it is
  hostile to a think-at-your-own-pace puzzle game and would collide with
  Heist/Pursuit already being the pressure modes.
- No ads in the Sandbox / Asset Library / Level Inspector (admin, and
  stripped from release builds anyway).

---

## 10. Suggested commit sequence

Each commit `npm run verify`-clean and independently shippable:

1. `js/economy.js` + save migration incl. **`proLegacy` grandfathering** + Wrench HUD
2. Shop overlay + offer sheets + i18n (10 locales), Wrenches earnable from gameplay only
3. Heist `alarmBonus` / Pursuit `timeBonus` + `assisted` telemetry + bounty guard
4. `js/ads.js` interface + web stub + headless test of every rewarded placement
5. Mediation SDK behind the interface (native only); rewarded live
6. Interstitial with cap + Better Ads compliance; banner off by default
7. Real IAP: receipts, restore, `remove_ads`, Wrench packs, Pro re-price
8. Pro/positioning copy rewrite (10 locales) + legacy-owner notice
9. ATT / UMP / privacy manifests / data-safety
10. *(conditional)* M6 subscription

Steps 1–4 carry no §2 dependency — they are pure gameplay and ship
whatever the business decision is.

---

## 11. Acceptance checklist

- [ ] `npm run verify` green at every commit; no level/par/solver change
- [ ] Every pre-existing Pro save loads with `proLegacy` and sees **zero**
      ads of any format
- [ ] `remove_ads` suppresses banner + interstitial and **leaves rewarded
      available**
- [ ] Rewarded remains available to Pro and legacy owners
- [ ] No interstitial: mid-puzzle, after a fail, on Daily/Bounty, or in
      the first session
- [ ] Banner never overlaps the board at any viewport `layout()` produces
- [ ] Bought moves/time never alter par, stars, `best`, or bounty
      eligibility; assisted runs flagged in telemetry
- [ ] No purchasable path to any job car or bounty mark
- [ ] Restore purchases works on iOS; entitlements survive reinstall
- [ ] Every new string in all 10 locales
- [ ] Headless test covers: earn → spend → offer sheet → rewarded stub →
      entitlement suppression
