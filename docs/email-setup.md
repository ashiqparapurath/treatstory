# Google Apps Script email setup for TreatStory

No custom domain is needed. Welcome, order, quote, support and seller-update emails use Google Apps Script `MailApp`, sent from the Google account that owns the deployment. The display name is TreatStory. Password-reset and verification emails use Firebase Authentication's built-in email delivery, keeping account action codes out of the relay.

## 1. Create your Apps Script

1. Open <https://script.google.com/> while signed into the Google account you want to send from. Create a new project named **TreatStory Mail**.
2. Replace the editor's `Code.gs` with the **entire** [apps-script/Code.gs](../apps-script/Code.gs) file in this repository. It contains the mail relay and optional retry trigger; no snippets are missing.
3. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Replace its contents with [apps-script/appsscript.json](../apps-script/appsscript.json). This enables V8 and requests only mail-sending, HTTP-request and trigger permissions.
4. Generate **two different random secrets**, each at least 32 characters. A password manager can generate them. Alternatively run `openssl rand -hex 32` twice in a terminal. These are new application secrets, **not** your Gmail password or a Firebase key.
5. In **Project Settings → Script Properties**, add:

| Script property | Value |
| --- | --- |
| `MAIL_WEBHOOK_SECRET` | First random secret |
| `CRON_SECRET` | Second random secret |
| `APP_URL` | `https://treatstory.vercel.app` |
| `MAIL_SENDER_NAME` | `TreatStory` (optional; already the default) |

6. Select **authorizeMail** in the function dropdown and click **Run**. Review and authorize the permissions for your own script. This checks the remaining sending quota; it does not send a test email. Do not run `doPost` manually: it needs an HTTP request body.
7. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me**, **Who has access: Anyone**, then deploy. Authentication is enforced by the signed request in `Code.gs`; Vercel must be able to call the endpoint without a Google login. If your organization blocks this deployment option, use an account that permits it or contact its administrator.
8. Copy the Web app URL ending in `/exec`, for example `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`. Use neither the editor URL nor `/dev`.

Emails use the deploying Google account's real email address. `MAIL_SENDER_NAME` changes only the display name; no `FROM_EMAIL` variable, SMTP password or domain verification is needed.

## 2. Add Vercel environment variables

Open **Vercel → TreatStory project → Settings → Environment Variables** and add these server-only values to the intended deployment environment:

```env
APP_URL=https://treatstory.vercel.app
APPS_SCRIPT_MAIL_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_MAIL_SECRET=YOUR_FIRST_RANDOM_SECRET
CRON_SECRET=YOUR_SECOND_RANDOM_SECRET
```

`APPS_SCRIPT_MAIL_SECRET` must exactly match the script's `MAIL_WEBHOOK_SECRET`. `CRON_SECRET` must exactly match the script's `CRON_SECRET`. Do not add `NEXT_PUBLIC_` to secret variables. Optional values:

```env
MAIL_REPLY_TO=your-monitored-address@gmail.com
MAIL_SUPPORT_EMAIL=your-team-address@gmail.com
```

`MAIL_SUPPORT_EMAIL` receives new support-ticket and seller-application alerts. Customers still receive their own updates. Leave these optional values unset if not needed.

Keep the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` configured: the secure order/quote APIs and mail worker still need server access to the same Firebase project. The JSON comes from **Firebase Console → Project Settings → Service accounts → Generate new private key**; paste the entire downloaded JSON into the private Vercel variable, not its filename. Do not put it in Apps Script.

The old `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO` and `RESEND_SUPPORT_EMAIL` variables are no longer used; remove them from Vercel once this change is deployed. Redeploy after saving environment variables. Publish the matching Firestore rules if you have not already; `mail_outbox` and `mail_limits` must remain private to the server.

## 3. Configure account email and automatic retries

1. In **Firebase Authentication → Settings → Authorized domains**, add `treatstory.vercel.app`. Keep Email/Password sign-in enabled. Verification and reset templates use Firebase's default sender, configured under **Authentication → Templates**; no Resend or Apps Script configuration is involved in those security emails.
2. After the Vercel update is deployed, return to Apps Script and run **installRetryTrigger** once. Authorize trigger/HTTP permissions if prompted. It installs one time trigger calling **processEmailQueue** every five minutes; running it again replaces its existing trigger without duplicating it.
3. Check **Apps Script → Triggers** for that trigger and **Executions** for failures. The retry endpoint must be publicly reachable at `https://treatstory.vercel.app/api/email/process`; Vercel preview SSO protection will block the trigger if used instead. The trigger sends `CRON_SECRET` in an HTTPS authorization header and refuses redirects, keeping it away from login/other domains.

