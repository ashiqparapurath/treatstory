# TreatStory encrypted support: physical-device acceptance plan

**Pending manual real-device testing.** Chromium/Firefox/WebKit automation
and mobile viewport emulation DO NOT verify an actual phone, installed PWA,
physical keyboard, hardware storage or OS background behavior.

Run on a dedicated staging Firebase/Synapse namespace with artificial accounts
only. Record commit SHA, staging URL, date, real model, OS/browser version,
tester, redacted screenshots, console/network errors and issue links.

| Account | Physical device/browser | Result |
| --- | --- | --- |
| Buyer | iPhone Safari (current supported iOS) | Pending |
| Buyer | Android Chrome on real handset | Pending |
| Buyer | Installed Android PWA, clean and existing install | Pending |
| Seller | iPhone Safari and home-screen installation | Pending |
| Seller | Android Chrome and installed PWA | Pending |
| Admin | Desktop Chrome plus Firefox/Edge | Pending |
| Admin | Independently signed-in physical iPhone or Android | Pending |

## Required end-to-end scenarios for buyer, seller and agent

1. First sign-in creates the account's initial approved device. Create an
   encrypted recovery code; store it off-device. Verify conversations can
   be initiated only with an available verified assigned agent.
2. New login in another browser/device must be PENDING. Verify that encrypted
   message plaintext and backup keys are inaccessible. Reject SAS and verify
   pending status persists; then approve with matching challenge emojis.
3. Confirm real-time messages, history sync, unread state and draft survival.
   Background/foreground the application, reload, rotate phone, switch
   Wi-Fi/mobile data, open keyboard and verify safe-area layout and composer.
4. With all original devices offline, restore on a new device with saved
   recovery code. Wrong code must fail without replacing prior identities.
5. Revoke one device and verify transport, future keys and backup access are
   denied. Explain that previously viewed content may remain on that device.
6. Verify only an assigned current administrator can read metadata/receive
   chats; remove role and confirm immediate denial. Reassign to a newly
   approved agent and require explicit owner-controlled history transfer.
7. Repeat actual multi-device flows with seller/admin accounts; browser
   contexts used in CI for buyers are not an adequate substitute.
8. Check dialog focus, screen reader labels, touch targets, font scaling,
   contrast, keyboard handling and blocked/slow network recovery.

## Approval record

- Commit SHA and staging/production comparison:
- Reviewer(s) and device/OS/browser versions:
- Redacted screenshots, logs, pass/fail per scenario:
- Backup/restore and role-revocation evidence:
- External security auditor approval:
- Real ~100-active-user load report, p95/error rates and hosting costs:
- Operator backup and rollback rehearsal:
- Release decision: **NO-GO until all mandatory gates have evidence**.

Keep NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED and NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED
off throughout preparation.
