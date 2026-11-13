# TreatStory encrypted-support deployment baseline

**Status: configuration only. No production server is provisioned or activated by this repository change.**

This single-host stack runs PostgreSQL, Synapse, and a TLS-terminating Nginx
gateway. Only TCP 443 is published. Synapse and PostgreSQL live on an internal
Docker network without host-published ports. Every gateway request needs a
server-only high-entropy header secret. All browser traffic must go through the
Firebase-authenticated TreatStory Next.js API, never directly to Synapse.

## Prerequisites

Use a dedicated, patched Linux host with Docker Compose, monitored persistent
storage, restricted SSH and firewall/security group rules allowing only HTTPS
443 and administrator-restricted SSH. Explicitly deny **8008, 8448 and 5432**
on every IPv4/IPv6 interface, including alternate host addresses. DNS and
publicly trusted TLS certificates must be configured for a real gateway name.

Obtain a real and **immutable** Matrix server name (the identity namespace must
not change after enrolling devices). Use a Python environment with PyYAML 6.0.3.
The Synapse image is pinned to the digest used in integration testing. Nginx
and PostgreSQL tags are version-pinned, not image digests: record and approve
resolved digests and security advisories before the production deployment.

## One-time, private-host setup

Change directory to infra/support-matrix and run the following on the
deployment host, not in CI or a shared terminal:

1. Copy env.sample to .env and set MATRIX_SERVER_NAME and MATRIX_GATEWAY_HOST
   to real DNS names. Set MATRIX_UID and MATRIX_GID to the private/synapse
   directory's owner (default 991). Create private/synapse, private/secrets and
   private/tls with directory mode 0700. Ensure private/synapse is writable
   by the selected UID/GID.
2. Generate independent secrets with openssl rand -hex 32, each into an
   owner-only 0600 file under private/secrets named postgres_password,
   jwt_secret and gateway_secret. Never put these values in source control
   or public NEXT_PUBLIC environment variables. Install valid fullchain.pem
   and privkey.pem into private/tls and configure certificate renewal.
3. Generate Synapse's **original** private signing key and configuration once:
   docker compose run --rm --no-deps synapse generate
   Check that homeserver.yaml and the signing key were created; preserve them.
   Do not generate again for an enrolled server.
4. In an isolated Python environment with PyYAML==6.0.3, run:
   python3 configure.py
   This preserves server-generated identity/registration secrets, configures
   PostgreSQL and HS256 JWT login, disables public registration and federation
   listeners, and writes a private Nginx configuration. The script fails
   closed if already configured. Recheck without mutation using:
   python3 configure.py --check
5. Run docker compose config --quiet, then docker compose up -d. Check the
   PostgreSQL health check, Synapse readiness, TLS and gateway behavior.
6. Provision the one-time privileged Synapse service account inside the
   private container:
   docker compose exec -T synapse python /opt/treatstory/bootstrap_service.py
   The access token is stored only at private/synapse/treatstory-service-token
   (owner-only); it is never printed. Preserve it in a secure secret manager.
   A missing or revoked token after enrollment requires reviewed recovery,
   never a blind reset of Synapse identities.
7. From a **separate trusted network**, test valid certificate/DNS, anonymous
   403s, authenticated versions endpoint, and closed raw ports. The smoke.py
   utility reads the gateway secret from a private local file; only transfer
   it to a trusted operator via a secure channel. Test alternate IPs and IPv6,
   DNS/certificate renewal, Synapse admin API denial, and host/cloud firewall
   rules. A host-local smoke run alone cannot prove public isolation.

## Vercel and Firebase activation is deliberately separate

Provision server-side Vercel secrets using your approved secret manager:

- SUPPORT_MATRIX_HOMESERVER_URL = https://gateway-host/
- SUPPORT_MATRIX_SERVER_NAME = immutable Matrix server name
- SUPPORT_MATRIX_JWT_SECRET = private/secrets/jwt_secret contents
- SUPPORT_MATRIX_SERVICE_TOKEN = private/synapse/treatstory-service-token contents
- SUPPORT_MATRIX_GATEWAY_SECRET = private/secrets/gateway_secret contents
- SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED = true **only after** independently
  proving that public access cannot bypass the protected gateway

Deploy reviewed firestore.rules and firestore.indexes.json to the correct
Firebase project, and verify role and assignment queries against staging.
Use only server-side secrets: never commit, paste, or expose them in JS bundles.

Keep both NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED and NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED
**unset/false** until the external security review, load test, and physical
device acceptance are approved. The stable support-ticket route remains active.
These repository files do NOT grant access to Vercel, Firebase, DNS, cloud
network policies or any production secret.

## Recovery, monitoring and rollback

Back up PostgreSQL plus the whole private/synapse identity/signing-key/media
directory and the JWT/gateway/service credentials. A database dump alone is
insufficient. Encrypt backups off-host, restrict operators, establish retention
and test an isolated restore with the same identity domain. Do not expose the
restored duplicate identity to the live public network.

Monitor memory, CPU, database growth/disk, restarts, 5xx, gateway failures,
certificate expiry and Vercel timeouts. Do not log authorization or gateway
headers, recovery codes, private keys, plaintext or message bodies.

To roll back application functionality, turn both feature flags off and deploy
the stable ticket-backed application; preserve Synapse, Firestore routing,
journals, browser keys and historical ciphertext unchanged. Rehearse service
and schema upgrades; never downgrade an incompatible Synapse database.

## Required release review

See docs/support-security-review.md and docs/support-device-acceptance.md.
This baseline is neither an independently audited solution nor an HA deployment.
A real protected host, proof of network isolation, secrets/backup review,
independent E2EE assessment, tested physical devices and measured ~100-active-user
capacity are still mandatory before production activation.
