# Historical encrypted support formats

The former RSA support pilot is retired. New encrypted messaging uses the
Matrix implementation described in [implementation status](support-implementation-status.md).
Neither public feature flag revives the old `/api/support-chat` endpoint.

Historical messages used AES-GCM content encryption with a fresh content key,
wrapped separately with RSA-OAEP-SHA-256 for the owner and shared team recipient.
Version 1 stored passphrase-wrapped private identities; version 2 stored
nonextractable RSA private CryptoKeys in the original browser's IndexedDB.
These formats have no secure multi-device enrollment or future-key revocation.
They must not be presented as the new protocol or as Signal security.

Existing identities and message envelopes are preserved. Do not overwrite
`team`, `team_device`, `user_*` or ticket recipients, delete IndexedDB, export
private CryptoKeys, or put an old passphrase in server configuration. Missing
private keys cannot be recreated from public metadata. The atomic legacy key
storage helper preserves an existing identity under concurrent tabs and waits
for transaction commit; the public JWK schema excludes private RSA factors.

An authorized original browser can explicitly decrypt recoverable pilot history
locally and import it as new encrypted messages, retaining source metadata and
original records. The version-1 passphrase input is only for this historical
reader. A new device must first pass the new protocol's verification/recovery;
Firebase sign-in alone grants no historical private key.

Stable plaintext tickets remain available at `/support-tickets`; they are never
relabeled encrypted. Production encrypted messaging remains disabled pending
infrastructure, validation and independent security review.
