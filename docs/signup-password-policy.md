# TreatStory — email/password signup requirements

The email/password registration screen mirrors the Firebase Authentication password policy configured for TreatStory:

- 12 to 4096 characters (inclusive)
- At least one uppercase letter (A–Z)
- At least one lowercase letter (a–z)
- At least one number (0–9)
- At least one Firebase-supported special character

The registration UI shows a compact, responsive checklist and updates indicators as the visitor types. It rejects incomplete passwords locally and also calls Firebase's `validatePassword(auth, password)` immediately before `createUserWithEmailAndPassword` so Firebase's **current** project policy is the final check. No password is trimmed, stored, logged, or sent to TreatStory's backend by this validation.

**Firebase Console setting:** Authentication → Settings → Password policy. Keep the four requirements selected, minimum 12, maximum 4096, and **Force upgrade on sign-in** unchecked as shown in the project settings. These UI rules assume the Firebase console configuration remains aligned; if your project policy changes, update the local rules and checklist.

This applies only to **new email/password account creation**, not existing account sign-in or Google-based sign-in. The app does not turn on or modify Firebase's server-side policy or force upgrades.

Related: [Firebase password policy guidance](https://firebase.google.com/docs/auth/web/password-auth#recommended_set_a_password_policy).
