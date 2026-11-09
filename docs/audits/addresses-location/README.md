# Saved addresses, location suggestions and Wishlist

This follow-up is included in PR #4 with mobile sharing/navigation/story/install changes.

## Address book

- Buyers can keep up to ten delivery addresses, edit/remove them and choose a default in Account → Saved delivery addresses.
- Checkout keeps a two-line summary and opens a popup to choose a saved address, add/edit one, or enter details just for this order. Choosing a delivery address does not change the saved default. Name, phone, street/area text and PIN switch together.
- A shared live, identity-scoped listener reads the address book. Selected saved-address edits remain current; explicit one-order overrides survive later default updates. Pending selections are protected from a delayed initial snapshot.
- `/api/addresses` derives ownership from the verified account, validates/bounds input and updates the book/default atomically. A legacy default is preserved as the first entry when a buyer first saves another address. Repeated saves with the same ID do not add duplicates; concurrent additions do not lose entries. Removing the default selects another saved address, or clears it if none remain.
- New private `customer_address_books/{uid}` documents are owner-readable and server-writable only. The existing `customer_addresses/{uid}` default stays compatible with existing consumers. Account sign-out clears/hides the shared data.

## Location

- Use my location appears only in the address editor. A tap requests browser geolocation; no automatic tracking or background permission request is added.
- `/api/addresses/location` verifies authentication and coordinates, then reverse-geocodes through Nominatim to suggest locality, district, state and an unambiguous Indian PIN. It does not guess a house/apartment or overwrite street text. Edits made during the request are preserved; cancelled/closed editors ignore late results.
- Buyers must review and explicitly save the address. Permission refusal, unsupported browsers, location timeout, missing/ambiguous PIN, provider errors or throttling leave manual entry available.
- Only the confirmed address is saved; coordinates/results are not persisted in the address book. Private counters store request times/counts, not coordinates. The privacy policy and popup explain the transfer to the map provider and show OpenStreetMap attribution.
- Default provider: `https://nominatim.openstreetmap.org/reverse`, identified by an application User-Agent. Requests are user-triggered, have a six-second upstream deadline, share a distributed 1.2-second minimum spacing across instances, and allow at most five lookups per account/minute. Busy requests fail gracefully; no product cache is introduced. The public provider has no availability guarantee. `NOMINATIM_REVERSE_URL` optionally points to an operator-provided HTTPS endpoint with the same response format when traffic warrants moving providers. No new API key is needed for the default provider.
- Permissions-Policy permits geolocation for this site's own origin only. Third-party frames remain restricted.

## Wishlist

The account link, saved-items heading, add/remove controls, accessible labels, toast/error/empty text and welcome message now say Wishlist. Existing saved items and links remain valid; no data migration is needed for this terminology change.

## Verification

- 74 automated tests pass, including address validation, legacy conversion, default/removal transitions, bounds, idempotent replacement and location response filtering.
- 13 combined real API/rules/browser checks passed on isolated loopback demo emulators. These exercise owner/foreign reads, denied direct writes, rejected forged owners/invalid PIN, concurrent additions, atomic default changes, capacity, address popup saves, Wishlist, live checkout switching, one-order overrides, permission grant/refusal, in-flight edit preservation, coordinate validation/rate limiting and absence of stored coordinates.
- Browser geolocation and upstream geocoding were synthetic/stubbed. A separate single real provider request with public city-centre coordinates returned HTTP 200 and an Indian locality/district/state/PIN. No real buyer location was used. No production inventory, orders or mail were touched.
- Reproduction: run `TREATSTORY_AUDIT=local-only FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/audit/addresses-check.cjs` after the existing isolated audit seed/build/server setup and loading this branch's rules in the emulator.

## Release order

Deploy this branch's Firestore rules **before enabling the new application build**. Vercel deployments do not automatically deploy Firestore rules. Use the project's normal rules deployment, for example `firebase deploy --only firestore:rules --project <your-production-project-id>`, then deploy the app. Without those rules, the new address-book listener reports an access error and the picker cannot read saved books. Backend API deployment still uses the already-required server credentials. No production rules deployment was performed during this task.

Final verification: production build and TypeScript check passed. All 74 tests passed. The 14 mobile/share/install/navigation browser checks were rerun successfully with the address-book provider enabled. A geometry check now measures the stable image frame rather than the gallery's animated photo transform.
