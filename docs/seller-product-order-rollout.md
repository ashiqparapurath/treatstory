# Seller orders, product details and admin access — rollout notes

This change is included **only in existing draft PR #1**. No production merge or Firebase deployment is performed by a GitHub commit.

## Features

- Seller order management removes the Completed order value metric and the seller-only subtotal footnote.
- Seller orders show a bounded seller-scoped Firestore fallback when the primary newest-first query fails with `failed-precondition`. This is a *temporary* unindexed view ordered by document ID; it is not a reliable replacement for the newest-first query. On `permission-denied`, the view instead shows a specific access error and retry.
- Seller fulfillment adds `ready → out-for-delivery → completed`; `ready → completed` remains possible for pickup/other direct fulfillment. Buyers and admins see the same status.
- Marketplace product cards use all supplied image URLs (even legacy newline-separated data) and open a shareable `/product/seller%3A{id}` page. Legacy cards open `/product/{id}`.
- Product detail pages allow browsing photos and submitting optional personalization requests; each product's note travels with its cart entry into `customerNote` at checkout. **No pricing or payment changes are automatically applied**.
- Seller product creation/editing allows up to 10 HTTPS photos, optional weight/unit, minimum order quantity, customization prompts and handling notes.
- Admin seller management offers status filtering, manual trial expiry date, access-plan selector and day-based extension with confirmation.

## Firebase project changes required before going live

**Do not deploy directly to a production Firebase project without staging validation.** Reconcile existing indexes (the local file does not necessarily contain all index definitions present in Firebase).

1. Review `firestore.rules` in this PR. Its `validMarketplaceProduct` accepts validated optional weight, quantity, care and personalization fields.
2. Review the `seller_orders` rule that authorizes the `out-for-delivery` status transition only for the seller on their own order (or admin).
3. Verify the **Collection-scope** composite index **`seller_orders`: `sellerId` Ascending + `createdAt` Descending** is **Enabled**. This enables the primary seller incoming-order feed. The required definition is in `firestore.indexes.json`.
4. Verify other dashboard and account indexes listed in `docs/dashboard-rollout.md` are already Enabled.
5. Reconcile indexes, review rules in a staging Firebase project, and only then deploy to the intended environment:

```bash
firebase login
firebase firestore:indexes --project treatstory-online
# Reconcile remote indexes with firestore.indexes.json before proceeding!
firebase deploy --only firestore:rules,firestore:indexes --project treatstory-online
```

**Important:** Updating rules in the Firebase Console without the index will not make the newest-first seller order feed work. Conversely, enabling the index without deploying the new rules will cause `out-for-delivery` and the new optional product fields to be rejected.

## Validation

- Use a staging seller account with at least two orders, including a pending order and a ready order.
- Simulate missing composite index: seller should see a limited fallback view and its explicit warning, not a blank generic error.
- After enabling index: newest 20 orders ordered by `createdAt`, Load older orders via cursor, status changes to Out for delivery and Completed reflected for buyer.
- Verify seller may update only their own order; another seller and a guest must be denied by Firestore.
- Add two valid URLs on separate lines in a product; verify card arrows, thumbnail gallery, and details page. Confirm the item is shareable.
- Confirm weight and personalization save and reload, values appear on detail page, and minimum quantity is enforced at checkout and in rules.
- Confirm an admin can extend or set an expiry for any seller and non-admin cannot do so.
- Run `npm test`, `npm run typecheck`, `npm run build` and real mobile browser checks.

**Not included:** Secure stock reservation, payment settlement, actual carrier/tracking integrations, priced product variants or trusted delivery notifications. "Out for delivery" is a seller-updated fulfillment status, not verified courier tracking.


## Product-level delivery charges (optional)

A seller can set **Product delivery charge (₹)** in Product editor → **Pricing & availability**:
- Blank: inherit the store-wide delivery charge configured in **Store settings → Delivery** (backward compatible with existing products).
- `0`: free delivery for this product.
- Any amount from ₹0 to ₹5,000: override the store-wide fee for this product. Pickup always has no delivery fee.

When a buyer checks out with several products from **one seller**, TreatStory applies the **highest applicable product/store delivery charge once per seller**, not per quantity or per product line. Multiple different sellers each have their own delivery charge. The amount is estimated on the checkout page before the order is placed and revalidated in the server-side transaction; if it changes, the buyer must review the latest estimate. Fees are saved in the original seller-order record and included in checkout totals and order details.

The field is optional on the product schema; old records keep their store-wide fallback. Editing an existing product and clearing the override removes the field rather than silently preserving the last custom charge.

Deployment note: **Firestore security rules must be deployed** to permit the new `deliveryCharge` product field for any browser-side Firestore writes. The API uses server-owned writes, but the new rules provide coherent validation for direct authorized legacy writes too. The existing `firebase-rollout.yml` workflow deploys production rules/indexes separately from the Next.js/Vercel application.


## Seller contact bubbles and market-price quotation prefill

On **mobile product details**, website chat and WhatsApp are accessible as two clearly labeled, 44px round icon actions immediately beside the seller name. The longer **Contact seller** card is desktop-only to avoid duplicate controls on small screens. Website chat opens the seller's own TreatStory support thread; WhatsApp opens the seller's WhatsApp contact externally when available. The site and WhatsApp buttons have different icons and accessible labels.

For hidden-price products, **Request current price / Ask for price** navigates to `/custom-orders?seller=<sellerId>&product=<productId>&mode=price`, including the selected size where applicable. The quotation form:
- Automatically selects the seller and linked published product.
- Prefills **Occasion: Price enquiry** and an editable description containing verified product name, category, selected variant size, optional SKU and listing description.
- Only accepts size details that match the product's own configured size options; unrecognized URL-supplied sizes are ignored.
- Makes a buyer's approximate budget **optional** for price-on-request listings; a blank budget is stored as zero using the existing quote schema and displayed to buyer/seller as **Budget not specified**.
- Still requires the buyer to select a preferred fulfillment date and explicitly submit the request. No quote price is invented or charged automatically.
- Preserves seller, product and size through sign-in; it does not overwrite already edited text when product data arrives.

The seller reviews the submitted request and sends a confirmed quote using the existing custom-order workflow. Standard fixed-price products retain their normal Buy now / Add to bag actions and optional custom quote link.
