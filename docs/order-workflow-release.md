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

## Checkout and mobile refinements (8 November 2026)

- Checkout fixes the overescaped PIN regular expressions and uses the saved address's PIN automatically. The PIN remains necessary for seller delivery coverage checks. Buyers can expand “Change address” to edit the order's address and PIN without overwriting their saved default.
- Sellers can enable `advancePaymentRequired` on a listing. Buyers see the requirement on product details and checkout and must acknowledge it. The server reads the current listing, rejects unacknowledged advance terms, and snapshots the requirement with `paymentMethod: seller-arranged-advance` on the order. Legacy products default to COD. Advances are arranged and verified directly by the seller; no online payment gateway, deposit amount calculation, or automatic payment verification is implemented.
- Publish the matching Firestore rules with the app to allow the new optional boolean on seller products. The order schema remains server controlled.
- The mobile header contains the brand only, with Home, Shop, Sell, Bag and Profile in a safe-area-aware bottom dock. Favourites are available from cards and the buyer profile, with the header shortcut removed.
- Product descriptions initially show two lines, weight buttons omit prices while the selected price remains visible, reviews follow product content, and gallery controls use a translucent glass style.
- Product-description suggestions use supplied product facts (sizes, ingredients, customization, preparation, care and storage) without inventing ingredients or quality claims. The homepage hero now uses a 138 KB WebP instead of the roughly 2 MB PNG, with responsive image sizing and mobile banner typography.

### Reported console errors

The supplied Vercel preview URL returns HTTP 302 for `/manifest.json` to `vercel.com/sso-api`. The manifest link now uses `crossOrigin="use-credentials"` so a signed-in protected preview can send its cookie. An unauthenticated protected preview still requires Vercel authentication; app CORS headers cannot change the Vercel login response. Validate the public production domain separately. No deployment-protection settings were changed.

Firebase `auth/invalid-credential` is a separate email/password sign-in rejection. Login now trims email whitespace, gives a clear error and points buyers to the existing password-reset flow. No credentials were changed, and successful live Firebase sign-in was not verified.

### Local verification

- 18 regression tests pass, including saved-PIN checkout submission, address editing, and required advance acknowledgement.
- TypeScript validation and the production Next.js build pass.
- Firestore/Storage emulators load the rules and transactional tests pass, including stock races, retries, size prices, cancellation restoration, and rejecting an advance order until acknowledged, then snapshotting its terms without marking it paid.
- Chromium checks at 360, 390, 768 and 1440 pixels pass for the homepage, brand-only mobile header, bottom dock and manifest credential attribute. Mobile products, empty checkout, seller entry and login have no horizontal overflow or uncaught page errors. Authenticated live buyer/seller and production payment flows remain unverified; no real orders were placed.

### Follow-up presentation refinements

- Anchor the mobile dock flush to the bottom edge and retain safe-area padding.
- Match the profile's My favourites tab to neighbouring tabs with the same outline icon family, 16-pixel icon size, spacing, type size and background treatment.
- Remove infrastructure/provider names from account security copy, image-upload instructions, and visible access/save errors. Upload failures return plain user guidance while server logs retain technical diagnostics.
- Validation: 18 regression tests, TypeScript validation and the production build pass. Chromium confirms the dock touches the viewport bottom at 360/390 pixels before and after scrolling, with no horizontal overflow.

## Custom quote and address update

