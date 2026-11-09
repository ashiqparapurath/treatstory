# TreatStory audit — 9 November 2026

**Verdict: the complete 100-user acceptance target is not met in the isolated test environment. Production capacity is not certified.** Orders remained consistent and the security regressions passed, but read latency and usable-page timing exceeded the targets. These are measured failures, not assumed passes.

All changes remain in [PR #2](https://github.com/ashiqparapurath/treatstory/pull/2). Nothing was deployed. Production received only a small, read-only public-asset inspection; no production load, test orders, account creation, stock changes, email sending or credential rotation occurred.

## Environment and method

- Production Next.js build, Node 24.22.1, Next 15.5.29, Firebase web SDK 13.2.0 and Admin SDK 14.5.0.
- Disposable `demo-treatstory-audit` project on loopback: Next `9030`, Auth `9099`, Firestore `8080`, Storage `9199`. Fake service-account key generated locally for this demo only. No real provider credentials.
- One shared container limited to **2 CPU cores and 8 GiB RAM**, including the load generator, Java emulator and Chromium. Resource measurements do not represent a Vercel function allocation. No container OOM kill was observed.
- Fresh fixtures: 200 buyers, 10 sellers, 5 administrators, 1,000 seller products with separately priced/stocked sizes, 50 legacy products, 12 categories, four banners and saved addresses.
- Progressive closed-loop stages: **10, 25, 50, 100 and 200 active virtual users**, 30 seconds of arrivals per stage, followed by draining in-flight work. Slow stages consequently last longer than 30 seconds. Think time: 100 ms between operations for the rapid stress ladder; a separate 100-user customer-pace run uses 1.5 seconds. A separate 60-second 100-user control run excludes Chromium rendering load.
- Workload at 100/200 users: 85% buyer, 10% seller, 5% administrator actors (rounded at lower concurrency); real HTTP page requests and authenticated checkout/product APIs, Auth sign-in/sign-up, rules-enforced catalog/product/profile/order reads, variant checks, seller edits and admin approval updates.
- The load driver uses **Firestore Lite REST**, not 100 full browsers. A first attempt with the Node full SDK encountered emulator/gRPC framing/backoff failures and was discarded. Actual Chromium separately exercises the app's full SDK and live listeners. Emulator results cannot validate cloud transport, quotas, index enforcement, CDN behavior or multi-region scaling.
- Chromium desktop `1440×900`; mobile `390×844`, **150 ms latency, 1.6 Mbps down, 750 Kbps up, 4× CPU slowdown**, cold browser contexts. It begins during the 100-user stage and overlaps the 200-user stage. These are six browser navigations, not a statistically valid page p95.
- “Usable” means product cards have rendered for home/catalog, and a product title plus Buy now control have rendered for product details. This deliberately measures availability of shopping content, not just the static hero text.
- Emails and upload-provider responses are stubbed. Images use synthetic local fixtures/fallbacks. Provider delivery, real image CDN latency and real payment settlement are **not** measured.

## Acceptance results

| Target at 100 users | Measured result | Status |
| --- | --- | --- |
| Standard read p95 <800 ms | 1033 ms rapid stress; 1145 ms with 1.5-second think time | **Failed locally** |
| Key pages usable <3 seconds on mobile | 5.69–10.76 s rapid stress; 5.11–7.30 s slower-paced run | **Failed** |
| Unexpected request errors <1% | 0/2186 rapid-stress operations; 0/2028 slower-paced operations | Passed in samples |
| No overselling or duplicate orders | Last-item and same-UUID races passed | Passed in emulators |
| No inconsistent payments | COD/advance records tested; no online collection exists | External payments not applicable/tested |
| No exposed privileged credentials | No genuine privileged credential identified in source/history/bundles/public assets | Scoped scan passed; deployment secrets unverified |
| No critical/high vulnerabilities | Zero known dependency advisories; tested application access checks passed | Known findings fixed; cloud/IAM/asset confidentiality unverified |

### Progressive load measurements

Times below are milliseconds. Mixed-operation percentiles include successful writes and expected validation/rate-limit responses. The unexpected-error denominator excludes expected validation/rate-limit responses; those counts remain in the raw results.

| Users | Operations | Ops/s | Read p95 | Mixed p50 | Mixed p95 | Mixed p99 | Checkout p95 | Unexpected errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 2139 | 70.5 | 49 | 9 | 210 | 535 | 989 | 0 |
| 25 | 2367 | 73.1 | 98 | 15 | 1830 | 4125 | 6325 | 0 |
| 50 | 1989 | 56.3 | 379 | 20 | 4780 | 13625 | 19322 | 0 |
| 100 | 2186 | 44.2 | 1033 | 43 | 11218 | 29285 | 34061 | 0 |
| 200 | 3534 | 61.8 | 2293 | 56 | 15563 | 37102 | 42966 | 0 |

The p50/p95/p99 for every individual scenario, throughput, logical document counts, transaction-attempt counters, process memory, event-loop delay and shared-container CPU/memory samples are in [load-results.json](load-results.json). This reports SDK-observed logical operations and attempted transaction writes, **not billed Firestore reads/writes**: rule-dependent reads, indexes, retries, hidden SDK activity and pre-transaction lookups make real billing different.

The separate 100-user control (60 seconds of arrivals, 81.1 seconds including drain; 100 ms think time, no Chromium) measured read p95 **976 ms**, mixed p95 8893 ms and zero unexpected errors. It still missed the read target. See [control-100-users.json](control-100-users.json).

A slower-paced run uses **1.5-second think time**, 100 users and 60 seconds of arrivals (86.7 seconds including drain), with Chromium. It measured read p95 **1145 ms**, 23.4 operations/s, checkout p95 49.84 seconds and zero unexpected errors. Mobile usability still failed. See [representative-100-users.json](representative-100-users.json) and [representative-browser.json](representative-browser.json). This follow-on run retains prior synthetic orders and is not a fresh-fixture before/after comparison.

### Browser results under load

| Page | Desktop, rapid stress | Mobile, rapid stress | Desktop, slower pace | Mobile, slower pace |
| --- | ---: | ---: | ---: | ---: |
| Home | 14.59 s | 10.76 s | 1.56 s | 5.45 s |
| Catalog | 8.04 s | 5.69 s | 0.56 s | 5.11 s |
| Product details | 3.58 s | 8.04 s | 0.53 s | 7.30 s |

See [browser-results.json](browser-results.json) for navigation timings, observed LCP, transferred bytes, script errors and network assumptions. The peak measured server RSS was 566 MiB; peak shared-container memory was 6.72 GiB (including emulator, generator, Chromium and filesystem cache). A short run does not establish absence of a memory leak.

A recoverable production hydration warning (`React #418`) occurred in the browser suite. It remains an open performance/reliability investigation; the test does not establish its cause. Functional actions are checked separately. The synthetic image setup also prevents a claim that production banner delivery meets its budget.

### Correctness

- **100 simultaneous last-item checkout requests:** exactly one order, stock zero, remaining requests receive stock-conflict responses; no unexpected status. The initial smoke had one winner but many 503 lock timeouts; the fixed path resolves these requests correctly.
- **25 simultaneous retries with one checkout UUID:** one unique order and successful replay responses; inventory reserved once.
- **Five independent Firestore client objects / separate local queues:** 100 last-item requests still produce one winner; 25 cross-client retries create one order and reduce ten available items to nine. This validates database transaction authority across independent queues, not deployed Vercel instances or geographic regions.
- Emulator regressions cover server prices, different size prices/stock, booking capacity, cancellation stock restoration and prevention of double release.
- Checkout is COD or seller-arranged advance. No online payment processor collects money; external charging/settlement idempotency cannot be certified by these tests.

Evidence: [correctness-results.json](correctness-results.json), [distributed-race.json](distributed-race.json), and the initial [pre-contention-correctness.json](pre-contention-correctness.json). The initial eight-second smoke is diagnostic evidence only, not a comparable production baseline.

## Security findings and fixes

| Finding | Assessed severity | Change and verification |
| --- | --- | --- |
| Outdated Next.js and vulnerable dependency graph | Critical/high advisories existed | Updated Next/Firebase/form dependencies and transitive overrides; removed unused Genkit, chart and image-SDK scaffolding. Reproducible clean install and final dependency audit report zero known advisories. Advisory counts describe vulnerable package entries, not unique vulnerabilities or proven exploitation. |
| Bodies trusted Content-Length and parsed before enforcing actual size | Medium | Streaming byte limits for JSON and multipart; malformed UTF-8/JSON and unsuitable types rejected; chunked oversized body returns 413. Upstream image upload has a 15-second timeout. |
| Last-item transaction contention surfaced as server errors | Reliability | Bounded same-instance checkout/product/seller-day queues, authoritative Firestore transactions, durable UUID/request-hash replay, and commit/stock recovery after aborted transactions. Local queues do not replace distributed transactions. |
| Stale seller edits could overwrite newer inventory; maximum-size saves exceed the rules expression budget | High data-integrity impact / reliability | Authenticated server product-save route with strict Zod validation, ownership/access checks, per-user write quota, transactional timestamp precondition and preserved creation time. Maximum-size create/edit and stale-edit rejection pass. Existing direct rules still deny malformed writes; the app no longer depends on a maximum-size direct SDK create succeeding. |
| Searching malformed older metadata could crash the catalog | Medium availability/reliability | Guard searchable field types and ignore invalid names. The reproduced rare-product scan now succeeds past the first page, in 2.995 seconds without artificial network throttling or VU load. |
| Nested document paths were not excluded by ID field validation | Medium | Shared document-ID validation rejects slashes, reserved names and controls before Firestore access; five actual API boundary cases return 400. |
| Malformed product image-list elements were accepted | Medium | Seller rules validate each changed image URL/type/host; public image rendering handles non-string values safely. Unsafe objects/origins are denied in emulator tests. |
| Repeated email-queue drains under concurrent checkout | Scalability | Coalesced overlapping drains inside an instance. Existing transactional leases and relay receipt IDs remain the cross-instance duplicate-send protection. This does not increase the provider's daily quota. |
| Unbounded storefront and management listeners | Scalability | Public first pages bounded to 24 (home previews remain smaller); private management pages bounded to 50 with cursor loading. Only the first page remains live; additional pages load on demand. Private pages reset on query/account changes and do not use the public cache. |
| Missing browser response hardening | Defense in depth | Added nosniff, framing denial, referrer/permissions policies and a limited CSP; disabled powered-by and production browser source maps. This CSP is not a nonce-based script policy and is not proof of XSS resistance. |
| Upload/checkout write amplification and verbose unexpected errors | Medium | Per-user checkout quota (20 new checkouts/minute, replays exempt), product-save quota (120/hour), photo quota (10 reference or 100 product/banner uploads/day); unknown API errors log a code instead of the full error object. |

### Credentials and access controls

[secret-scan.json](secret-scan.json) records a redacted heuristic scan of tracked working files, every reachable Git blob, built browser assets and public production assets. Findings include only fingerprints and paths. Reviewed matches are dummy emulator-test/stub values; no genuine privileged credential was identified by these patterns. No rotation was performed because no compromised credential was identified and no cloud account credentials are available in this environment.

Firebase browser API keys, project IDs, app IDs and storage-bucket names are intentional public configuration. A signed-in user's own short-lived session token is also required for client authentication; it is distinct from an Admin service-account private key or provider signing secret. Public Firebase configuration does not grant authorization: production Security Rules, Auth, IAM and applicable API restrictions still matter.

The emulator access suite checks other customers' addresses/orders/quotes/support/favourites/notifications, private outbox reads, fake order writes, self-granted admin roles, seller ownership/access escalation, buyer approval attempts, unauthenticated/forged tokens, price tampering and oversized chunked checkout. See [security-results.json](security-results.json). These checks do not establish that the same rules are deployed in production.

No known critical/high dependency advisory remains in the tested lockfile, and no exploitable critical/high application issue remains **identified in this tested scope**. This is not a guarantee of absence: privileged deployment environment values, published production rules, IAM, backups, Vercel project settings, Google API-key restrictions and account compromise could not be inspected.

**Reference-image confidentiality remains open (medium privacy/design risk):** custom quote uploads currently use public Cloudinary delivery URLs. Private quote-document rules do not make an already shared image URL private. If these photos must be confidential, authenticated/private asset delivery and server-authorized access are required; that migration was not implemented or provider-tested.

Active seller documents intentionally expose store contact details and owner identifiers through the current public store model. Separate public store fields from private subscription/contact metadata if those fields are not intended to be public; document-level Firestore reads cannot hide individual fields.

## Firebase, service quotas and remaining bottlenecks

1. **Mobile startup and rendering remain over budget.** The shared Firebase/root client bundle and client-side catalog waterfall need a separate measured SSR/cached-public-catalog and bundle-splitting pass, with the hydration warning investigated. A local synthetic image test cannot verify production image byte sizes, CDN cache hit rates or cold image transformation latency.
2. **Checkout remains slow under sustained shared-host load.** Seller/day booking records remain shared transactional counters. Queues improve same-instance reliability but can increase waiting time; multiple cloud instances still contend at the database. Measure regional cloud staging, transaction latency, queue depth and real booking hot spots before choosing a sharded/reservation design. Do not remove atomic capacity checks merely to improve a benchmark.
3. **Substring search still scans catalog pages.** Live reads are bounded, but a rare search can scan all 1,000 products. At a page size of 24, an exhausted scan needs 42 queries for exactly 1,000 products; a completely full final page requires a further empty-page check. A real Chromium rare-product lookup traversed later pages and succeeded in 2.995 seconds after the malformed-metadata fix; this is a single unthrottled, unloaded sample, not a mobile budget pass. See [search.json](search.json). Use a dedicated indexed search service or a deliberately designed server index before scaling large catalogs. Management search explicitly applies to loaded records; Load more preserves access to later records.
4. **Apps Script is a real capacity limit.** Google's published MailApp limits are 100 recipients/day for consumer accounts and 1,500/day for Workspace, with additional trial and service limits. A single-line checkout queues a buyer and a seller email: 100 such orders need at least 200 recipient deliveries before status/account emails. Consumer quota therefore cannot cover that burst in one day. “100 concurrent visitors” alone does not imply a particular email volume; the actual account tier/remaining quota is unknown.
5. **Scheduled mail-only draining is slow.** The current retry trigger runs every five minutes and processes up to three jobs per invocation: approximately 36 jobs/hour from that trigger alone, before failures. Activity-triggered processing adds capacity but does not establish a delivery SLA. Account jobs expire after 45 minutes; order/update jobs after 47 hours. Monitor oldest pending age and expired/review jobs. No alternate email provider was introduced. The VU signup operation calls Auth directly; the full registration-to-mail pipeline was checked once in Chromium, not with 100 concurrent registrations. The shared global account-mail quota document remains a potential signup-burst hot spot.
6. **Firestore free allocation is not a sustained-traffic plan.** Published free amounts include 50,000 document reads and 20,000 writes/day. The benchmark's logical counts alone consume a substantial fraction; real billing includes additional work. Enable appropriate billing/budgets/alerts and verify actual account quotas. Existing indexes were reviewed; the emulator does not prove production composite indexes are deployed. No cloud query-explain/billing measurements were available.
7. **Lifecycle and abuse controls need deployment follow-through.** Configure a cleanup/TTL policy for private quota documents (new product/checkout quotas have expiry fields); merely storing an expiry timestamp does not delete a document. TTL deletion requires billing. Account mail has per-identity/global limits, but bot/IP abuse and quota starvation still need a measured WAF/App Check/CAPTCHA policy appropriate to the deployment. Rate limits are not DDoS protection.
8. **Cloud limits remain unverified.** Check deployed Node 24 support, function region versus Firestore region, memory/duration, cold starts, plan limits and Cloudinary usage. `apphosting.yaml` contains `maxInstances: 1` for Firebase App Hosting; that file does not describe the actual Vercel deployment's autoscaling settings. No cloud capacity or security setting was changed.

Official references checked for this audit: [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Firebase API keys](https://firebase.google.com/docs/projects/api-keys), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Next.js data security](https://nextjs.org/docs/app/guides/data-security). Provider quotas and plans can change; these are not measurements of this account's available capacity.

Cart updates and direct-buy state are checked through real desktop/mobile UI journeys; the virtual-user driver does not render 100 separate browser carts. Small configuration listeners (categories/banners and some form options) remain; product and management pagination is not a claim that every listener was eliminated.

## Verification and reproducibility

- Clean `npm ci`, `npm audit` (zero advisories), 57 unit/regression tests, TypeScript and production builds.
- Four real emulator suites: atomic checkout/order lifecycle, seller Security Rules, strict server product saves (including maximum fields and fractional timestamp compatibility), and account-mail/outbox retry behavior.
- 28 API/rules security checks pass, including a real custom quote creation with authoritative names and nested-path rejection.
- Desktop/mobile authenticated profile, variant/cart quantity, direct-buy scroll/cart separation, saved-address COD checkout and confirmation pass. Seller UI edit/save and administrator access controls pass. See [customer-flow.json](customer-flow.json).
- Actual app registration and profile-name persistence pass; verification and welcome endpoints return durable-queue success. Delivery remains stubbed. See [registration.json](registration.json).
- Read-only public inspection found the probed `.env` and source map unavailable (404). Added response headers are verified on the local build; they are not claimed deployed to production.
- All changes belong to the existing single PR. No production writes, load test, mail send, cloud configuration change or secret rotation occurred.

Machine-readable verification summary: [verification.json](verification.json).

Use [RUNBOOK.md](RUNBOOK.md) to reproduce the isolated run. Deployment follow-up must use a separate cloud staging project with synthetic users/data and provider sandboxing. Run a longer soak, cold/warm region tests, 100 real browser sessions or distributed generators, production-sized data and independent deployed instances before claiming production readiness. Do not point the supplied load scripts at production.
