# TreatStory marketplace ordering — release and acceptance checklist

> Scope: existing draft PR #2 on `feature/mobile-seller-catalog-checkout`. This document describes code in that branch, not a completed production deployment.

## Implemented in the draft PR (not equivalent to live verification)

- Authenticated COD checkout is processed by `POST /api/checkout` using Firebase Admin.
- A grouped checkout is committed in one Firestore transaction with a buyer-scoped idempotency reference and one seller-order document per order line.
- Server-side validation checks current listing prices (including selected size), minimum quantity, preparation days, seller status and access expiry, delivery eligibility, booking capacity and inventory.
- Where stock is tracked, the checkout reserves either the selected variant's stock or the shared product stock. Made-to-order listings are subject to booking limits instead.
- When prices have changed, checkout returns a conflict so the buyer must explicitly accept the new prices.
- Server-authenticated order actions implement fulfilment transitions, cancellation requests, COD collection, inventory restoration and buyer/seller in-app notifications.
- Custom-order quote requests verify a seller is active, accepting orders and has unexpired access. Product-specific requests verify that the product is published and owned by that seller; issuing and accepting a quote also checks seller availability.
- The seller/admin order interface provides status workflows; the customer can view orders from `/orders`.
- Firestore client-side writes to `seller_orders`, `checkout_orders` and the private booking documents are denied. Server-side endpoints authorize actions independently.
- These changes do not include a payment gateway or actual COD money collection.

## Must complete before any public launch (P0)

1. Review the single existing PR #2; do not create another PR, push directly to `main`, or merge without approval.
2. Confirm CI is green for the **latest** commit: `npm test`, Firebase emulator suite, `npm run typecheck`, and `npm run build`. Earlier successful runs are not substitutes for the latest run.
3. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a **server-only** Vercel environment variable; its project must match `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Configure documented Cloudinary public/server-only variables in Preview. Never commit credentials.
4. Deploy the version-matched `firestore.rules` and `firestore.indexes.json` to the correct Firebase project, then verify indexes are ready. Do this in the planned release sequence, not as an unreviewed production change.
5. On a Vercel preview with a non-production Firebase test project when possible, verify new buyer/seller/admin registration, role assignment and server authorization, including rejected requests from unrelated accounts.
6. Test checkout of two differently priced sizes from one listing in the same purchase, both shared and per-option stock, one delivery fee per seller, out-of-stock errors, price changes, repeat requests and high-concurrency inventory races.
7. Test multi-seller checkout, delivery/pickup eligibility, PIN codes, unavailable shops, preparation lead times, capacity exhaustion, cancellation/rejection inventory release, double-cancellation prevention and COD completion/collection.
8. Test custom quote creation, quotation, acceptance and rejection, including expired/suspended sellers and requests referencing another seller's product.
9. Verify real Android/iPhone/desktop layouts, authentication redirects, cart restore and notification visibility. Run accessibility and performance checks with realistic product data.
10. Confirm legal, food/allergen, privacy, refund and seller responsibility documentation with appropriate professional review.
11. Prepare database backup, rollback instructions and a post-deployment smoke-test plan before merging.

## Known gaps / follow-up priorities

- **Quotes are not paid orders:** an accepted `custom_quotes` record does not itself enter the standard `seller_orders` fulfilment workflow. Define and test conversion to an order, including an accepted price, capacity and inventory checks, before relying on custom quotes for normal order fulfilment.
- **No online payment provider:** COD is the only implemented checkout payment method. Never treat placed order value as confirmed collected revenue.
- **Real production behaviour is unverified here:** CI and Firestore emulators do not establish that Vercel environment variables, live Firebase permissions/indexes, or all mobile browser paths are configured correctly.
- **Seller application policy:** the current draft requires a signed-in profile to request seller access; reconcile this with any intended guest-application flow before release.
- **Legacy data:** audit old size options without explicit prices and migrate carefully. Newly validated Firestore writes require individual variant prices.
- **Media lifecycle:** Cloudinary asset cleanup, quotas and upload abuse handling need operational monitoring.
- **Catalog search:** current full-dataset filtering/render pagination is not a complete server-side search/index solution.
- **Fulfilment:** shipping integrations, payment reconciliation, seller settlements and refunds are outside the current COD-only launch scope.

## Acceptance evidence

Keep the following evidence with PR #2:
- Latest GitHub Actions run URL and conclusion.
- Firebase emulator test output and any failures.
- Preview URL, environment names used (never secrets) and real-account test results.
- Checked Firestore rules/indexes deployment version.
- Known defects, rollback plan and final reviewer approval.

Do not label the site production-ready until the P0 acceptance tests have been completed.
