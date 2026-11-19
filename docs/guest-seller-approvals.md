# Guest seller approval and account activation

TreatStory accepts seller applications without a Firebase account. Applications remain private in Firestore; the admin reviews them before seller access is issued.

## Review and plans

Admin → Seller applications → **Review & approve** opens a confirmation dialog. Approval **requires** choosing one of:
- **3-month free trial** — three UTC calendar months, clamped for month-end dates
- **6-month free trial** — six UTC calendar months
- **Full access** — no trial cutoff, subject to admin suspension/change

The chosen `approvalPlan` is saved on `seller_applications/{id}` in the same transaction as the review audit entry. Trial time starts **on verified account activation**, not when the admin reviews the request. Free trials do not bill or renew automatically.

Existing seller permission checks require a future `accessEndsAt` even for `accessType: 'full'`. Full access therefore stores a 31 December 2099 sentinel (not a paid subscription), while maintaining `accessType: 'full'`. Admins can still suspend access. If unlimited access is redesigned later, all server/client permission checks and Firestore rules must be migrated consistently.

## Guest approval email

Approval of an unlinked guest account or an unverified registered account:
1. Moves the application from `pending` to `approved` with `reviewedAt`, `reviewedBy` and `approvalPlan`; it **does not** create a seller.
2. Atomically queues one email to the original application `contactEmail` (not a client-supplied recipient), including the plan and a link to `/register?next=%2Fbecome-a-seller%3Factivate%3D1`. The registration page links to sign-in for existing users.
3. Shows the application under **Approved — awaiting account activation** in admin.
4. Upon registration or sign-in, the applicant verifies the *same* email and visits `/become-a-seller?activate=1` to select **Activate my seller profile**.
5. The server checks the authenticated Firebase UID against a fresh Firebase Admin Auth user record, including `emailVerified`, `disabled`, and matching the stored application email. The browser cannot select a different application, plan or seller UID.
6. A Firestore transaction checks the approved application, creates `sellers/{uid}` and reserves the slug, sets `activatedAt`/ `ownerUid`, and records an audit entry. It also queues the existing seller welcome notification.

Already-registered applicants with a verified Firebase account matching their application email are activated during approval. Google-authenticated and email/password-authenticated applicants use the same backend verification rules.

## Security and failure handling

- No activation is possible based on a contact-email string alone. **Verified email ownership plus a valid Firebase ID token** are both required. Email mismatches and already claimed applications are rejected.
- Transactions prevent double activation and preserve the existing seller schema, access-control rules and unique store slug reservation. No Firestore migration or Firebase Storage is required.
- An administrator must choose a plan: the API does not supply a six-month default.
- Guest applications are keyed by a hash of normalized email; authenticated submissions with an existing guest application for that email are rejected to avoid duplicates.
- All mail uses the existing transactional outbox and Apps Script relay. Set the existing mail environment variables (see `docs/email-setup.md`) and verify the mail worker; queue acceptance does not prove inbox delivery. No new client-side secret is introduced.
- Only a registered seller can use the seller dashboard; the approval state alone does not grant seller permissions.
- On failed account verification or activation, the application stays approved, allowing a later retry without losing the assigned plan.

## Rollout checks

1. Verify mail relay and `MAIL_ADMIN_EMAIL` (or `MAIL_SUPPORT_EMAIL`) are configured. Test guest approval email delivery in a non-production environment.
2. Test guest approval → email → register → verify → activate; test an existing Google account and an unverified email/password account.
3. Try wrong email, disabled account, mismatched UID, double activation, invalid plan and simultaneous activation requests.
4. Confirm 3-month and 6-month trial expiries are calculated at activation; ensure full access remains active beyond the trial horizon.
5. Confirm new seller dashboard permissions, seller product APIs, admin access editor, store slug and notifications.
