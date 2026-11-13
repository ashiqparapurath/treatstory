# Encrypted support implementation and release status

Implemented in draft PR #16; production remains disabled. The earlier statement
that multi-device functionality was absent is superseded by this implementation.
Setting a feature flag alone is insufficient to deploy this service.

## Architecture and implemented behavior

New conversations use pinned `matrix-js-sdk` 45.1.0 with its Rust crypto WASM
18.9.2 dependency (Olm/Megolm). Firebase verifies accounts, current administrator
roles and conversation assignments; a private Synapse service transports
ciphertext. Each account has an immutable pinned cross-signing root, separate
device keys and no shared administrator decryption identity. The service bot
controls membership without a crypto identity or message decryption keys.

The first authenticated activation creates a new Matrix identity. Later devices
remain pending until SAS verification with an approved device or recovery using
a previously saved code. Buyers, sellers and assigned administrators use the
same enrollment mechanism. Public device keys and signature chains are checked
at the API; signing in does not authorize a device to send or obtain key backups.
The device dialog lists devices, shows verification emojis, rejects approvals,
notifies about new devices, revokes another device and configures recovery.

A device-only encrypted key backup supports history synchronization between
approved devices. Optional user-held recovery attaches encrypted secret storage
to that existing backup without replacing its version. Save the displayed code
outside the browser and wait for backup synchronization before relying on it.
The code is never sent to TreatStory. Losing all approved devices without a
usable recovery code can permanently lose access. Matrix key storage is
software storage encrypted with a locally stored device key; it is not a
hardware-backed or nonextractable browser-key guarantee.

Every messaging request passes through the Firebase-authenticated gateway,
bound to its Matrix device session. Only the owner and assigned current agent
may access a conversation. Reassignment removes the old agent before admitting
the new one; stale assignment headers fail closed. Former administrators cannot
reuse their old sessions by logging in as customers. Revocation blocks transport
and future key delivery; outbound group sessions rotate for every message.
Previously decrypted content and retained keys cannot be erased remotely.

The SDK permits some replayed ciphertext under another event ID. TreatStory
therefore checks authenticated application metadata (room, sender, device and
message identity) inside the encrypted content and atomically persists local
receipts binding that identity to its original event ID and ciphertext hash.
The UI displays validated messages only. This application binding does not make
the integration independently audited or equivalent to Signal/WhatsApp.

The full-screen workspace provides assigned conversation lists, local decrypted
previews, unread counts, pagination, optimistic messages, encrypted local drafts,
stable retry transaction IDs, connection status, close/reopen, verification and
recovery. Desktop and mobile viewport layouts use independent scrolling,
visual-viewport keyboard sizing, safe areas and focus-trapped security dialogs.
Firestore listeners expose routing metadata only; message content uses Matrix.

## Existing history and migration

The old `/api/support-chat` creation/read path is retired (503 while disabled,
410 when enabled). Its single-device identity is never silently replaced.
Legacy RSA helpers remain as readers; existing keys, ciphertext and plaintext
tickets remain intact. `/support-tickets` always provides the stable ticket flow.
It does not relabel plaintext as encrypted or make old ciphertext readable.

On an original browser with its historical RSA key, select an earlier encrypted
conversation in the new workspace and import it into an authorized, verified
conversation. Version-1 history may need its explicitly labeled old passphrase.
Decryption and re-encryption occur locally. The scoped API returns ciphertext
only; resumable journals reserve source IDs, verify target encrypted-event
round trips and preserve source metadata, timestamps and records. Interrupted
reservations resume on the same originating device; automatic cross-device
reservation takeover is deliberately unavailable. Missing original keys cannot
be reconstructed from Firebase login.

After reassignment, new messages use the new verified agent. The owner can
explicitly share locally readable earlier history, re-encrypted for that agent,
with an idempotent transfer journal. It does not grant the replacement agent an
old agent's identity or private key.

## Deployment configuration

Keep both public flags unset/false until release approval:
`NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED` and `NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED`.
Both must be true at build time for the new UI, and at runtime for its APIs.

