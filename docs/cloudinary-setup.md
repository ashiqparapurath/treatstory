# TreatStory Cloudinary Free image hosting — setup and rollout

This change belongs to the **existing draft PR #2** on `feature/mobile-seller-catalog-checkout`. It does **not** create another PR, merge to `main`, or change Vercel / Cloudinary / Firebase remotely.

## 1. Configure the Cloudinary account

A free Cloudinary product environment is sufficient to get started. Open the Cloudinary Console and find the **Cloud name**, **API key**, and **API secret** in its API Keys / product environment settings.

In **Vercel → TreatStory Project → Settings → Environment Variables**, configure:

| Name | Example | Location |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | `your-cloud-name` | Server upload API |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Same Cloud name | Public image delivery SDK |
| `CLOUDINARY_API_KEY` | Your API key | Server only |
| `CLOUDINARY_API_SECRET` | Your API secret | **Secret; server only** |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `treatstory-online` | Existing Firebase client project ID |

Use **Preview** for the PR preview deployment; select Production when ready to merge. Redeploy after setting or updating environment variables. **Never** prefix the API secret with `NEXT_PUBLIC_`, paste it into Firestore, send it in chat, or commit it to GitHub.

For **Next.js 15**, we install the compatible **`next-cloudinary@6.19.3`** SDK (version 7 requires Next.js 16+). Its `CldImage` component optimizes new Cloudinary banner and product photos using automatic quality/format and responsive sizes. Legacy image sources continue to work through the Next.js Image fallback. The Cloud name is safe to expose publicly; never expose the API secret.

This implementation uses an authenticated **server-side upload proxy** with Cloudinary Basic Auth. **Do not create an unsigned upload preset.** It verifies a Firebase Auth ID token with Firebase Admin and checks the current user's Firestore role with the same bearer token:
- Homepage `banner` images: only users with `roles_admin/{uid}`.
- Seller `product` images: only active sellers with matching `sellers/{uid}` and a future `accessEndsAt`, or administrators editing legacy products.

Uploaded files are stored on Cloudinary, and only their secure HTTPS URLs are persisted in Firestore. Cloudinary credentials are not exposed in client-side code.

## 2. Image upload limits and organization

| Area | Accepted formats | Maximum size | Per listing |
|---|---|---:|---:|
| Admin homepage banners | JPG / PNG | 1,000,000 bytes | One |
| Seller product photos | JPG / PNG / WebP | 2,000,000 bytes each | 10 |
| Admin legacy product photos | JPG / PNG / WebP | 2,000,000 bytes each | 5 |

New assets appear under `treatstory/banners/{uid}` and `treatstory/products/{uid}` in Cloudinary. Existing images already stored as external URLs or Base64 in Firestore remain readable; this is not a destructive migration.

Seller Studio → Products → Add/Edit → **Photos & gallery** now accepts multiple files directly from the phone or desktop, with thumbnail previews, rearrangement, removal, and an optional manual HTTPS-URL field. Uploaded photos must still be saved with the product.

The Cloudinary free plan has usage limits, and uploads still use storage even if a user never publishes a listing. Monitor usage in the Cloudinary Console and periodically clear **unused** assets after ensuring no product references them. Automatic cleanup of unused seller uploads is not implemented in this phase.

## 3. Firebase access and Vercel

The upload API uses the already deployed Firestore security rules for `roles_admin/{uid}` and `sellers/{uid}`. In particular, the authenticated user must be able to get their own UID-scoped role/seller document. **Do not** make these collections public writable or turn off Firebase Authentication.

Cloudinary replaces Firebase Storage **for new banner and product image uploads**. Firebase Storage does **not** need to be enabled or billed for this feature. The existing `storage.rules` file remains only for possible legacy Firebase Storage use; no Storage rules deployment is necessary to use Cloudinary.

## 4. Test before merging

1. In Vercel, configure all four Cloudinary environment variables (including `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`) for the PR preview and redeploy the latest commit.
2. As a verified admin, add a new banner from a JPG under 1 MB; it should appear in Firestore as an `https://res.cloudinary.com/...` URL and display on the homepage.
3. As an active seller, upload two different product photos, rearrange them, publish, and verify the card/detail galleries work on phone and desktop.
4. As an admin managing legacy products, test the gallery upload in the admin product editor.
5. Confirm a customer and a signed-in non-seller cannot upload to `/api/cloudinary/upload`; the endpoint must return 401/403. A seller must not be able to upload a banner.
6. Check Firebase role authorization, login expiry, image type and file-size enforcement, and error reporting if Cloudinary is unavailable.
7. Verify `npm test`, `npm run typecheck`, `npm run build` and Firebase rules emulator checks.

**Cloudinary account quota:** This is a free-plan integration, not unlimited hosting. Avoid uploading sensitive/private imagery; product pictures and banners are intended to be publicly viewable.