- Mobile dock order is Home, Shop, Cart, Profile, Sell, placing Cart in the centre and Sell beside Profile at the right corner.
- Quote requests select creator and product names. The server snapshots those names from authoritative records. Internal IDs remain in request payloads and database relations, not visible form fields.
- Signed-in buyers can upload a reference JPG/PNG/WebP for quotes, preview/remove it, or supply an existing HTTPS link. Reference uploads keep signature/MIME/size verification and have a server-controlled quota of ten attempts per buyer per UTC day; listing/banner role checks remain intact. Reference upload quotas use a server-only `custom_quote_upload_limits` collection, denied to browser clients by default.
- The advance-payment checkbox is now in a visible Payment requirements section while creating/editing a product, and enabled products are labelled in the seller dashboard. The existing server acknowledgement and buyer checkout notice remain in force.
- Checkout and profile address editors use modal dialogs. Checkout Save applies the new contact/address/PIN only to that order; Cancel discards changes. Profile Save updates the default address.
- Image limits remain 2 MB for products/reference images and 1 MB for banners. CDN format/quality optimization reduces delivered bytes, but does not guarantee mathematically lossless output and cannot bypass the hosting request-body limit before upload. Original images are retained; display previews use optimized delivery.

### Investigating a quote HTTP 503

The quote route calls the authenticated server backend. Missing or invalid server credentials previously produced the same generic 503 as every unexpected exception. Initialization now emits `details.code: SERVICE_NOT_CONFIGURED` and a provider-neutral message; detailed configuration diagnostics are logged server-side without credential values. Double-escaped private-key newlines are normalized before initialization. Quote forms preserve all entered details on 503 and allow an explicit retry; requests are not automatically replayed.

For a deployed 503, inspect the response body and the server logs for `POST /api/quotes`. A `SERVICE_NOT_CONFIGURED` response requires setting the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` to a valid complete service-account JSON for the same project as `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, then redeploying. The account needs the permissions used by the existing transactional checkout/quote backend. Never put the JSON in a `NEXT_PUBLIC_` variable, a browser form, or source control. For other 503 responses, inspect the recorded unexpected exception; do not assume missing configuration from status alone. This session has no Vercel configuration/log connection and has not confirmed or changed live deployment credentials.

### Validation for this update

- 22 passing regression tests cover saved PINs with modal address callbacks, advance acknowledgement, missing secure-service configuration, escaped key newlines, authoritative quote-name snapshots, and authenticated/rate-limited reference uploads.
- Production build and TypeScript validation pass.
- Browser fixture checks with mocked account/network data pass for the dock order, named selections, uploading and attaching a reference, preserved form values on 503 followed by successful retry, and checkout/profile popup save/cancel behaviour at 390/1440px. No live authenticated quote or photo was created.

## Existing-product save repair

A seller-authorized emulator reproduction confirmed that editing an existing listing with eight sizes, twelve allergen labels, twelve dietary labels and six personalization prompts failed under the previous rules with the 1,000-expression limit. This is a rules evaluation failure, not a price calculation or image-upload failure. The screenshot's generic toast alone cannot establish that the deployed failure has the same cause.

Product updates now validate changed list fields while retaining the stored values of unchanged lists. Price-only variant edits validate the new price without repeatedly validating unchanged size, unit and stock metadata. Owner checks, active/unexpired seller access, allowed field names, timestamps and changed-field validation remain enforced. New listings retain full validation; creating a new listing at all maximum variant/food limits remains a known rules-budget limitation outside this edit repair.

The seller editor keeps failed changes open, displays a persistent plain-language error, and logs the error code/operation and field counts without dumping product/contact details. Preparation days are checked as a whole number before submission.

`tests/seller-product-rules.ts` uses the real client SDK with seller identity against the emulator, rather than administrator writes for assertions. A detailed existing listing is seeded administratively as a migration fixture; the actual updates use the seller's credentials. Tests cover base fields, all eight variant prices, advance requirements, food labels/personalization, and rejection of missing/negative/null prices, malformed/oversized labels, unknown variant fields, changed ownership/creation time and expired access. CI now runs this alongside the existing atomic-order emulator suite. The old rules reject the seeded listing's edit; the revised rules pass the edit tests.

Publish the matching `firestore.rules` to the same project used by the deployed app, and deploy the editor change. A PR push does not publish database rules. No live rules or application deployment was performed in this session.
