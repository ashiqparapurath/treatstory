# Internal security assessment: TreatStory encrypted support

Date: 13 November 2026. Scope: Matrix support PR #16 and private Synapse
deployment baseline. **This is an internal architecture/code review, NOT an
independent penetration test, crypto audit or production certification.**

## Trust boundaries

The Next.js API validates Firebase ID tokens and the device-bound Matrix
session, checks current administrator roles and active conversation assignment,
and verifies cross-signed devices. Encrypted room content is held by Synapse;
it has no user's decryption keys. The service account can administer rooms but
must never be a message recipient.

The gateway must **not** be accessible around its required server-only header.
Direct raw Synapse access would bypass Firebase roles and revocation. The
private Docker network and gateway provide a deployment baseline, but a feature
flag or repo test does not establish external firewall security.

The first Matrix identity uses authenticated trust on first use; there is no
cryptographic continuity proof from historical RSA identities. Account-root
rotation with a continuity transition is unimplemented. Retained encrypted
backups and old decrypted messages cannot be remotely erased. The Next.js
origin, Firebase administration, Synapse, browser crypto, key backups and
dependency chain remain trusted.

## Risk register and gates

| ID | Risk | Status / mandatory evidence |
| --- | --- | --- |
| H-01 HIGH | A publicly reachable Synapse port bypasses Firebase and agent access restrictions | Docker isolation and gateway template added. Prove external IPv4/IPv6, alternate host, raw port and admin API denial with real firewall evidence. |
| H-02 HIGH | Cloud gateway, DNS/TLS, service secrets, backup and monitoring are not deployed | Runnable Compose baseline exists. Independently provision and audit host, credentials, retention, Postgres restores, rules and indexes before activation. |
| H-03 HIGH | First-use identity and absent verified account-root rotation may affect recovery/identity transitions | Fail-closed pinning exists; request independent review and an approved rotation/continuity decision or a documented limited-pilot exception. |
| H-04 HIGH | Full app and migration protocol have no independent audit | Third-party security review required for key delivery, SAS, replay, replacement agents, recovery, session backup and original RSA import. |
| M-01 MEDIUM | Shared server-to-server gateway secret (not mutual TLS) | Keep only in secret managers, isolate network and document planned coordinated secret rotation; consider mTLS. |
| M-02 MEDIUM | Old browser data and encrypted backups may survive role revocation | Test and disclose retention/erasure limitations; never promise remote plaintext deletion. |
| M-03 MEDIUM | Single-host outage, recovery time and backup integrity | Restore rehearsal, monitoring, encrypted off-host backup and agreed RPO/RTO required. |
| M-04 MEDIUM | No measured ~100-concurrent-user capacity or Vercel long-poll cost | Stage realistic load and capture p50/p95, errors, cost and upstream/resource limits. |
| M-05 MEDIUM | Physical Android/iPhone/PWA and seller/admin multi-device acceptance incomplete | Execute and sign device acceptance matrix; browser emulation alone is insufficient. |

## Manual adversarial review checklist

1. Inspect deployed browser bundles and logs for server JWT, service token,
   gateway secret, signing keys, recovery codes and Firebase service credentials.
2. Attempt unauthenticated proxy calls, non-gateway traffic, forged headers,
   path traversal, revoked/pending device messages, room scope abuse and server
   key substitution. Verify source code and *deployed infrastructure*.
3. Test stale/removed roles, unauthorized support agents, reassignment races,
   sender swaps, tampered ciphertext, replay and future-key revocation.
4. Validate SAS mismatch/rejection, lost-device recovery with original offline,
   invalid codes, corrupted IndexedDB preservation, encrypted backup sync.
5. Check Synapse upstream advisories, pinned images, container capabilities,
   TLS, PostgreSQL permissions and key rotation/restore.
6. Verify customer retention and encryption disclaimers; imported RSA history
   must remain intact and not become silently server-readable.
7. Practice rollback with feature flags off while preserving encrypted records.

## Evidence and decision

The previously merged PR reported 169 unit/regression tests and integrated
Synapse/Firebase emulator/Chromium coverage. New CI adds infrastructure
preflight, production static guards and simulated Firefox/WebKit browser API
tests; capture exact passing run links in the PR. **None is a physical-device
test or an independent audit.**

**NO-GO for activating encrypted support:** obtain host/network proof,
external security sign-off, physical device evidence, Firestore deployment
verification, restore rehearsal and measured load capacity. Keep the stable
support-ticket UI active until explicitly approved.
