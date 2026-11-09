# Hydration, image loading and product sharing

Verified 9 November 2026 against a production build on loopback with isolated `demo-treatstory-audit` Auth/Firestore/Storage emulators. No production writes, messages, orders or load tests. This follow-up does not change checkout, inventory or catalog caching.

## Changes

- Keep the public catalog's server snapshot stable when the SDK becomes ready before a deferred section hydrates. Actual client snapshots and live listeners remain unchanged; no new hydration-warning suppression.
- Generate responsive AVIF/WebP hero crops from the original lossless image. The first hero loads directly without a cold server encode. Accurate image sizes avoid oversized card/gallery downloads.
- Mount the visible banner and then its neighbour, rather than downloading the full carousel immediately. Broken images use a local placeholder; a changed URL recovers normally. Active gallery photos load eagerly.
- Add native product sharing, copy-link and WhatsApp options. Shared URLs omit query parameters and fragments.
- Generate current product-specific Open Graph/Twitter metadata on the server for each request, including social crawlers that do not execute JavaScript. Add a branded 1200×630 JPEG for general pages and unavailable images. Draft products expose no product metadata. Numeric prices, stock counts and private fields are excluded from previews.

## Results and limits

- Typecheck, production build and **66 automated tests passed**.
- The before sample reproduced hydration warnings in three of four homepage loads. After: **zero hydration or other page errors in 12 navigations**, two runs each of home, catalog and product on desktop/mobile.
- Mobile hero encoded payload: **42,590 → 36,692 bytes** (13.8% smaller); desktop: 42,590 → 37,622 bytes (11.7% smaller), at the sampled browser sizes. All 18 generated files have verified hashes, dimensions and formats.
- **17 sharing checks passed**: WhatsApp/Facebook/X/Telegram tags in the HTML head, changed metadata visible on the next request, private/draft exclusion, clean copied/native/WhatsApp links, responsive hero images and no horizontal overflow.
- **Five image checks passed**: two initial banner images, progressive adjacent loading, broken-image fallback, live recovery after replacing the URL, and the next gallery photo loading.
- Mobile after samples: home 4.95–5.21 s, catalog 2.61–2.97 s, detail 1.94–2.12 s. Conditions: 390×844, DPR2, 150ms latency, 1.6Mbps down, 4× CPU slowdown; usable is shopping content plus a 700ms settling wait. No concurrent user load; some sharing checks overlapped. These small samples do not establish a speed improvement or a page p95. **The homepage three-second target remains unmet.** The original 100-user audit targets remain unresolved by this focused work.
- Platform preview caches are controlled by those platforms; fresh server metadata cannot force an already-shared message to refresh. Actual platform rendering was not tested by sending messages. A protected deployment must be accessible to crawlers for rich previews to work.
- Public metadata needs server-side database credentials in the deployment. If unavailable, a generic branded preview is used so the product page remains usable.

## Reproduction

Use the existing audit build/emulator setup and synthetic seed described in the parent audit. Apply `scripts/audit/image-fixtures.ts` only to the loopback demo project. Start `scripts/audit/start-server.cjs`, then run:

```sh
TREATSTORY_AUDIT=local-only node scripts/audit/hydration-images.cjs
TREATSTORY_AUDIT=local-only FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/audit/sharing-check.cjs
TREATSTORY_AUDIT=local-only FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/audit/banner-images-check.cjs
```

The browser transport uses `/usr/bin/chromium`. Sharing is mocked; no WhatsApp messages are sent. Evidence JSON in this directory contains only synthetic public data and loopback URLs.

## Product-page 500 follow-up

Vercel logs confirmed `ERR_REQUIRE_ESM`: `jwks-rsa@4.1.0` uses CommonJS `require('jose')`, but `jose@6.2.16` is ESM-only. The Vercel loader rejected it while initializing product pages and `/api/email/process`. Local Node 24 permits require(ESM) by default, which explains why the earlier build and browser tests missed this runtime incompatibility. Reproduced the exact failure locally with `node --no-experimental-require-module -e 'require("firebase-admin/auth")'`.

A scoped npm override selects dual CommonJS/ESM `jose@5.10.0` only beneath `jwks-rsa`; the Admin SDK and its auth checks remain in place. A regression subprocess disables require(ESM), imports the actual Admin authentication module and converts RSA/EC/EdDSA public JWKs through the actual JWKS library. Genuine signatures verify and tampered payloads fail. Dependency audit reports zero vulnerabilities.

Optional metadata enrichment also imports the server SDK inside its fallback boundary and stops waiting after 2.5 seconds. Module initialization, credential, lookup or stalled-read failures return a generic branded preview. This is a fresh generic fallback, not cached product data. The SDK may finish an already-started read in the background; the response deadline does not cancel its underlying transport. New regression cases cover these failures.

Follow-up validation: production build and all **69 tests** passed with the compatibility regression included; build/runtime tested with require(ESM) disabled. Ten isolated production-server probes passed: literal/encoded seller IDs and a seeded public product returned 200 for browser, crawler and RSC requests; the seeded product's crawler metadata contained its current name. Unauthenticated email processing returned the expected 401, without processing or sending any mail. See `runtime-compatibility.json`. The protected Vercel preview still requires authenticated manual verification after redeployment.
