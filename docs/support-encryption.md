# End-to-end encrypted support chat

New TreatStory support conversations use browser-side hybrid encryption.

- Each buyer or seller creates an RSA-OAEP 3072-bit key pair in the browser. The private JWK is encrypted before upload using a PBKDF2-SHA-256 (310,000 iterations) derived AES-256-GCM key and a user-chosen passphrase.
- One authorized administrator initializes a shared support-team key. The admin screen can generate a 32-character passphrase (192 bits of entropy) locally with the browser's cryptographic random number generator; the admin must save it in a secure password manager and confirm that before activation. Alternatively, the admin can enter their own strong passphrase. Its private JWK is encrypted with that separate support-team passphrase. Only administrators may download that encrypted JWK. Agents must receive the passphrase outside TreatStory through an approved secure channel.
- Each message gets a fresh 256-bit AES-GCM content key and a fresh 96-bit nonce. The content key is wrapped separately for the customer and support team with RSA-OAEP-SHA-256. Firestore stores ciphertext, wrapped keys, sender UID and timestamps, never new message plaintext.
- Do **not** set the team passphrase as a Vercel environment variable or put it into server-side configuration: a server-accessible secret would defeat the intended end-to-end encryption boundary.
- A user must unlock their key in each new page session. The passphrase is not stored in the browser or sent to the server. Admins need the team passphrase.
- The team public key must be initialized before users can create chats. Only authenticated owners and administrators can read ticket message documents; all writes are authorized server-side. The server stores ciphertext only.

**Important security limitations (must be understood before production deployment):**

1. This is an initial E2EE implementation, not a formally audited messaging protocol. It does not offer forward secrecy or key rotation. Anyone who obtains the team passphrase plus the encrypted team key can read the team's historical messages.
2. TreatStory's served JavaScript is trusted to perform encryption, and the server provides public keys without out-of-band key authentication. A compromised origin/server could serve malicious JavaScript or substitute keys. Deploy with strict CSP, dependency controls and independent security review before advertising a high-assurance E2EE guarantee.
3. Passphrase loss is irreversible: there is intentionally no admin/back-end reset that can decrypt historical chats. Back up the team passphrase in an approved secure vault and document staff access and revocation.
4. Topic, order ID (when supplied), ticket state, user identifier and timestamps are **not encrypted**; message content is. Do not put secrets in the topic or order ID.
5. Legacy support tickets were plaintext and remain explicitly marked as such; they are not retroactively encrypted. Administrators should handle legacy retention under the platform privacy policy and encourage new chats.
6. Files/attachments, push previews, full-text searching and automated AI triage are intentionally not implemented: those features require separate client-side encryption design.
7. Set up and deploy the updated `firestore.rules` to the correct Firebase project before testing. Code commits alone do not deploy Firestore security rules.
8. Before production, run emulator access-control tests, browser cross-device key-unlock tests, message delivery/close tests, abuse-rate checks and an external security audit.

## Manual acceptance checklist

- Initialize the team key as an authorized administrator. Repeat initialization should fail.
- Create a customer key with a unique 12+ character passphrase. Confirm that the encrypted private key can unlock after signing out and signing back in from a different device.
- Create a chat and exchange two or more messages with the team, checking real-time updates on both sides.
- Inspect Firestore and network requests: only ciphertext must be present in new message payloads, including notification and email text if those are added later.
- Confirm customer A cannot list or retrieve customer B's tickets, message subcollections or private key record. Confirm non-admins cannot retrieve the encrypted team private key.
- Confirm invalid passphrases fail with no plaintext fallback. Confirm closed chats reject new messages.
- Confirm older tickets are clearly labeled **not end-to-end encrypted**.
