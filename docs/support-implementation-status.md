# Encrypted support investigation and implementation status

Status: **incomplete; draft only; do not enable production E2EE.**

## Findings

The warning is accurate for an unfamiliar browser. `support_chat_keys/team_device`
is a single global administrator RSA recipient. Every new ticket snapshots that
public key; each message contains exactly two wrapped content keys (`ownerKey`,
`teamKey`). Adding a device row or replacing the public key cannot make those
existing envelopes decryptable. Role membership alone must not authorize key
transfer. The original RSA private keys are non-extractable in IndexedDB.

There is also a distinct defect on the **original administrator device**:
`GET /api/support-chat` omitted `version` and `deviceOnly` from `teamDeviceKey`.
The hook requires `version === 2`, so it rejected even the matching original key.
This PR returns the persisted discriminator without inventing a version for old
or malformed records. It deliberately retains the warning for unfamiliar devices.

The old local key creation sequence was read → generate → `put`, across separate
transactions. Two tabs could both observe no key, generate different identities
and overwrite one another. It also resolved at request success before transaction
commit. This PR reads and inserts in one serialized read/write transaction,
returns an existing identity if another tab won, uses `add` rather than `put`,
and resolves only after commit. Aborts reject; no reset or deletion is performed.

The API accepted arbitrary fields in a public JWK (`passthrough`), including
private RSA factors. A strict schema now accepts only the public 3072-bit
RSA-OAEP-SHA-256 format the client generates, a canonical modulus, exponent 65537
and encryption usage. Existing persisted records are not rewritten. This schema
checks format, not trust, possession, enrollment or key transparency.

## Authorization and data boundaries found

- Firebase Admin verifies ID tokens with revocation checking. Support role access
  currently means existence of `roles_admin/{uid}`; there is no separate support
  agent assignment or cryptographic device authorization model.
- Prototype API operations authorize every administrator across all encrypted
  tickets. This must be replaced by explicit conversation membership, live role
  checks and independently verified device membership before rollout.
- Current Firestore rules deny direct access to support key and message
  subcollections; stable ticket reads permit owners and administrators. Those
  denies are preserved. Enabling the UI flag alone will not make the prototype
  usable through its Firestore message listener.
- Legacy tickets remain plaintext; encrypted pilot history remains in its
  original documents. Neither format is migrated or relabeled by this PR.
- Existing hybrid encryption detects content/nonce/envelope modification but
  does not authenticate sender identity or bind a message to a conversation,
  message ID, epoch or counter. It does not prevent replay, provide forward
  secrecy or support revocation/rotation. Tests of tamper rejection do not prove
  those missing guarantees.

## Protocol evaluation and blocker

Upstream repositories and READMEs checked on 2026-11-13:

