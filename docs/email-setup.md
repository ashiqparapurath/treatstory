# TreatStory: complete Google Apps Script email setup

All email delivery uses your Google Apps Script deployment: welcome, verification, password reset, order stages, custom quotes, support, seller applications and seller access. Firebase still authenticates users and generates/validates secure account links; it does not send these app-triggered messages. No custom domain, SMTP password or separate email provider is required.

The full [Code.gs](../apps-script/Code.gs) contains the signed relay, **31 custom HTML/plain-text templates**, a preview gallery, and the automatic retry trigger. There are no separate HTML files to paste. Sender address is the Google account that deploys the script; its display name defaults to TreatStory.

## Step 1 — Find your existing Firebase project ID

1. Open <https://console.firebase.google.com/> and select the project used by TreatStory.
2. Go to **Project Settings → General → Project ID**. This is the same value as your existing `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in Vercel.
3. Your standard account action host is `YOUR_PROJECT_ID.firebaseapp.com`. For example, a project ID of `my-shop-123` gives `my-shop-123.firebaseapp.com`. This Google-provided host does not require buying a domain.
4. Under **Authentication → Settings → Authorized domains**, add `treatstory.vercel.app`. Keep Email/Password sign-in enabled and Firebase's hosted email action handler configured; verification/reset buttons open that handler and return to your website.

## Step 2 — Create the script and paste the complete files

1. Sign into the Google account whose address should send the emails. Open <https://script.google.com/> and choose **New project**. Name it **TreatStory Mail**.
2. Open the repository's [full Code.gs](../apps-script/Code.gs), copy **the entire file**, and replace all contents of the editor's `Code.gs`. Save.
3. Open **Project Settings** and enable **Show appsscript.json manifest file in editor**.
4. Replace that manifest with the complete [appsscript.json](../apps-script/appsscript.json) in this repository:

```json
{
  "timeZone": "Etc/UTC",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

## Step 3 — Create two secrets and add Script Properties

Generate two different random secrets of at least 32 characters using a password manager. Alternatively, run this command twice in a terminal:

```sh
openssl rand -hex 32
```

Call the first value **SECRET_A** and the second **SECRET_B**. These are new application secrets, not your Google account password or a Firebase private key. Do not paste them into chat or the code file.

In **Apps Script → Project Settings → Script Properties → Add script property**, enter:

| Property | Value |
| --- | --- |
| `MAIL_WEBHOOK_SECRET` | SECRET_A |
| `CRON_SECRET` | SECRET_B |
| `APP_URL` | `https://treatstory.vercel.app` |
| `AUTH_ACTION_HOST` | `YOUR_PROJECT_ID.firebaseapp.com` from Step 1 |
| `MAIL_SENDER_NAME` | `TreatStory` (optional; already the default) |

Do not include `https://` or a path in `AUTH_ACTION_HOST`. Values must match exactly across Apps Script and Vercel.

## Step 4 — Authorize and deploy the web app

1. In the script editor's function dropdown, select **authorizeMail** and click **Run**. Review and authorize the permissions for your own script. This checks quota and sends no email. Do not run `doPost` manually: it needs a signed HTTP request.
2. Click **Deploy → New deployment → Select type → Web app**.
3. Choose **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**. The script verifies server signatures before sending; Vercel needs to reach it without a Google login. If your organization disallows this deployment option, contact its administrator or use an account that permits it.
4. Copy the **Web app URL** ending in `/exec`. Example: `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`. Do not use the editor URL or `/dev`.
5. Open that URL in a browser. It should return a small JSON health response. This checks access, not secret matching or live delivery.

## Step 5 — Set Vercel environment variables

Open **Vercel → TreatStory project → Settings → Environment Variables**. Add these to the environment where you will deploy the app:

```env
APP_URL=https://treatstory.vercel.app
APPS_SCRIPT_MAIL_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_MAIL_SECRET=SECRET_A
CRON_SECRET=SECRET_B
```

`APPS_SCRIPT_MAIL_SECRET` must equal the script's `MAIL_WEBHOOK_SECRET`. `CRON_SECRET` must match in both places. Keep all secrets server-only; never add `NEXT_PUBLIC_` to their names.

Optional:

```env
MAIL_REPLY_TO=your-monitored-address@gmail.com
MAIL_SUPPORT_EMAIL=your-team-address@gmail.com
```

The optional team address receives new support-ticket and seller-application alerts. No sender-address environment variable is needed: mail comes from the Google account selected in Step 4.

Keep the existing `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and private `FIREBASE_SERVICE_ACCOUNT_JSON` values configured. The secure APIs, account-link generation and mail queue require them. To obtain the JSON, open **Firebase Project Settings → Service accounts → Generate new private key**; paste the **entire downloaded JSON** as the private Vercel variable's value, not the filename. Its project ID must match the client project. Do not put this credential in Apps Script.

Redeploy Vercel after saving the variables. Publish this PR's matching Firestore rules if not already applied; `mail_outbox` and `mail_limits` must deny client reads/writes. No credentials or live Firebase publication are included in the PR.

## Step 6 — Install automatic retries

After the Vercel update is deployed, return to Apps Script and run **installRetryTrigger** once. Approve trigger/HTTP permissions if prompted.

- It installs one **processEmailQueue** trigger running every five minutes. Running the installer again replaces its trigger without creating duplicates.
- Check **Apps Script → Triggers** and **Executions** for results/errors.
- It calls `https://treatstory.vercel.app/api/email/process` with SECRET_B in an authorization header. The script refuses redirects; use the production address, not an SSO-protected preview.
- New account emails get a targeted background attempt. Business events also receive immediate background attempts. The timed trigger retries due jobs after network failures or quota resets.

No external scheduler is needed when this trigger is installed. The worker processes up to three due jobs per call.

## Step 7 — Preview and customize every template

Open your deployed script URL with `?preview=1` appended:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?preview=1
```

The gallery displays all 31 templates using sample data. It does not send mail, show real recipients, reveal secrets or expose account links.

In `Code.gs`, edit the **EMAIL_TEMPLATES** object:

- `heading`: email heading and subject.
- `tag`: the small category badge.
- `button`: default action-button wording.
- `note`: event-specific guidance.
- `tone`: optional `green` or `amber` status styling.

Edit **renderEmail_** to change shared colors, spacing, wordmark, footer and HTML layout. It uses inline styles, table layout, a mobile viewport and a plain-text alternative. It escapes dynamic text rather than inserting raw user HTML. Do not remove escaping or signature/URL validation. The secure account buttons must retain the generated action link.

Some server events deliberately supply a specific button label; that takes precedence over the template's default. Product/quantity/payment-term rows, quoted prices and seller-access details are supplied by the server when relevant. No automatic payment/refund is claimed.

| Situation | Template keys |
| --- | --- |
| Account | `welcome`, `verify_email`, `password_reset` |
| Order request and preparation | `order_received`, `new_order`, `order_accepted`, `order_preparing` |
| Pickup/delivery | `order_ready_pickup`, `order_ready_delivery`, `order_out_for_delivery`, `order_collected`, `order_delivered` |
| Cancellation/payment | `order_cancel_requested`, `order_cancel_declined`, `order_cancelled`, `order_declined`, `payment_recorded` |
| Custom quotes | `quote_requested`, `quote_ready`, `quote_accepted`, `quote_declined` |
| Support | `support_received`, `support_reply`, `support_closed`, `support_new` |
| Seller applications | `seller_application_received`, `seller_application_approved`, `seller_application_declined`, `seller_application_new` |
| Seller access/general | `seller_access_updated`, `update` |

After any Apps Script code change, choose **Deploy → Manage deployments → Edit → New version → Deploy**. Saving the editor alone does not update `/exec`. Keep the existing deployment URL where possible.

## Step 8 — Check live delivery using your own test accounts

1. Request verification and password reset for an account you control. Both should arrive from your deploying Google account using the custom template. Check inbox/spam.
2. Follow each generated link to confirm its secure hosted action page works and returns to TreatStory. If account emails fail with `INVALID_REQUEST`, check `AUTH_ACTION_HOST` against the actual Firebase project ID and ensure the deployed script is the latest version.
3. Exercise order/quote/support events using controlled test accounts/mailboxes. Check **Apps Script → Executions** and private Firestore **mail_outbox** records.
4. `accepted` means MailApp accepted the send; it does not prove inbox delivery. `pending` retries automatically. `failed` needs configuration/input investigation; `review` needs outcome investigation before sending a replacement.
5. If the retry trigger receives 401, compare SECRET_B in both places. If sending reports `UNAUTHORIZED`, compare SECRET_A and redeploy the script. If the app shows an email-service error, verify the `/exec` URL and all server variables.

The setup/preview functions send no test email automatically. No Google deployment, secret configuration or live sending is performed by this repository change.

## Limits and privacy

Google's sending, runtime, trigger and property-storage quotas apply. This setup is for low-volume transactional mail, not newsletters. Daily recipient quota is checked before sending. Operational jobs expire after 47 hours; account-link jobs expire after 45 minutes. Those are queue retry windows, not a change to Firebase action-code lifetimes. Request a fresh account email if its queued attempt expires.

The server signs exact UTF-8 bytes with HMAC-SHA256. Apps Script checks the signature, a five-minute timestamp window, the template, single recipient and approved link host. Script locks and 72-hour private hashed receipts suppress duplicates. The public preview contains only fake data. Keep project editors, Script Properties, queued action links and service-account credentials private.

Order/quote/support jobs commit atomically with their business transactions; checkout retries do not duplicate them. Seller application/access writes are followed by a separate authorized queue request, with a separate warning if queuing fails. Welcome is limited to one job per account. Account requests are limited to three per identity/hour and 100 globally/hour; password-reset responses stay neutral for known, missing, disabled and rate-limited accounts.

Google mail delivery and receipt storage cannot commit atomically. If execution fails during an ambiguous send, the queue stops with `DELIVERY_UNCERTAIN` for review rather than risking automatic duplicate messages. Do not delete receipts or replace event IDs to blindly retry. Check the recipient or available account audit tools before sending a replacement. There is no incoming-email inbox or bounce webhook. Choose an appropriate private retention/TTL policy for old outbox/quota metadata.

Official references: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [quotas](https://developers.google.com/apps-script/guides/services/quotas), [Firebase-generated secure action links](https://firebase.google.com/docs/auth/admin/email-action-links).
