# Transactional email setup

TreatStory sends mail through the Resend HTTPS API. Authentication and password changes remain in Firebase Authentication; the Admin SDK generates secure verification/reset links and Resend delivers TreatStory-branded HTML and plain-text messages. No password is sent to the email API.

## Configure the deployment

Set these **server-only** environment variables in each deployment that should send mail:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key with permission to send email; never use a `NEXT_PUBLIC_` prefix |
| `RESEND_FROM_EMAIL` | `TreatStory <hello@your-verified-domain.com>` |
| `APP_URL` | Canonical HTTPS site origin, e.g. `https://your-domain.com` |
| `RESEND_REPLY_TO` | Optional monitored reply mailbox |
| `RESEND_SUPPORT_EMAIL` | Optional team mailbox for new support tickets and seller applications |
| `CRON_SECRET` | Long random secret used to authenticate the retry worker |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Existing server credentials for the same project as `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |

1. Add and verify the sending domain in Resend, including the DNS records it supplies. The testing sender is restricted; use your verified domain for customers.
2. Add the `APP_URL` hostname to Firebase Authentication's authorized domains. Keep its hosted action handler enabled: verification/reset buttons use Admin-generated hosted action links, returning to `/account` or `/login`.
3. Add the server environment values and redeploy. Do not commit keys, service-account JSON or live action links.
4. Publish this PR's matching Firestore rules; `mail_outbox` and `mail_limits` deny all client access.
5. Configure a scheduler to call `GET https://your-domain.com/api/email/process` every minute with `Authorization: Bearer <CRON_SECRET>`. The worker handles three jobs per call; increase scheduler frequency/concurrency for greater volume. Use a hosting plan/scheduler that supports this cadence. No paid cron plan is selected automatically. Jobs also receive a bounded attempt after relevant API responses; the scheduler is required for reliable recovery after downtime.
6. Validate in staging using a mailbox you control, then inspect the Resend dashboard for delivery/bounce results. This implementation records provider acceptance, not inbox delivery; it does not implement a bounce webhook or an incoming-email inbox.

## Included messages

- Registration welcome with a verification link, verification requests from Profile, and Forgot password. A name-save or email-request failure does not undo successful registration.
- Order request receipts and new-order alerts; acceptance, preparation, pickup/delivery, completion, cancellation requests/outcomes, and seller-recorded payment updates.
- New custom requests, quotes, acceptance and declined requests.
- Support receipts, replies/closure, plus optional new-ticket alerts to the team mailbox.
- Seller application submission/review and access changes, plus optional new-application alerts to the team mailbox. Existing browser writes are acknowledged first; a separate authenticated server request derives recipient/content from the committed record and deduplicates by its timestamp. If this queue request fails, the UI explicitly reports that the change was saved but its email could not be queued. It does not roll back or ask users to repeat a successful application.

No marketing subscriptions or automatic login-success emails are added. Authentication operations not offered by this app retain their provider-managed behavior. Quotes remain requests; no message claims a charge or refund happened automatically.

## Retry behavior and privacy

Business API notifications and email jobs commit atomically with their order/quote/support transactions. Checkout retries do not duplicate mail. Workers lease jobs, freeze the recipient/content before the first send, and use one Resend idempotency key per event. Transient network, rate-limit and server errors retry with backoff; permanent provider rejection is recorded as failed. Operational emails expire after 23 hours, within Resend's 24-hour idempotency window; account action emails expire after 45 minutes. Expired/accepted/failed jobs clear stored payloads and action links. These expiry windows stop retries; they are not a claim about the authentication token's actual lifetime. Do not requeue an old ambiguous send using a new idempotency key without checking its provider result.

Missing email configuration never rolls back an order; it leaves its queued mail for recovery within the expiry window. Account-email requests instead show a provider-neutral unavailable message when mail configuration is missing. Reset requests give the same response for known, missing, disabled and rate-limited accounts. Account requests are same-origin, schema-validated and limited to three per identity/hour and 100 globally/hour; recipients and action links are server-derived. Seller updates require owner/admin authorization, and there is no public arbitrary-recipient send endpoint.

Keep the outbox and quota collections private. Restrict administrative access; queued action links are sensitive. Add Firestore TTL/retention policies for old metadata/quota records as appropriate. Never log email payloads, authentication links or API keys.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Firebase action links](https://firebase.google.com/docs/auth/admin/email-action-links).