| Candidate | Fit | Work required before adoption |
| --- | --- | --- |
| [Matrix JS SDK](https://github.com/matrix-org/matrix-js-sdk) with Rust crypto/WASM | Browser/TypeScript integration, persistent crypto store, cross-signing, interactive own-device verification, secret storage and key backup APIs already exist. Prefer investigating this complete stack over inventing pairing and recovery. | Requires a Matrix homeserver/client-server transport and Firebase identity integration. It is not a crypto function that can simply be attached to Firestore. Review verified-device-only session sharing, room membership, historical sharing policy, recovery UX and current audit coverage of the selected release. Upstream warns multiple clients sharing an IndexedDB crypto store can corrupt state; use one crypto worker/owner across tabs. |
| [OpenMLS](https://github.com/openmls/openmls) | RFC 9420 implementation in Rust, with WASM support; useful group membership/epoch building block. | Still needs browser bindings/storage, account/device credentials, delivery ordering, authenticated pairing, recovery and history-transfer design. Does not supply the complete requested application security model. Verify exact release/provider audit coverage before selection. |
| Existing RSA/AES wrapper | Can read recoverable existing pilot history locally. | Retain only as a legacy reader. Extending it into an unreviewed enrollment/group protocol would not meet the request. |

Neither library is integrated in this PR. Repository activity is not proof of
independent review. No applicable audit report for a pinned integration has been
validated here. There is no configured homeserver or reviewed Firebase-only
protocol design in the repository. That infrastructure/integration and a
reviewed enrollment/history/recovery design remain necessary work, followed by
independent security review. Do not substitute a new custom protocol or claim
Signal/WhatsApp guarantees to remove the warning.

## Preservation and migration procedure (design; not executed)

1. Keep `NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED` unset/false. Retain working legacy
   support. Do not clear browser storage or overwrite `team`, `team_device`,
   `user_*`, ticket public keys or message envelopes. Back up Firestore using
   existing restricted operational access; never export unwrapped local keys.
2. Inventory legacy plaintext, version-1 wrapped identities and version-2 device
   identities separately, retaining ticket IDs, associations, order references,
   timestamps and status. Identify the original browsers; lost non-extractable
   private keys cannot be reconstructed from Firebase login or public keys.
3. After the replacement protocol and authorization model pass review, enroll
   each participant/device through that protocol's verified pairing. An agent
   must have both a current support role and explicit conversation membership.
4. Only an original authorized browser that can decrypt history may migrate it.
   Decrypt locally; re-encrypt into the reviewed target protocol for authorized
   recipients. Do not export plaintext to Admin APIs, Firestore, logs or a
   server-readable backup. Original encrypted documents remain immutable.
5. Implement a separately versioned migration journal with deterministic source
   message IDs, source integrity hashes, target IDs and per-batch checkpoints.
   Validate a target round-trip and bindings before marking a batch complete.
   Retry idempotently; preserve original timestamps/status/order associations.
   These journal and migration tools are not yet implemented.
6. A second verified device must prove it can read authorized history; interrupted
   batches must resume without duplicates. Roll back by selecting the original
   read path; retain originals. Do not promise recoverability when neither an
   original key nor a previously configured recovery capability remains.

## Verification and remaining acceptance criteria

New executable tests use WebCrypto, the actual API handler (mocked Firebase),
and fake-indexeddb. They verify both legacy recipients, wrong-key and tamper
rejection, public-only registration, complete admin device metadata, concurrent
local initialization, reload persistence, non-extractability and transaction
abort behavior. They do not establish secure enrollment or production readiness.

A separate real Chromium check runs two same-origin tabs concurrently, compares
persisted identities, then reloads and checks IndexedDB persistence. It is a
local browser storage check, not phone/desktop enrollment or a production test.

Outstanding work before this assignment is complete:

- Protocol integration and independently verified per-device enrollment for all
  roles, including replay/substitution protection and concurrent approvals.
- Recovery setup/use, rejected approvals, lost-device handling, device list,
  security notifications, revocation and key rotation.
- Assigned support agents, secure reassignment, role-removal enforcement and
  administrative audit logs.
- Implemented and verified resumable migration and multi-device history access.
- Message pagination, decrypted-message cache, idempotent retries, reconnect and
  optimistic send behavior; full desktop/mobile UI and keyboard verification.
- Firestore/API authorization implementation and emulator coverage for pending,
  revoked and unauthorized devices and users.
- Approximately 100-user measured workload with latency, Firestore usage and
  failure rates. No capacity claim is made by this PR.
- Android/iOS/PWA/browser matrix and an independent security review of the
  complete integration. No production rollout or merge request is made.

Recorded local results on 2026-11-13 (Node 24.22.1):

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts --cache /workspace/work/npm-cache` | Passed (custom cache avoids the read-only home directory). |
| `npm test` | 165 passed, 0 failed. Includes six new behavioral tests. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed. |
| `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:support-browser` | Passed real Chromium two-tab initialization and reload checks. Use Playwright's installed Chromium if the variable is omitted. |

No Firebase credentials or production data were used. Firestore emulator,
phone/PWA, production end-to-end, recovery/enrollment and load tests have not
passed or been claimed; the corresponding replacement functionality is absent.
