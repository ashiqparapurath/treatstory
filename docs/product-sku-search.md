# Automatic product SKUs for Instagram discovery

Every product saved through the seller's **New product** action receives a server-assigned, immutable and globally unique code such as `TS-AB23CD45` (eight ambiguity-free letters/digits).

- Creation: the authenticated seller API generates a cryptographically random candidate and reserves it by creating `product_skus/{sku}` atomically with the new `marketplace_products/{productId}` record. Any collision triggers a retry. SKU reservations are never recycled, even after a product is deleted.
- Edits: sellers cannot supply or change the SKU. Editing a listing keeps its original code; editing a legacy listing with no SKU assigns one.
- Discovery: buyers type a product name or SKU into the **existing catalog search bar** on the home page or Shop All page; no separate Instagram/SKU input or banner exists. When the entire SKU is entered, a public server endpoint looks up the reservation, verifies the listing is published, and shows a clickable product result even when it is not among the initially loaded products. Drafts, deleted records and malformed codes cannot be resolved.
- Sharing: seller studio shows copyable SKUs beside each product; product details show a copyable SKU and storefront product cards display it on the image. One SKU identifies the whole product, including its weight/size variants.
- Security: the registry is inaccessible to client Firestore SDKs; seller rules reject forged SKUs and updates that change existing SKUs. Public lookups return no seller-private information.
- Existing products: legacy listings are not modified silently. Saving an edit to an old listing without a code will generate it. The seller dashboard marks listings that still need an SKU. Do not invent codes for old products before they are saved via the server.
- Deploy: the website requires the configured server-side Firebase Admin credentials. **Deploy `firestore.rules` to `treatstory-online` separately**; a Vercel deployment alone cannot publish Firestore security rules. No new composite Firestore index is needed because a SKU lookup is a direct document read.
- QA: test unique SKUs for two new products, stable SKUs after edits, ordinary name search, exact SKU search for a product beyond the first page, draft search 404, published search success, deleted product search 404, mobile search, copy-to-clipboard and denied client attempts to set or change SKU. Verify npm tests, emulator tests, TypeScript checks and production build.

## Product save validation

The seller editor and server now agree on preparation times of 0–365 days. If the server rejects a request with HTTP 400, the response contains only human-friendly form-field labels (not product content, tokens or provider internals); the editor preserves the unsaved draft and displays the error without an unhelpful `code: unknown` console message.
