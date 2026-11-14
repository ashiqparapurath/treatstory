# Marketplace hardening verification — 14 November 2026

## Result

Application checks pass, but **full production readiness is not certified**. The isolated 100-user run has zero unexpected errors and preserves order correctness. Its aggregate standard-read target passes; the individual catalog-read tail remains slow. Browser usability, physical devices and actual provider operations remain unverified.

## Completed checks

- 183 Node regression tests pass, including guest submission/privilege rejection, verified-email approval, month-end trial calculation, private-photo authorization, readable slugs, search index bounds and audited admin access changes.
- TypeScript validation and the optimized Next.js production build pass.
- `npm audit --audit-level=high`: zero reported vulnerabilities.
- All six real Firestore/Storage emulator suites pass: atomic checkout, seller-product rules, seller-store rules, server product saving, mail queue and custom quote conversion.
- Quote conversion tests exercise unauthorized buyers, total tampering, simultaneous retries, capacity limits, stock reservation and rejection rollback. Existing order tests cover price changes, variants and inventory races.
- No live customer orders, messages, payment collection, provider migrations, Firebase deployment or repository protection changes were made.

## 100-user local load result

Fresh synthetic fixtures: 215 accounts, 1,000 seller products and 50 legacy products. Loopback Auth/Firestore/Storage emulators and an optimized Next build. One 60-second closed-loop stage with 100 virtual users and 1.5-second think time; total duration including drain approximately 61.5 seconds. Emails and upload delivery are stubbed. This is not 100 browser sessions, a distributed cloud test or a long soak.

| Measurement | Result |
| --- | ---: |
| Operations | 3,733 |
| Throughput | 60.73 operations/s |
| Unexpected errors | 0 |
| Expected conflict/rate-limit responses in mixed workload | 1 |
| Aggregate standard-read p95 | 332.53 ms |
| Individual catalog-read p95 | 2,368.24 ms |
| Checkout p95 | 1,694.43 ms |
| Seller-edit p95 | 945.83 ms |
| 100 simultaneous last-item attempts | One order; stock zero; 68 bounded 429 responses |
| 25 retries of one checkout reference | One order; all replay responses succeed |

The aggregate <800 ms read criterion passes locally, but it must not hide the catalog's ~2.37 s p95. The full earlier acceptance target, including usable-page timing, is still not established. CPU/memory cgroup limits were unavailable in this workspace and are recorded as null. Server process metrics are in the raw result; do not interpret them as a Vercel function allocation. This is not a controlled before/after comparison with the November 9 audit.

The first diagnostic rerun failed seller edits because the audit harness resubmitted server-owned `searchPrefixes` (and subsequently generated SKUs). The final run excludes those fields exactly as the product form does. The API's strict rejection was preserved. The harness now tolerates unavailable cgroup metadata instead of failing after the workload.

## Browser and device limitation

The attempted Chromium launch failed before navigation: `ProcessSingleton` could not create its socket (`Operation not permitted`). No new browser timing or responsive visual pass is claimed. Physical Android/iOS and real desktop-browser journeys remain release gates. The November 9 browser numbers are historical, not substituted for a new result.

## Operational follow-up

Follow [the rollout guide](../../production-hardening-rollout.md) before merging/deploying. It covers legal operator details, Firebase rules/index verification, slug/search/private-reference migrations, food-seller verification, notification worker setup, backups, provider alerts and account-erasure maintenance credentials. Matrix remains disabled pending provisioning and independent security/device review. The owner explicitly chose to retain COD and defer online payments/settlements.

## Evidence

- [Raw load measurements](load-results.json)
- [Order-race and idempotency results](correctness-results.json)
- [Reproducible audit harness](../RUNBOOK.md)
- [Cloudinary authenticated delivery documentation](https://cloudinary.com/documentation/control_access_to_media)
- [Synapse deactivation documentation](https://element-hq.github.io/synapse/latest/admin_api/user_admin_api.html)
- [Synapse room-removal documentation](https://element-hq.github.io/synapse/latest/admin_api/rooms.html)
