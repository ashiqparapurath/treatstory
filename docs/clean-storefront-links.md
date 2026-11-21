# TreatStory — clean seller storefront links

Public storefront links use the permanent domain and a human-readable business slug:

- Preferred: `https://treatstory.in/shop/rose-and-bloom`
- If a business name is taken: `https://treatstory.in/shop/rose-and-bloom-a1b2c3` (deterministic 6-character suffix)
- Historical seller UID and previously generated hash links continue to resolve and permanently redirect to the current canonical slug.

## New sellers

Activation of an approved and verified seller account atomically reserves a readable slug in the private server-owned `store_slugs` registry. A collision uses a deterministic short suffix; no browser can directly reserve another user's slug. URLs are not regenerated when sellers edit their display name, to keep printed labels, social bios, and past posts valid.

## Existing sellers

Opening **Seller dashboard → Store settings** triggers `POST /api/seller/storefront-link` with the current seller's Firebase ID token. This endpoint may update only that user's seller document, and in one Firestore transaction:

1. Finds a unique readable slug.
2. Reserves the new slug.
3. Retains the previous hash-based slug as an alias.
4. Updates the seller's canonical `slug`.

While upgrading, the seller sees “Preparing store link…” instead of a potentially outdated share button. If the request fails, their existing link still works.

For a full backfill (including sellers who never open their dashboard), **after deploying this change**, an authorized operator should run:

```sh
npx tsx scripts/migrate-store-slugs.ts
```

Run with the existing private server Firebase credentials, on the correct production project. The script is idempotent, paginated, and reports scanned/changed/unchanged/failed counts. **Merging the PR does not execute this production data migration.** Never post credentials, seller UIDs, or migration records publicly. Verify two real seller URLs after the migration, including one old slug and one old UID link.

## Domain and SEO

- Vercel must have `treatstory.in` configured as a production domain with valid TLS.
- Store share buttons, WhatsApp messages, Open Graph metadata, structured data, and active-store sitemap entries all use `https://treatstory.in/shop/<slug>`.
- Configure the server-only Vercel `APP_URL=https://treatstory.in` to align the **entire** site's canonical metadata and sitemap (not just store pages), and redeploy.
- Do not globally redirect `treatstory.vercel.app` until any Apps Script webhook/callback pointing to the old domain has been updated and tested: that worker intentionally refuses redirects.
- Old URL paths on either working hostname remain recognized by the storefront route, which permanently redirects UID/legacy aliases to the current slug on that hostname. Set a host redirect separately after all callbacks are ready.

Deleted-store links are marked retired: their slug stays reserved, but the deleted Firebase UID is removed from public-readable slug documents. They will not be reused for another seller.

## Manual checks

1. Approve two test sellers with the same business name. Confirm the first uses the plain name and the second gets a stable short suffix.
2. From each seller's Store settings, copy the link and share it on WhatsApp. Ensure both display `treatstory.in` and no Firebase UID.
3. Change the store's displayed business name; the public URL should remain unchanged.
4. Open the old `/shop/<uid>` and old hashed link; they should redirect to the readable slug without losing the seller's products.
5. Confirm canonical metadata and sitemap store URLs use the readable slug.
6. Check the production seller dashboard and storefront on mobile and desktop.
