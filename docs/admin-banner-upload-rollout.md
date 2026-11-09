# Admin banner upload rollout

New TreatStory banner images are stored on **Cloudinary**, not Firebase Storage. Use the complete setup and security guide in [Cloudinary setup](cloudinary-setup.md).

The existing Firestore `banners` collection keeps title, subtitle, button text/link, active status and the Cloudinary `imageUrl`. Admin saves now await the upload and Firestore confirmation. A verified `roles_admin/{uid}` document is required. Previous Base64 images can still be displayed, and existing Firebase-hosted image links are not deleted.

A banner JPG or PNG must be under **1,000,000 bytes**. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as server-side Vercel variables, then redeploy the PR preview. Firebase Storage is not required for new banner uploads, and there is no Cloudinary unsigned preset.

Run GitHub regression tests, TypeScript checks and the production build. Check the PR preview with a real verified administrator before merging. Live Cloudinary account setup and Vercel deployment remain manual.
