# TreatStory — Firebase Authentication password recovery

TreatStory sends new password-reset emails directly using Firebase Authentication's Web SDK `sendPasswordResetEmail`. Google Apps Script is no longer used for new reset requests.

## How it works

1. A visitor chooses **Forgot password?** on `/login` and enters an email address.
2. The browser calls Firebase Auth with the trimmed email and a `continueUrl` pointing to `/login` on the current site's origin (for example `https://treatstory.in/login`).
3. Firebase sends the password reset email through its configured **Password reset** template. The UI returns a neutral message even for an unknown address.
4. Welcome, verification, seller, order, and support emails continue using the existing signed Apps Script outbox.

The server endpoint `/api/email/account` now accepts only authenticated `welcome` and `verify-email` actions. A `reset-password` request to that endpoint returns HTTP 400 without queuing a message. The old Apps Script template and worker logic remain to finish previously queued reset messages; do not remove that compatibility until those jobs are drained.

## Firebase Console setup

1. In **Authentication → Sign-in method**, make sure **Email/Password** is enabled.
2. In **Authentication → Settings → Authorized domains**, add `treatstory.in` and, if used, `www.treatstory.in`. Preserve the old Vercel domain if it remains in use. An unauthorized `continueUrl` host prevents email delivery.
3. In **Authentication → Templates → Password reset**, set the sender name, reply-to, subject, and message. This Firebase template is distinct from Apps Script's HTML templates.
4. Optionally click **Customize domain** to send Firebase Authentication messages from a branded address. Add *only* the TXT and CNAME records Firebase displays. Keep the Vercel `www` CNAME unchanged. Without custom sender configuration, emails come from the default Firebase project domain.
5. Test with an email/password account you control. Request a reset on the production domain, check inbox/spam, open the action link, choose a new password, and sign back in. Check the `www` domain too if you expose it.

## Security and testing

Firebase manages password-reset delivery and throttling; the UI provides friendly feedback for network failures and excessive attempts. The UI avoids disclosing whether an email is registered. Google-only accounts should ordinarily continue with Google sign-in unless a password provider has also been linked.

Unit tests exercise the Firebase call, normalized email, origin-aware login URL, and absence of Apps Script calls from the login screen. Emulator tests retain legacy queued-reset coverage for compatibility. Automated tests do **not** send live production emails.

Official references: [Firebase Authentication SDK](https://firebase.google.com/docs/reference/js/auth#sendpasswordresetemail) and [custom Authentication email domains](https://firebase.google.com/docs/auth/email-custom-domain).
