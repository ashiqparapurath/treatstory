# End-to-end encrypted support chat

New TreatStory support conversations use browser-side hybrid encryption.

- New buyer/seller accounts generate an RSA-OAEP 3072-bit key pair automatically on the first trusted browser. A non-extractable private CryptoKey is stored locally using IndexedDB, while only the public key is registered with Firestore. Buyers and sellers do not see or manage passphrases. Previous version-1 passphrase-wrapped keys are not silently replaced. Device-local keys are **not** portable: clearing site data, device loss or signing in on another browser leaves existing encrypted messages inaccessible until a separately designed recovery or multi-device enrollment flow is implemented.
- One authorized administrator initializes a shared support-team key. The admin screen can generate a 32-character passphrase (192 bits of entropy) locally with the browser's cryptographic random number generator; the admin must save it in a secure password manager and confirm that before activation. Alternatively, the admin can enter their own strong passphrase. Its private JWK is encrypted with that separate support-team passphrase. Only administrators may download that encrypted JWK. Agents must receive the passphrase outside TreatStory through an approved secure channel.
- Each message gets a fresh 256-bit AES-GCM content key and a fresh 96-bit nonce. The content key is wrapped separately for the customer and support team with RSA-OAEP-SHA-256. Firestore stores ciphertext, wrapped keys, sender UID and timestamps, never new message plaintext.
- Do **not** set the team passphrase as a Vercel environment variable or put it into server-side configuration: a server-accessible secret would defeat the intended end-to-end encryption boundary.
- The browser automatically loads the customer's non-extractable key from local device storage on future visits. No customer passphrase is sent to or stored on the server. Admins still use the team passphrase in this initial implementation.
- The team public key must be initialized before users can create chats. Only authenticated owners and administrators can read ticket message documents; all writes are authorized server-side. The server stores ciphertext only.

**Important security limitations (must be understood before production deployment):**

1. This is an initial E2EE implementation, not a formally audited messaging protocol. It does not offer forward secrecy or key rotation. Anyone who obtains the team passphrase plus the encrypted team key can read the team's historical messages.
2. TreatStory's served JavaScript is trusted to perform encryption, and the server provides public keys without out-of-band key authentication. A compromised origin/server could serve malicious JavaScript or substitute keys. Deploy with strict CSP, dependency controls and independent security review before advertising a high-assurance E2EE guarantee.
3. Loss of the customer's browser data or original device is irreversible for new device-local keys; there is no cross-device synchronization or recovery. Loss of the administrator team passphrase is also irreversible. Back up the team passphrase in an approved secure vault and document staff access and revocation.
4. Topic, order ID (when supplied), ticket state, user identifier and timestamps are **not encrypted**; message content is. Do not put secrets in the topic or order ID.
5. Legacy support tickets were plaintext and remain explicitly marked as such; they are not retroactively encrypted. Administrators should handle legacy retention under the platform privacy policy and encourage new chats.
6. Files/attachments, push previews, full-text searching and automated AI triage are intentionally not implemented: those features require separate client-side encryption design.
7. Set up and deploy the updated `firestore.rules` to the correct Firebase project before testing. Code commits alone do not deploy Firestore security rules.
8. Before production, run emulator access-control tests, browser cross-device key-unlock tests, message delivery/close tests, abuse-rate checks and an external security audit.

## Manual acceptance checklist

- Initialize the team key as an authorized administrator. Repeat initialization should fail.
- On a new customer account, verify the browser automatically generates a local non-extractable key without showing a passphrase or uploading any private key. Reload and sign back in in the same browser: history should remain readable. On a different device, verify a clear, honest inaccessible-history warning rather than a silent new identity or a misleading reset.
- Create a chat and exchange two or more messages with the team, checking real-time updates on both sides.
- Inspect Firestore and network requests: only ciphertext must be present in new message payloads, including notification and email text if those are added later.
- Confirm customer A cannot list or retrieve customer B's tickets, message subcollections or private key record. Confirm non-admins cannot retrieve the encrypted team private key.
- Confirm invalid passphrases fail with no plaintext fallback. Confirm closed chats reject new messages.
- Confirm older tickets are clearly labeled **not end-to-end encrypted**.

## Customer setup UX

Customers see only the support topic, message composer and their conversation history; key generation happens automatically. Their first browser is the only holder of their non-exportable device key. This is **not WhatsApp's multi-device Signal protocol**, does not support key rotation or forward secrecy, and should remain a draft pending thorough security review. Admin team keys still require the shared passphrase until the proposed per-agent identity architecture has been designed and reviewed.
