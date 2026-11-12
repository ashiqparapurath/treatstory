# Account deletion & seller branding

## Included behavior

- **Buyer account:** Account > Privacy settings > Delete my account.
- **Seller account:** Seller Studio > Store settings > Account & privacy (links to the same permanent deletion flow). This deletes both buyer and seller access because they share one Firebase Auth identity.
- **Identity confirmation:** type `DELETE`; password users must re-enter their password, Google users reauthenticate via Google, and all accounts require Firebase's recent `auth_time` (five minutes).
- **Server cleanup:** `POST /api/account/delete` requires a verified Firebase ID token. Administrator accounts are deliberately blocked. Active seller orders and outstanding custom quotes block deletion.
- **Concurrency:** an `account_deletions/{uid}` marker is created before cleanup. Firestore rules and authenticated server APIs block new writes, checkout and image uploads. Checkout/custom-quote transactions read the marker for buyers and sellers. Failed cleanup is retryable after reauthentication; the marker is kept when partial cleanup occurs.
- **Data:** Firebase Authentication identity, addresses, favorites, notifications, seller application, seller listing, published products, buyer-authored reviews, support requests and closed custom quotes are removed. Completed checkout/order records remain for accounting and support, with former buyer contact details blanked. Existing Cloudinary image files are **not** purged by this release; a dedicated Cloudinary deletion/retention process should follow.
- **Seller branding:** upload a JPG/PNG/WebP logo up to 2 MB through the existing server-signed Cloudinary API. The seller must have active access; the uploaded URL is saved to `sellers/{uid}.logoUrl` when the seller clicks Save. Public `/shop/{uid}` displays it.
- **Store settings:** responsive brand preview, contacts, business availability, delivery methods, PIN codes, pickup address, time slots, capacity and response window. Concurrent edits from another tab produce a conflict instead of silently overwriting the newer settings.
- **Favicon:** browser tab points to the original `/favicon.ico`. Installed PWA icons are unchanged.

## Deployment notes

1. Deploy the revised `firestore.rules` **with** the application update. Otherwise seller logo saving can fail, and stale sessions are not blocked by Firestore. The server endpoint is an additional gate, not a substitute for deployed rules. **A Vercel redeploy alone does not deploy Firebase rules.** With Firebase CLI authenticated to the correct Firebase project, run `npx firebase-tools@14 deploy --only firestore:rules --project treatstory-online`. Inspect the target project and intended rules before confirming; this is a production authorization change.
2. Confirm `FIREBASE_SERVICE_ACCOUNT_JSON` is available only as a server-side environment secret; `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` must also remain server-only.
3. Test with dedicated demo buyer/seller accounts and Firestore/Auth emulators or isolated non-production Firebase project before deleting any real account. Do not use real customer identities to exercise irreversible deletion.
4. Verify deletion is rejected for admin accounts, active orders, outstanding quotes, stale login sessions and concurrent checkout. Retry after simulated data-cleanup failure. Verify unrelated users and completed transaction records remain intact.
5. Verify settings on narrow mobile (320px/375px), tablet and desktop; test uploading, removing, saving, reloading a logo, and a two-tab stale-save conflict. Check /shop/{uid} and browser tab favicon. The Firestore emulator test `tests/seller-store-rules.ts` exercises the exact client `runTransaction` settings payload, including `logoUrl`, and verifies that unauthorized writers and invalid logo URLs are denied. Existing sellers must have the correct `ownerUid`, active `status` and future `accessEndsAt`; their auth UID must match the seller document ID.
6. Existing uploaded Cloudinary files require their own lifecycle policy. If legal data-erasure obligations apply, implement server-side Cloudinary asset deletion and retention controls before describing account deletion as complete erasure of all files.

## Browser install notice

Chrome may log `Banner not shown: beforeinstallpromptevent.preventDefault() called` because TreatStory intentionally defers the browser's native install prompt to its existing user-initiated Install button. This does **not** cause Firestore 403 errors. Keep the custom prompt behavior, manifest, PWA and installed-app icons unchanged. Its `prompt()` is called only when the user selects the install button, as required by Chrome.

## Further roadmap

- Controlled product/image cleanup and a scheduled privacy-data retention job.
- Seller vacation schedules, order cutoff times and delivery-zone fees.
- Seller and buyer email notifications for order status and refunds.
- Buyer/seller dispute resolution and refund workflows before online payments.
- Seller analytics for conversion, repeat orders and product performance.

## Mobile Profile, More and role-aware attention indicators

The mobile bottom navigation now has five equally sized destinations:
**Home, Shop, Cart, Profile, More**. The former Sell shortcut is replaced by
a More page. Desktop header navigation is unchanged.

The Profile tab uses the existing `useAccountRole` Firebase role resolver:
- Verified administrator → `/admin`.
- Verified seller → `/seller/dashboard`.
- Customer → `/account`.
- Logged-out user → `/login`.
- Role lookup still pending or failed → `/dashboard`, whose guarded role
  router shows loading/error feedback and does not guess a customer role.

More groups real existing destinations by Account, Marketplace, Information and
Account Actions. Seller tools link to existing dashboard sections and admin
tools to existing dashboard tabs. Unknown roles never gain admin/seller links.
Language preferences are omitted until they are actually implemented.
Sign-out uses Firebase Authentication and surfaces failure feedback.

The tiny bronze/red **dot (no count)** is displayed only when there is verified
actionable work:
- Seller: at least one of their own `seller_orders` is `pending`.
- Admin: any `pending` seller application or `pending` seller order.
- Buyer: no dot until the app has persisted, meaningful unread-state metadata.

Queries use real-time, `limit(1)`, role-scoped Firestore listeners on small
viewports only; listeners clean up on unmount or role change. Firestore rules
continue to enforce authorization. The More page can show the dot next to
specific actionable destinations as well.

To verify visually, test at 320px, 375px, 430px and 768px widths using a
customer, seller, admin and signed-out session. Confirm both dashboard routing
and visibility of role-specific More items. Test pending/non-pending
applications and orders for appropriate dot display, and confirm no dots show
when the query fails. Confirm desktop nav retains its prior behavior.
