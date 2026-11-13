# Design requirements and implementation mapping

The following requirements are the design checklist. The Matrix implementation
now supplies enrollment, recovery, revocation, assigned routing and history
transfer; see [current implementation and remaining release gates](support-implementation-status.md).
This checklist is not a statement that all production acceptance criteria passed.

# TreatStory encrypted chat: multi-device requirements (all account roles)

Status: **required architecture; NOT implemented by the existing device-key prototype. Keep replacement E2EE work in draft until these requirements pass.**

## Product requirement

A buyer, seller or administrator can sign into TreatStory on a mobile phone, another browser, a PWA, or a desktop, and continue their own encrypted conversations without being exposed to cryptographic key controls. Admin support agents may access assigned conversations only while authorized. Encryption remains end-to-end; the server must not receive plaintext message contents or any unencrypted private key.

### Secure enrollment UX

1. After signing in on a device that has already been enrolled, load its local device key and show chats normally.
2. On a new device, create a new non-exportable device identity key. Mark it **pending**. Do not treat Firebase login, a role claim or possession of a bearer token as sufficient decryption authorization.
3. If an enrolled device is available, request approval there. Present a short cross-device verification code/fingerprint on **both** devices, verified by the person. Only an approved device may send encrypted account-key material to the pending device, with authenticated key binding.
4. The new device downloads only the key material individually encrypted to it; decrypt it locally, verify the binding and activate. Store its non-exportable private device key in IndexedDB or a supported secure device store.
5. If **all** enrolled devices are lost, recovery requires an independently designed user-held recovery capability, such as a securely generated recovery code, or a reviewed hardware/passkey-backed recovery scheme with cross-platform support. This is a distinct recovery step, not a hidden backend decryption secret. Never silently reset a user's account key, since it makes prior messages inaccessible.
6. For support administrators, enrollment must also require administrator authorization and, for high-risk actions, recent reauthentication. Device enrollment must be recorded in a security audit trail, with notifications to the account owner.

## Cryptographic architecture

- Prefer a reviewed messaging protocol/library supporting multi-device sessions and forward secrecy (e.g. a maintained Signal-style implementation suitable for the chosen client environment). **Do not claim the existing RSA-OAEP/AES-GCM wrapper is Signal.**
- Separate per-account identity from per-device key pairs. Do not reuse the global `team_device` key for all administrators.
- Bind device identifiers to authenticated account identities and to verified public-key fingerprints. A malicious server must not be able to replace a key silently without a detectable verification failure.
- Provide signed, time-bounded, single-use enrollment approvals and prohibit self-approval or approval solely by signing in to the new device.
- For *new messages*, encrypt only to explicitly authorized recipients (customer devices and assigned support-agent devices), or use an audited group/key-management protocol. Never upload plaintext, recovery secrets or unwrapped content keys.
- For *history*, a trusted enrolled device may re-wrap history secrets for the new device after approval. Verify each message and key binding; do not export plaintext into Firestore. Paginate and resume safely.
- Revocation stops the removed device receiving **future** keys; rotate session/group keys as appropriate. A previously enrolled, compromised device may retain copies of older content: do not promise retroactive erasure.
- Maintain clear security boundaries between support agents, customers, sellers, and administrators. Support access must follow approved assignment and role policies rather than automatically granting every admin every conversation.
- Preserve existing legacy tickets and version-1/2 key records. Migration needs a tested explicit protocol; **never delete existing keys or silently replace recipients**.

## Acceptance criteria

- Buyer A: access the same new and existing chats on phone and laptop after secure pairing; buyer B cannot read them.
- Seller A: same behavior, without requiring an admin to know any password or encryption key.
- Admin A: secure pairing between browsers, with admin authorization; Admin B: independent device keys and only authorized conversations.
- Pending or revoked device cannot fetch readable message-key envelopes. An unapproved device cannot send or receive encrypted conversation data as a trusted recipient.
- Reusing enrollment challenge, tampering with recipient key, changing ownership or enrollment status, and enrolling from an unrelated account all fail.
- Key recovery and device loss are understandable to a nontechnical user, and never falsely imply prior messages can be recovered when keys are lost.
- History is decrypted locally in both linked devices; API/network logs, analytics, push previews and stored Firestore records have no plaintext message body or unwrapped private key.
- Test browser reload, PWA, private mode, Chrome/Firefox/Safari, Android/iOS, offline/retry, concurrent enrollment, and compromised/revoked accounts.
- All automated tests and independent cryptographic security review pass before production rollout.

## Current PR blockers

The existing prototype uses one device-local customer key per account and a global initial admin device key. It is **not** a safe implementation of the above requirements. Do not merge/deploy it until the protocol, migration, enrollment, recovery, and authorization are complete and verified. Simply creating a fresh key after login would make history inaccessible and potentially enable key substitution attacks.

## Investigation and preservation fixes

See [the implementation status](support-implementation-status.md) for the verified root cause, preservation fixes, protocol evaluation, migration plan, test evidence and outstanding release blockers. This design document is a requirement, not evidence of implementation.
