# What's next (post-Fogleman import, 2026-07)

Sequencing for the next stretch of work. Written right after Gridlock's
ceiling moved to par 60 (`6d8a72c`) via 20 boards imported from Michael
Fogleman's exhaustive database — which left **405 more verified boards
(par 41–60) on the table**, regenerable any time from the checked-in
source via:

    node tools/import-fogleman.mjs tools/data/fogleman-boards.txt \
      --min-par 41 --out .genwork/fogleman-pool.json

That surplus reshapes the priorities: the two remaining content-hungry
features ([HEIST-PLAN.md](HEIST-PLAN.md) H4 Bounties, and the v2.0
"Featured Boards" idea) no longer need any generator work — the content
already exists, verified.

Current state, verified against the code (not just the docs): heist phases
H0–H3 all shipped; ship-polish P0s closed (copy localized, fonts bundled,
hitch coherent); campaign is 200 levels, par 6–60, all `par == optimal`.

---

## N1 — H4 Bounties: "Tonight's Mark" *(recommended next)*

The last unshipped heist phase, and the retention beat the collection meta
has been waiting on: the garage's empty bays currently have nothing
recurring to advertise.

Per [HEIST-PLAN.md §6](HEIST-PLAN.md), now cheaper than when it was
planned:

- **Boards:** curate straight from the Fogleman surplus instead of seeding
  the generator. A checked-in rotation list (`js/bounty.js` or a data
  file) of ~60–90 boards drawn from the 405, cycled deterministically by
  date — same date-seeded pattern as `dailyLevel`, no backend.
- **Win conditions:** "≤ par", "no hints", "alarm intact" — all already
  tracked per-attempt.
- **Rewards:** extend `js/collection.js` with bounty-gated cars (rarity
  tiers matched to board par). Covenant intact: skill-gated, cosmetic-only.
- **Surfaces:** "Tonight's Mark" slot on the start screen; bounty state in
  `save.bounties`; `bounty_complete` analytics event; i18n ×10.
- **Verify:** extend `tools/verify-levels.mjs` to solve the whole bounty
  rotation deterministically, like the 14-day daily check.

One marketable beat: *"A new mark every night."*

## N2 — The Impound Lot (Featured Boards, pulled forward from v2.0)

A post-campaign, Pro-gated board list for players who finish level 200 —
the natural home for the rest of the Fogleman surplus after bounties take
their cut. Roughly: a fifth "chapter" surface (NOT a fifth chapter — the
4×50 shape and unlock semantics stay untouched) listing curated hard
boards with their par, best, and stars. Cheap because it reuses the level
list UI and the pool is pre-verified. Also the natural landing place for
levels promoted from the sandbox via `tools/promote-sandbox-levels.mjs`.

## N3 — Small polish with no dependencies

- **Solution replay** (v1.1 item): the solver already returns the optimal
  path; play it back on the win sheet / after skip. Small `game.js` work.
- **P2 leftovers audit** from [SHIP-POLISH-PLAN.md](SHIP-POLISH-PLAN.md):
  alarm audio/visual details, accessibility pass on newer surfaces
  (garage, sandbox, bounties once N1 lands), dead-wiring sweep.

## N4 — Blocked here, needs your side

Can't be done from this cloud environment; unchanged from
[PLAN-STATUS.md](PLAN-STATUS.md)'s 🔶 items:

- `npx cap add ios`, launch screen, `AVAudioSession .ambient` (Xcode).
- StoreKit purchase wiring for Pro Garage; Game Center leaderboards.
- Store listing: preview video, ASO copy, trademark/domain checks.
- Supabase creds in `js/config.js` to turn analytics on — which then
  unblocks the v1.1 data work (re-fit difficulty weights from the live
  funnel, paywall placement).

---

**Recommended order: N1 → N2 → N3**, with N4 whenever you're ready on the
native/business side. N1 first because it's the last heist phase, the
strongest retention lever, and the Fogleman surplus just removed its only
expensive part.