No separate paid/external scheduler is required with this trigger. New business events also receive a bounded background processing attempt after the API responds. The timed trigger recovers due jobs after transient errors or quota resets. Each worker invocation processes up to three jobs.

## 4. Verify deployment

- Open the Apps Script `/exec` URL in a browser. It should return a small JSON health response. This confirms public access, not sending authorization or matching secrets.
- In staging, request email verification and a password reset for an account you control; those messages should come through the existing account email service.
- Exercise an order/quote/support event with test accounts and controlled recipient mailboxes. Check the recipient inbox/spam folder, Apps Script Executions and the private Firestore `mail_outbox` status. No production test email is sent by the setup functions.
- For code changes later, use **Deploy → Manage deployments → Edit → New version → Deploy**. Saving the editor file alone does not update the deployed `/exec` version. Keep the existing deployment URL where possible.
- If you later change the site domain, update both `APP_URL` values, Firebase authorized domains, and the explicit origin check in `validatedAppUrl_` in `Code.gs`, then redeploy the script and website.

## Delivery limits, retries and migration

Google's account-specific Apps Script sending/runtime/trigger quotas apply. `MailApp.getRemainingDailyQuota()` is checked before sending; quota exhaustion keeps the job pending with backoff. Operational jobs expire after 47 hours, allowing recovery across a daily quota reset. Sender reputation, spam filtering and delivery are not guaranteed. No incoming-mail inbox or bounce webhook is provided. This is intended for low-volume transactional mail, not newsletters.

Order/quote/support mail jobs commit atomically with their business transactions. Checkout retries do not duplicate them. Seller application/access changes remain acknowledged browser writes followed by a separate authorized queue request; a failed queue request is reported separately without undoing a successful save. Welcome requests require a signed-in session and create only one job per account. Built-in password resets retain neutral account-existence feedback; SDK errors/rate limits are handled in the existing UI.

Vercel signs the exact request bytes with HMAC-SHA256. Apps Script checks the signature and a five-minute timestamp window, validates a single recipient, and uses a script lock plus 72-hour private receipt records. Receipts contain hashes/state/timestamps, not message bodies or recipient addresses. Payload changes under the same event ID are rejected. Do not delete receipts or change event IDs to blindly retry a send.

Apps Script cannot atomically commit a receipt with Google's mail delivery. If an execution fails between recording a send attempt and confirming its result, the outbox records `status: review` with `DELIVERY_UNCERTAIN` rather than sending again. Check the outcome with the recipient or available account mail audit tools before deciding whether to send a replacement. Provider acceptance is recorded as `accepted`; this is not proof of inbox delivery.

Jobs already attempted through the old provider (identified by a frozen payload with a `from` field) stop with `MIGRATION_REVIEW` to avoid an ambiguous duplicate during migration. Accepted jobs remain accepted; no historical emails are backfilled. Old pending account-link jobs are not relayed to Google. If migrating an already-running deployment, inspect its pending/failed/review jobs rather than automatically requeueing them. New password reset/verification requests use built-in delivery.

Keep Vercel secrets and Apps Script properties private, and restrict project editors. Do not paste secrets into chat, source files or public logs. Private outbox data is cleaned up after processing; choose an appropriate retention/TTL policy for old metadata. Use a new verified-domain email service when volume outgrows this setup.

Official references: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [quotas](https://developers.google.com/apps-script/guides/services/quotas), [Firebase account emails](https://firebase.google.com/docs/auth/web/manage-users).
