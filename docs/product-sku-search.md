# Automatic product SKUs for Instagram discovery

Every product saved through the seller's **New product** action receives a server-assigned, immutable and globally unique code such as `TS-AB23CD45` (eight ambiguity-free letters/digits).

- Creation: the authenticated seller API generates a cryptographically random candidate and reserves it by creating `product_skus/{sku}` atomically with the new `marketplace_products/{productId}` record. Any collision triggers a retry. SKU reservations are never recycled, even after a product is deleted.
- Edits: sellers cannot supply or change the SKU. Editing a listing keeps its original code; editing a legacy listing with no SKU assigns one.
- Discovery: buyers type the SKU into the visible **Saw it on Instagram?** search bar on the home page or Shop All page. A public server endpoint looks up the reservation and returns the product ID **only for published listings**; drafts, deleted records and malformed codes are never returned.
- Sharing: seller studio shows copyable SKUs beside each product; product details show a copyable SKU and storefront product cards display it on the image. One SKU identifies the whole product, including its weight/size variants.
- Security: the registry is inaccessible to client Firestore SDKs; seller rules reject forged SKUs and updates that change existing SKUs. Public lookups return no seller-private information.
- Existing products: legacy listings are not modified silently. Saving an edit to an old listing without a code will generate it. The seller dashboard marks listings that still need an SKU. Do not invent codes for old products before they are saved via the server.
- Deploy: the website requires the configured server-side Firebase Admin credentials. **Deploy `firestore.rules` to `treatstory-online` separately**; a Vercel deployment alone cannot publish Firestore security rules. No new composite Firestore index is needed because a SKU lookup is a direct document read.
- QA: test unique SKUs for two new products, stable SKUs after edits, draft search 404, published search success, deleted product search 404, mobile search, copy-to-clipboard and denied client attempts to set or change SKU. Verify npm tests, emulator tests, TypeScript checks and production build.
