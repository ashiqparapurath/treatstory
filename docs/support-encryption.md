**Release safeguard:** This experimental chat is disabled by default. Until independently reviewed multi-device encryption is available, the public Support route and admin inbox use the established support-ticket system. Do not set `NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED=true` on production. The `/api/support-chat` endpoint rejects requests while disabled. Earlier encrypted pilot messages are preserved but not readable through the legacy ticket interface.

# End-to-end encrypted support chat

New TreatStory support conversations use browser-side hybrid encryption.

- New buyer/seller accounts generate an RSA-OAEP 3072-bit key pair automatically on the first trusted browser. A non-extractable private CryptoKey is stored locally using IndexedDB, while only the public key is registered with Firestore. Buyers and sellers do not see or manage passphrases. Previous version-1 passphrase-wrapped keys are not silently replaced. Device-local keys are **not** portable: clearing site data, device loss or signing in on another browser leaves existing encrypted messages inaccessible until a separately designed recovery or multi-device enrollment flow is implemented.
- For new conversations, one authorized administrator's browser automatically creates a non-extractable device private key in IndexedDB and registers its public key as the initial support recipient (team_device). No passphrase is needed for normal admin access. **Only the originally paired administrator browser can decrypt these chats. Additional admin devices and new agents must not be treated as enrolled until an audited device-sharing or per-agent key system exists.** The previous shared team key remains readable only through an optional, explicitly labeled legacy unlock for historical conversations.
- Each message gets a fresh 256-bit AES-GCM content key and a fresh 96-bit nonce. The content key is wrapped separately for the customer and support team with RSA-OAEP-SHA-256. Firestore stores ciphertext, wrapped keys, sender UID and timestamps, never new message plaintext.
- Do **not** set the team passphrase as a Vercel environment variable or put it into server-side configuration: a server-accessible secret would defeat the intended end-to-end encryption boundary.
- Both customer and initially paired administrator browser load non-extractable device keys from local storage automatically. No passphrase is sent to or stored on the server for new conversations. Only historical team chats may require the previous team passphrase.
- The initial administrator device's public key must be registered before users can create new chats. Only authenticated owners and administrators can read ticket message documents; all writes are authorized server-side. The server stores ciphertext only.

**Important security limitations (must be understood before production deployment):**

1. This is an initial E2EE implementation, not a formally audited messaging protocol. It does not offer forward secrecy, key rotation, cryptographic identity verification or secure multi-agent enrollment. Anyone who obtains the historical team passphrase plus the encrypted legacy team key can read legacy team messages, but cannot use it to decrypt new device-key conversations.
2. TreatStory's served JavaScript is trusted to perform encryption, and the server provides public keys without out-of-band key authentication. A compromised origin/server could serve malicious JavaScript or substitute keys. Deploy with strict CSP, dependency controls and independent security review before advertising a high-assurance E2EE guarantee.
3. Loss of either the customer or paired administrator browser data/device is irreversible for new device-local keys; there is no cross-device synchronization or recovery. Loss of the legacy administrator team passphrase is irreversible for historical chats. Preserve that legacy passphrase in a secure vault until legacy retention or migration is complete.
4. Topic, order ID (when supplied), ticket state, user identifier and timestamps are **not encrypted**; message content is. Do not put secrets in the topic or order ID.
5. Legacy support tickets were plaintext and remain explicitly marked as such; they are not retroactively encrypted. Administrators should handle legacy retention under the platform privacy policy and encourage new chats.
6. Files/attachments, push previews, full-text searching and automated AI triage are intentionally not implemented: those features require separate client-side encryption design.
7. Set up and deploy the updated `firestore.rules` to the correct Firebase project before testing. Code commits alone do not deploy Firestore security rules.
8. Before production, run emulator access-control tests, browser cross-device key-unlock tests, message delivery/close tests, abuse-rate checks and an external security audit.

## Manual acceptance checklist

- On the original admin browser, open Customer Support and verify new support device-key registration happens automatically without asking for a passphrase. Attempt to register another admin device and confirm it is blocked rather than rotating or overwriting the key.
- On a new customer account, verify the browser automatically generates a local non-extractable key without showing a passphrase or uploading any private key. Reload and sign back in in the same browser: history should remain readable. On a different device, verify a clear, honest inaccessible-history warning rather than a silent new identity or a misleading reset.
- Create a chat and exchange two or more messages with the team, checking real-time updates on both sides.
- Inspect Firestore and network requests: only ciphertext must be present in new message payloads, including notification and email text if those are added later.
- Confirm customer A cannot list or retrieve customer B's tickets, message subcollections or private key record. Confirm non-admins cannot retrieve the encrypted team private key.
- Confirm the optional legacy unlock rejects invalid passphrases with no plaintext fallback. Confirm closed chats reject new messages.
- Confirm older tickets are clearly labeled **not end-to-end encrypted**.

## Customer setup UX

Customers see only the support topic, message composer and their conversation history; key generation happens automatically. Their first browser is the only holder of their non-exportable device key. This is **not WhatsApp's multi-device Signal protocol**, does not support key rotation or forward secrecy, and should remain a draft pending thorough security review. New admin messages use a paired device key rather than the old shared passphrase, but cross-device, multi-agent and revocation workflows remain unimplemented and require security review.

## Legacy transition

Existing conversations were encrypted to the original shared support team public key. Do not delete or overwrite the original encrypted team key: doing so may make those old messages permanently inaccessible. The new admin inbox only offers an explicitly optional legacy passphrase field when older encrypted conversations exist. Newly created tickets are marked `teamKeyVersion: 2` and use the registered `team_device` public key, with no legacy team passphrase required. This is a single-device bridge, **not** a full WhatsApp/Signal implementation.