Provision a durable private Synapse deployment before activation. Required server
configuration: `SUPPORT_MATRIX_HOMESERVER_URL`, `SUPPORT_MATRIX_SERVER_NAME`,
`SUPPORT_MATRIX_JWT_SECRET` (at least 32 characters),
`SUPPORT_MATRIX_SERVICE_TOKEN`, `SUPPORT_MATRIX_GATEWAY_SECRET` (at least 32
characters for HTTPS), and `SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED=true`.
Use independently generated secrets in the deployment secret manager, never in
public environment variables or source control. Configure Synapse JWT login
with the same HS256 secret, issuer and audience `treatstory-support`. The service
account needs room-control and device-deletion administrative capabilities.

Use `scripts/support-matrix/nginx-gateway.conf.example` as a starting template,
substituting actual certificates and a secret header through secure deployment
configuration. Synapse must be unreachable directly from clients, including its
admin, federation and alternate client ports. Only the application gateway may
reach it. The confirmation variable does not configure a firewall. A public
unprotected homeserver would let Matrix bearer tokens bypass Firebase role and
revocation checks. HTTPS is required outside explicitly allowed local fixtures.
Deploy the included Firestore rules/indexes before activating the UI. Verify the
private transport, backup retention, monitoring and role-removal controls in the
actual target environment. Never change the configured Matrix identity namespace
after enrollment; mismatches fail closed and preserve existing records.

## Reproducible verification

Use Node 24, Java 21, Docker, Python with PyYAML 6.0.3 and Playwright Chromium:

```sh
npm ci
python scripts/support-matrix/local-server.py
npm run build
npx firebase-tools@14 emulators:exec --only auth,firestore --project demo-treatstory --config firebase.audit.json 'SUPPORT_MATRIX_TEST_CONFIG=work/support-matrix-server/test-config.json npm run test:support-matrix'
npm test
npm run typecheck
```

The loopback-only helper preserves existing fixture files and writes test secrets
only to ignored `work/`. Its SQLite Synapse setup is a disposable test fixture,
not a production deployment. The integration fixture executes actual Next API
handlers, real Firebase Auth/Firestore emulators, Synapse, WASM crypto and separate
Chromium browser contexts. Only the UI's Firebase hooks are replaced for fixture
routing; API authentication still uses real emulator tokens.

Recorded local verification on 2026-11-13 includes encrypted realtime delivery,
pending and rejected enrollment, cross-device SAS/history, backup completion,
invalid-code rejection, recovery with original devices offline, reload
persistence, revocation/future key exclusion, ciphertext tamper and replay
rejection, scoped reassignment, role removal, preserved/idempotent legacy import,
explicit idempotent history transfer to a verified replacement agent, routing
metadata read/write authorization, and desktop/mobile viewport, draft, dropdown
and dialog checks. `npm test` passes all 169 tests; typecheck, production build
and the complete integration command exit successfully. Marketplace
Firestore emulator regressions also pass. CI includes this integration job.
Physical phone testing and production end-to-end testing are not claimed.

## Remaining release gates and threat limits

- Provision and test the protected production messaging service and secrets;
  no production server has been configured or enabled by this PR.
- Independent security review of this complete integration, deployment and
  migration. Upstream vodozemac has a published Least Authority audit:
  https://matrix.org/media/Least%20Authority%20-%20Matrix%20vodozemac%20Final%20Audit%20Report.pdf
  That report does not certify this SDK version or TreatStory's integration.
- Measure approximately 100 concurrent active users, latency, failures and
  Firestore/server usage. No capacity result has been measured here.
- Verify physical Android/iOS/PWA/Safari and explicit seller/admin multi-device
  acceptance scenarios; current multi-device behavioral coverage uses buyer
  accounts plus separately assigned agent contexts in Chromium.
- Account-root rotation through an authenticated continuity transition remains
  unimplemented. Silent root reset is forbidden; per-message session rotation
  and device revocation are implemented.
- First activation of the new Matrix namespace is authenticated trust on first
  use, not a cryptographic continuity proof from the previous RSA identity.
  Served JavaScript/origin and Firebase routing administration remain trusted.
  No malicious-origin resistance, retroactive erasure, or complete forward-
  secrecy guarantee for retained history/recovery backups is claimed.
- Corrupt local key/session stores are preserved and fail closed. Use an intact
  approved device, a separate browser and saved recovery capability; do not
  clear storage as an automatic repair.

Keep the PR draft and both production flags off until these gates are satisfied.
