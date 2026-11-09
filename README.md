# TreatStory

**Little finds, lovely stories.**

TreatStory is a curated marketplace celebrating independent creators across Kerala. Discover home-baked treats, handmade crafts, original art, thoughtful gifts, and other products made with care.

## What we're building

- **For shoppers:** Explore products from home bakers, artists, and handmade creators, and shop their collections.
- **For creators:** Apply to become a seller, showcase products, and manage a storefront once approved.
- **For the TreatStory team:** Review seller applications and manage marketplace activity.

Seller applications can be submitted without signing in. Seller account access is granted only after review and activation.

## Technology

Built with Next.js, React, TypeScript, Tailwind CSS, and Firebase.

## Created & maintained by

**Ashiq**  
Instagram: [@mrashiq._](https://www.instagram.com/mrashiq._)

---

© 2026 TreatStory. All rights reserved.

## Transactional email

All app emails, including verification/password reset, use a signed Google Apps Script relay with 31 branded HTML/plain-text templates. Firebase generates and validates secure account links; Apps Script sends the messages from the deploying Google account. See [email setup](docs/email-setup.md) and the complete [Code.gs](apps-script/Code.gs) for deployment, environment variables and the included retry trigger. No custom email domain is required; no secrets are stored in this repository.
