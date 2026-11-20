# Admin banner upload rollout

New TreatStory banner images are stored on **Cloudinary**, not Firebase Storage. Use the complete setup and security guide in [Cloudinary setup](cloudinary-setup.md).

The existing Firestore `banners` collection keeps title, subtitle, button text/link, active status and the Cloudinary `imageUrl`. Image-only banners additionally store click mode, accessible labels, image ratios, optional mobile art, and desktop/mobile percentage hotspots. Old banner documents continue to render in standard mode. Admin saves now await the upload and Firestore confirmation. A verified `roles_admin/{uid}` document is required. Previous Base64 images can still be displayed, and existing Firebase-hosted image links are not deleted.

A banner JPG, PNG or WebP can be selected up to **16 MB**. The browser automatically optimizes files larger than 3.4 MB into an upload below that limit, while the API accepts a maximum **4,000,000-byte** final banner payload. The API request-body reader now uses the banner limit instead of the product limit; ordinary product images remain capped at 2 MB. This avoids HTTP 413 errors for typical high-resolution artwork without exposing unsigned Cloudinary uploads. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as server-side Vercel variables, then redeploy the PR preview. Firebase Storage is not required for new banner uploads, and there is no Cloudinary unsigned preset.

Run GitHub regression tests, TypeScript checks and the production build. Check the PR preview with a real verified administrator before merging. Live Cloudinary account setup and Vercel deployment remain manual.
