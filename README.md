# TreatStory

**Little finds, lovely stories.**

TreatStory is a curated marketplace celebrating independent creators across Kerala. Discover home-baked treats, handmade crafts, original art, thoughtful gifts, and other products made with care.

## What we're building

- **For shoppers:** Explore products from home bakers, artists, and handmade creators, and shop their collections.
- **For creators:** Apply to become a seller, showcase products, and manage a storefront once approved.
- **For the TreatStory team:** Review seller applications and manage marketplace activity.

Seller applications can be submitted without signing in. Seller account access is granted only after review and activation.

## Technology

Built with Next.js, React, TypeScript, Tailwind CSS, and Firebase.

## Created & maintained by

**Ashiq**  
Instagram: [@mrashiq._](https://www.instagram.com/mrashiq._)

---

© 2026 TreatStory. All rights reserved.

## Transactional email

All app emails, including verification/password reset, use a signed Google Apps Script relay with 31 branded HTML/plain-text templates. Firebase generates and validates secure account links; Apps Script sends the messages from the deploying Google account. See [email setup](docs/email-setup.md) and the complete [Code.gs](apps-script/Code.gs) for deployment, environment variables and the included retry trigger. No custom email domain is required; no secrets are stored in this repository.

## Repository guide

Start at [the documentation index](docs/README.md) for architecture, deployment, seller workflows, testing and audit reports.

| Location | Contents |
| --- | --- |
| `src/app/` | Next.js pages and API endpoints |
| `src/components/` | Marketplace components; `ui/` contains only actively used primitives |
| `src/firebase/`, `src/lib/`, `src/hooks/` | Firebase integration, shared logic and hooks |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Firebase access controls and indexes; deploy separately from Vercel |
| `apps-script/` | Transactional mail relay |
| `scripts/`, `tests/` | Audit tooling, maintenance commands and automated tests |
| `infra/support-matrix/` | Inactive encrypted-chat infrastructure; keep disabled until approved |

Run `npm ci`, `npm test`, `npm run typecheck`, then `npm run build` before submitting a PR. Node.js 24 is required.

**Deployment:** Vercel deploys the Next.js application, not Firebase rules or indexes. Follow the [production hardening rollout](docs/production-hardening-rollout.md) for data migrations, rules, seller verification and operational checks. The Matrix chat system is not yet approved for activation.

**Assets:** Do not delete generated `public/icons/`, `public/splash/` or `public/img/hero/` files based only on similar names: app installations, cached manifests and generated metadata may reference versioned paths.

### Seller AI description suggestions

Add and Edit listing share an optional Gemini preview. Sellers choose a language and style, review the facts and apply the text explicitly. Product saves do not call Google. Only public listing text and sizes are sent. Exclude personal or confidential information. Google's unpaid services may use prompts and responses for product improvement and human review. See [Gemini API terms](https://ai.google.dev/gemini-api/terms).

Set the server-only variables in Vercel and redeploy. The route reuses the existing Firebase Admin configuration and checks the active seller document and access expiry. Use an AI Studio project without billing for free-only operation. TreatStory does not change billing, retry provider calls or select a fallback model.

| Variable | Default or purpose |
| --- | --- |
| GEMINI_API_KEY | Required to generate. Use a server-side Gemini API key restricted to the Gemini API. |
| GEMINI_MODEL | gemini-2.5-flash-lite. Confirm model access in your project before rollout. |
| GEMINI_SELLER_DAILY_LIMIT | 5 attempts per authenticated seller per UTC day |
| GEMINI_PLATFORM_DAILY_LIMIT | 100 attempts across the marketplace per UTC day |
| GEMINI_PLATFORM_MINUTE_LIMIT | 5 attempts across the marketplace per UTC clock minute |

Limits accept nonnegative integers. Zero disables that allowance. Firestore reserves each attempt in one transaction before contacting Google. Failed provider calls count because their actual usage can be uncertain. Quota lookups and invalid input consume no generations. The server overwrites fixed counter documents without storing prompts or responses. These limits are independent of Google's changing quotas. Confirm current [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [model availability](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite).

### Seller product wizard

The seller dashboard uses the same four steps on phones, tablets and desktop. Product basics includes the optional Gemini preview described above. Photos upload to the existing Cloudinary service and the first image is the cover. Pricing uses either one INR price or a price for each size. Review offers explicit draft and publish actions. Published products link to their storefront page. Drafts are visible in the seller catalog.

An unfinished new listing can be recovered when the same seller reopens the editor after navigating within the app. Closing and confirming discard clears it. Reloading or closing the tab clears in-memory recovery. No listing data, credentials or upload tokens are written to browser storage by the wizard. Product creation accepts an optional request ID so retries return the original listing and SKU. Edits retain the existing version check. The wizard shares the existing Firebase, Cloudinary and Gemini environment variables and requires no database migration.

Closing an edited listing in the app opens a TreatStory confirmation with **Keep editing** and **Discard changes**. Refreshing or closing the browser tab may show the browser’s own unsaved-changes warning.

### Guest seller approval and activation

Admins can approve guest applications before the applicant creates a Firebase account. Reviewers must choose a **3-month trial**, **6-month trial**, or **full access** in the approval dialog; there is no automatic six-month assignment. A queued approval email invites the applicant to register or sign in using the original contact email, verify that email and activate the approved seller profile. Trial time begins at activation, not approval. The secure server endpoint binds the approval to the verified Firebase identity and creates the seller with the existing Firestore schema. Read [guest seller approval and activation rollout](docs/guest-seller-approvals.md) before deploying; live mail delivery and verified-device flows require staging checks.
