# One artwork for launcher, splash and route loading

> Historical design: the in-app splash and branded loading fallback have now been removed. See [native-only launch](../native-only-launch/README.md) for the current behavior and verification.

The supplied TreatStory / Since 2026 SVG now drives all launcher PNGs, Android maskable artwork, Apple Home Screen icon, browser favicon, custom launch cover and route-loading screen. Every surface uses the shared `#faf8f3` background.

Inspection found that `src/app/loading.tsx` still displayed the previous `/icons/app-192.png` at 112px with separate brand text. That application fallback can explain an old-icon screen appearing after the custom SVG. It now displays the same responsive SVG at the same scale/position as the launch cover, with a small progress mark at the bottom. No minimum display delay was added.

## Icons and updates

`npm run icons` now reads `src/lib/pwa-branding.json` and rasterizes the supplied SVG rather than the previous TS monogram. Regular, 180px Apple, 192/512/1024px and adaptive icons are generated with an opaque cream background. The maskable version keeps every foreground pixel inside Android's central 80%-diameter safe circle, preserving the wide wordmark under masking. The favicon contains 32/48/64/256px PNG entries.

Manifest/Apple/favicon links use versioned filenames when the artwork/layout changes. Existing stable `/icons/app-*.png` and `/favicon.ico` URLs also serve the new artwork for older callers. The app identity, start URL and scope remain unchanged. If the SVG or background is replaced later, run both `npm run icons` and `npm run splash` to regenerate matching icons and iOS startup PNGs.

Android still controls its system launch screen and icon sizing; both that screen and the subsequent app rendering now use the same brand artwork. Existing Chrome/WebAPK/Home Screen installations can retain an older icon until Chrome updates the installed metadata. After deploying this PR, reopen the site; if the old icon persists, reinstalling the PWA can refresh it. Updating a website cannot force an immediate launcher-icon refresh across devices. Actual on-device installation/update timing has not been validated in this Linux environment.

Ordinary browser visits still have no forced launch cover. The application's existing route-loading fallback can now fetch the shared SVG while a page is pending; it does not request native iOS startup PNGs.

## Verification

- Production build and TypeScript checks passed.
- All **81 tests passed**, including icon opacity/background, current/legacy URL byte equality, safe adaptive padding, ICO entries and actual component markup using the same SVG.
- Four focused production-browser checks passed for installed launch, the actual route-loading component's matching artwork bounds/background, manifest icon URLs and current/legacy Apple/favicon assets.
- The eight existing splash browser checks also passed, covering mobile/desktop launch and hydration, ordinary visits, iOS metadata, failure timeout and JavaScript-disabled access. No hydration/page errors were observed in successful installed launch checks.
- The route-loading image comparison renders the actual component to HTML in a local browser fixture with the production CSS; it does not simulate an Android system launch screen. Reproduction: production Next server on loopback `9032`, then `TREATSTORY_AUDIT=local-only node scripts/audit/matching-branding-check.cjs` and the existing `scripts/audit/pwa-splash-check.cjs`.

No dependencies, environment variables, database rules or production data changed.

| Launch cover | Route-loading fallback |
| --- | --- |
| ![Launch cover](splash.png) | ![Matching route-loading artwork](loading.png) |

## Transparent Chrome follow-up

Chrome regular icons now use transparent padding and the manifest advertises only regular `any` icons to avoid selecting an opaque native icon tile. Apple/browser and legacy adaptive assets remain opaque. See [transparent Android icon](../transparent-android-icon/README.md) for this revision and the required physical-device check; removal of a system-generated outline is not guaranteed.
