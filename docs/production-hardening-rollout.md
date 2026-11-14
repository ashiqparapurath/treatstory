# Marketplace hardening rollout

This change does not certify production readiness. It supplies application fixes, migrations, operations checks and deployment tooling. COD remains enabled; online payments, automated refunds and settlements are deliberately deferred by the owner. Matrix remains disabled.

## Before merging

1. Review this single PR and require both **build** and **encrypted-support** checks. In GitHub Settings → Rules → Rulesets, protect `main`, require a pull request and these checks, and prevent force pushes/deletion. The connected app cannot administer repository rulesets; no protection change is claimed.
2. Review the policy text with the actual operator and a qualified adviser. Set server-only `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_CONTACT_PHONE`, `LEGAL_GRIEVANCE_OFFICER`. Do not substitute invented information. Until configured, both pages explicitly show that details are awaiting publication.
3. Confirm the six-calendar-month offer and the policy for existing sellers. New approvals use calendar months; **existing expiry dates are not silently extended**. Review existing trial sellers individually in Manage sellers. Renewal is manual; no payment is collected.
4. Have food sellers submit license details in Store settings. Administrators review the original registration, current expiry and matching business via FoSCoS, then record the source/date in Applications → Food seller verification. Existing food stores must be verified before they can accept new orders. This is a launch requirement, not a safety certification. Also review marketplace/operator licensing requirements with the appropriate authority.

## Firebase and migrations

Use a protected shell with server credentials for the intended project. Never paste secrets into an issue, PR, browser environment or build output. The scripts are operator-invoked and must first be rehearsed on a synthetic staging project.

1. Set `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and server-only `FIREBASE_SERVICE_ACCOUNT_JSON` to the **same project**.
2. Deploy reviewed Firestore rules/indexes and Storage rules with the Firebase CLI. Vercel does **not** deploy them. The manual **Deploy Firebase rules and indexes** workflow targets `treatstory-online`, only runs on `main`, and requires `FIREBASE_DEPLOY_CREDENTIALS` plus the protected `production` GitHub environment. It has not been dispatched here.
3. Run `node --import tsx scripts/verify-firebase-rollout.ts`. It compares the current Firestore release source and declared composite indexes using read-only provider APIs. Missing inspection permissions are a failed verification, never assumed success. Verify the deployed Storage rules separately.
4. Run `node --import tsx scripts/migrate-store-slugs.ts`. This reserves stable name-based addresses without exposing UIDs. Existing UID URLs redirect; reservations are never reused. Resolve a reported collision before proceeding.
5. Run `node --import tsx scripts/backfill-search.ts`. Wait for the search index to become READY, then set **build-time** `NEXT_PUBLIC_INDEXED_SEARCH_ENABLED=true` and rebuild. Until then, the existing paged catalog remains usable, with manual loading instead of an automatic whole-catalog scan. Search uses the first word's prefix index; it is not fuzzy/full-text search.
6. With server-only Cloudinary credentials configured, run `node --import tsx scripts/migrate-private-references.ts`. It validates ownership and changes old reference assets to authenticated delivery with invalidation. External/non-owned legacy URLs deliberately stop migration for manual review. Previously downloaded images cannot be recalled; confirm old public delivery is blocked after CDN invalidation.
7. With synthetic buyer, seller and admin accounts, test permissions against the actual deployed rules: public published catalog; private drafts blocked; other users' orders, quotes and photos blocked; seller product edits; admin approvals; COD checkout and cancellation. Test required index queries at production-sized volumes. Local emulator results are not these checks.

## Notifications and monitoring

Set the existing Apps Script mail configuration and a strong server-only `CRON_SECRET`. Configure GitHub variable `TREATSTORY_SITE_URL` (HTTPS production origin) and secret `TREATSTORY_CRON_SECRET` to match. The **Marketplace notification worker** runs every 15 minutes and can be dispatched manually. It fails visibly when unconfigured. A bounded worker drains two messages and checks ten sellers per run; event-triggered drains also remain. This does **not** remove Apps Script daily quotas or promise high-volume delivery.

Admin Overview → Check operations shows failed/manual-review email counts, oldest due message, worker heartbeat, unfinished deletion count, legal-contact completeness and backup-verification status. Investigate a worker heartbeat older than 30 minutes, growing mail backlog, failed/review jobs and deletion requests that cannot finish. Mail provider acceptance is not inbox delivery.

Set Vercel error-log alerts and Google Cloud billing budgets/cost alerts in the provider consoles. No provider alerts were provisioned by this PR. Avoid logging tokens, message contents or customer addresses. Existing API error logs remain redacted.

Enable appropriate managed Firestore backups/PITR in the target project, choose documented retention and restore into a separate staging project. Verify known records and permissions there. Only then record an admin-owned `operations/backup-verification` document with a `verifiedAt` Timestamp and a private evidence reference. The app does not manufacture a successful backup status. Restoring a backup must reapply completed account deletion markers and erasure actions.

## Account deletion and media

Recent reauthentication and resolution of active orders/quotes remain mandatory. Users can cancel unaccepted requests and legacy accepted requests without an order. Final order records remain, with buyer personal fields anonymized and deleted seller identity detached. Support ticket subcollections, legacy user keys, Matrix sessions/accounts/conversation metadata, compliance submissions and tracked photos are removed. Slug reservations and anti-replay deletion markers remain to prevent impersonation/stale-session writes.

Photo uploads record ownership and intended provider IDs before contacting Cloudinary. Failed/interrupted uploads remain discoverable for erasure. Deletion waits for in-flight uploads and removes old UID-scoped Cloudinary assets as well. Cleanup is incremental: retry when the UI reports progress or temporary provider failure. Provider failure must never report complete erasure. Audit other historical external URLs manually; no arbitrary third-party asset is deleted.

For an account with Matrix data, configure an **independently protected** HTTPS `SUPPORT_MATRIX_ERASURE_URL` and server-only `SUPPORT_MATRIX_ADMIN_TOKEN`, plus the gateway secret where applicable. Permit only the required deactivation and room-removal admin routes from the trusted application network. Do not expose the Synapse admin API publicly or give ordinary chat users its token. Account deactivation and synchronous room purge must succeed before Firestore cleanup completes. This maintenance configuration works while chat feature flags remain disabled. Rehearse provider failure, retry, credential rotation, backup restoration and deletion before chat activation. Recipients' downloaded copies are outside server erasure.

Provider retention, backup schedules, a definitive transaction-retention period and the identity of the responsible legal operator must be supplied by the owner; the policy makes no invented fixed retention promise.

## Release gates still requiring external evidence

- Current production Firebase/Storage deployment and live role smoke test.
- Real legal operator/grievance contacts and policy review.
- Verified food sellers and applicable platform food licensing.
- Production 100-user performance and a longer soak; cold/warm regions and multiple app instances.
- Physical Android/iOS and desktop-browser checkout, quote, guest onboarding and deletion tests.
- Provider mail quota/delivery monitoring, billing alerts and a successful backup restore.
- Private Synapse provisioning/TLS/firewall/secrets, independent security assessment and physical-device encrypted-chat/recovery tests. Keep `NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED` and `NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED` false until the existing Matrix release gates are met.
