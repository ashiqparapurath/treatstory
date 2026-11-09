# Reproduce the isolated audit

Use Linux, Node **24.x**, Java **21+**, Python 3 and a local Chromium installation. Run commands from the repository root. The published results used `/usr/bin/chromium`. The emulator CLI needs network access to download binaries on first use.

These scripts intentionally refuse production URLs/projects. Keep real credentials out of the shell used for the audit. No live mail or image upload is required. Private synthetic passwords/tokens and a generated fake service-account key live only in `/tmp/treatstory-audit`; never commit that directory.

## 1. Install and verify

```bash
npm ci
npm audit --audit-level=high
npm test
npm run typecheck
```

## 2. Start disposable emulators in terminal A

```bash
JAVA_TOOL_OPTIONS=-Xmx2048m npx --yes firebase-tools@14 emulators:start \
  --only auth,firestore,storage \
  --project demo-treatstory-audit \
  --config firebase.audit.json
```

The ports are bound to `127.0.0.1`, and the Emulator UI is disabled. The rules file is the same reviewed `firestore.rules`; this does not deploy it anywhere.

## 3. Seed and build in terminal B

```bash
export TREATSTORY_AUDIT=local-only
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

# Optional: deletes ONLY this loopback demo project's synthetic database/users.
node scripts/audit/reset.cjs
npm run audit:seed

NEXT_PUBLIC_FIREBASE_API_KEY=audit-public-key \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-treatstory-audit \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-treatstory-audit.firebaseapp.com \
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-treatstory-audit.appspot.com \
NEXT_PUBLIC_FIREBASE_APP_ID=audit-app \
NEXT_PUBLIC_FIREBASE_EMULATORS=true npm run build

node scripts/audit/start-server.cjs
```

The browser emulator flag also requires a `demo-` project and a localhost browser hostname. The staging server preload stubs the exact fake Apps Script URL and image provider and blocks unknown fetch egress; SDKs use explicit loopback emulator endpoints. This is an audit harness, not an operating-system firewall.

Stop the staging server before rebuilding. Do not run `next dev` against the same `.next` directory while serving the production audit build.

## 4. Run load and browser measurements in terminal C

```bash
export TREATSTORY_AUDIT=local-only
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

AUDIT_STAGE_SECONDS=30 AUDIT_STAGES=10,25,50,100,200 \
  node scripts/audit/run-with-browser.cjs
```

This automatically starts one desktop and one throttled-mobile browser journey during the 100-user stage. It tests a closed-loop workload with a fixed user population, not an open-loop arrival-rate test. Results are written under `/tmp/treatstory-audit`:

- `load-results.json`: progressive percentiles, operation counts, throughput, expected/unexpected errors, logical reads, transaction counters and resource samples.
- `browser-results.json`: browser timing/network assumptions and script errors.
- `correctness-results.json`: last-item race and same-checkout replay assertions.

Preserve those files before another load run overwrites them. For the separate control measurement:

```bash
AUDIT_STAGE_SECONDS=60 AUDIT_STAGES=100 npm run audit:load

# Slower customer pace with a browser (preserve the previous artifacts first):
AUDIT_STAGE_SECONDS=60 AUDIT_STAGES=100 AUDIT_THINK_MS=1500 \
  node scripts/audit/run-with-browser.cjs
```

For the functional and independent-database-client checks:

```bash
node scripts/audit/customer-flow.cjs
node scripts/audit/registration.cjs
node scripts/audit/search.cjs
npx --no-install tsx scripts/audit/distributed-race.ts
npm run audit:security
```

Only synthetic data is mutated. The five-client race uses separate Firestore instances in one process; use independent deployed instances for cloud staging verification. The UI functional journey creates a synthetic COD order on desktop and mobile, tests a seller edit and opens the administrator dashboard. These functional runs do not establish browser performance percentiles. Registration uses `localhost` because Next normalizes loopback IP URLs internally during its same-origin check; the emulator settings still point to `127.0.0.1`.

## 5. Emulator regression suites

With the audit emulators still running:

```bash
GCLOUD_PROJECT=demo-treatstory-audit npx --no-install tsx tests/atomic-checkout-emulator.ts
GCLOUD_PROJECT=demo-treatstory-audit npx --no-install tsx tests/seller-product-rules.ts
GCLOUD_PROJECT=demo-treatstory-audit npx --no-install tsx tests/seller-product-server.ts
npx --no-install tsx tests/mail-emulator.ts
```

The mail test uses its own `demo-treatstory` namespace and synthetic mail transport; it does not send email. CI starts disposable emulators itself and runs all four suites. Rules tests intentionally exercise denied writes; permission-denied log entries are expected when their assertions pass.

## 6. Redacted source/history/public asset scan

```bash
npm run audit:secrets
```

This examines tracked files (including newly staged files), all reachable Git blobs, `.next/static` and a bounded set of public `https://treatstory.vercel.app` assets. It performs read-only GETs, one source-map probe and one environment-file probe. Only paths/fingerprints are recorded; matches need human review. It is not an entropy scanner or a guarantee that every secret format is detectable.

## 7. Release follow-through

After stopping staging, run a normal build without any audit emulator variables:

```bash
npm test
npm run typecheck
npm run build
```

The audit configuration, fake credentials and external stubs are not imported by deployed application code. Do not set `NEXT_PUBLIC_FIREBASE_EMULATORS=true` on Vercel. The dependency upgrade requires Node 24; confirm the deployment uses the repository's engine setting. Deploy application/rule changes through the existing single PR's normal review flow, then verify the exact deployed versions, response headers, indexes and authorization rules.

Production readiness still requires a separately provisioned cloud staging project, verified service quotas/plan/regions, external provider sandboxes, longer soak/failure-recovery tests and measured mobile budgets. The local report records those limitations instead of treating them as passes.
