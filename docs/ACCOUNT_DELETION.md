# Account deletion

## Current state: there is no account system to delete

Midnight Garage has **no user accounts, no sign-in, and no login screen**
— verified by inspection, not assumption:

- No auth/session code exists anywhere in `js/*.js` (no `signIn`,
  `signUp`, `session`, or similar patterns).
- `supabase/schema.sql` defines exactly one table, `public.events`, used
  only for anonymous analytics (random `device_id`, no name/email/account
  identifier of any kind). Its row-level-security policy allows the
  anonymous key to `insert` only — there is no `select`/`update`/`delete`
  policy for the client, i.e. the app itself has no way to read back or
  remove a user's own rows even if it wanted to.
- `js/config.js` ships with blank Supabase credentials, meaning analytics
  is inactive in the current build — see
  [docs/PRIVACY_POLICY_TEMPLATE.md](PRIVACY_POLICY_TEMPLATE.md) for why
  that distinction matters.
- Game progress, settings, and purchase-entitlement state all live only
  in on-device storage (`js/storage.js`, via `@capacitor/preferences`
  natively or `localStorage` on web) — nothing server-side to delete.

Because there is no account to delete, **this repo does not add an
in-app "Delete account" button** — a button with nothing behind it would
be misleading, and the task instructions this doc was written under are
explicit that a fake control must not be added. What follows is (1) what
a user can already do today, and (2) exactly what would need to be built
if that changes.

## What a user can do today

- **Local data**: uninstalling the app deletes all locally-stored
  progress, settings, and cached entitlement state — there is no
  additional "reset" needed, since nothing is mirrored server-side.
- **Analytics data (if a user has played a build with analytics
  active)**: because the client can only insert rows and never read or
  delete them, there is currently **no self-service way** for a user to
  request their own analytics rows be purged. This is the one real gap:
  - **Manual process, until a self-service path exists**: a user who
    wants their analytics data removed should be able to contact support
    (the support address in `docs/store-listing/support.html`) with
    their device's random `device_id` (visible only via
    developer-facing debug tooling today — there is no in-app way for a
    user to see their own `device_id`, which is itself worth fixing
    alongside the TODO below) or an approximate date/time of play, and
    the developer deletes matching rows via the Supabase service-role
    key (`delete from public.events where device_id = '...'`) — a manual
    console/SQL action, not an automated flow.
  - This manual process is only relevant once analytics is actually
    turned on (`js/config.js` filled in) — with the current blank
    config, there is no data on the server to delete in the first place.

## TODO if user accounts are ever added

If Midnight Garage ever adds real accounts (e.g. cross-device save sync,
leaderboards tied to an identity), both platforms' account-deletion
requirements apply and need real implementation, not documentation alone:

1. **Client**: an accessible "Delete account" control in the
   settings/profile screen, requiring explicit confirmation and stating
   the consequences in plain language (what's deleted, whether it's
   reversible, how long it takes) before submitting.
2. **Server**: a privileged, authenticated endpoint (Supabase Edge
   Function using the service-role key, or equivalent) that:
   - Verifies the request is from the authenticated account being
     deleted (never a client-suppliable ID with no auth check).
   - Deletes or irreversibly anonymizes every row tied to that account
     across every table that gained an identity column — not just
     analytics.
   - Revokes any active session/auth tokens for that account.
   - Handles purchase-entitlement records per each store's own
     requirements (Apple/Google may require entitlement history to be
     retained for a period for fraud/refund purposes even after account
     deletion — confirm current platform policy before implementing,
     this is not something to guess at).
3. **Both stores' consoles**: Google Play's Data Safety form has an
   explicit "Account deletion" section requiring either an in-app path
   or a working web URL that lets a user request deletion without
   installing the app; Apple's App Review Guidelines (5.1.1(v)) require
   the same for apps with account creation. Both would need to be
   answered "Yes, and here's the path" truthfully, matching what's
   actually shipped — not aspirationally.
4. **This document** must be rewritten at that point to describe the
   real, shipped path (screen name, exact steps, what's retained and
   why) rather than this "no accounts exist" state — a stale version of
   this doc making false claims is worse than no doc.

## Release-blocker status

**Not a blocker today** — there is nothing that constitutes an
"account" under either store's definition, so their account-deletion
requirements do not apply yet (see
[docs/STORE_SUBMISSION_CHECKLIST.md](STORE_SUBMISSION_CHECKLIST.md) §13).
**Becomes a hard release blocker** the moment any account/identity system
is added — do not ship an account feature without the TODO above
completed first.
