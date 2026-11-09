# Mobile sharing, navigation, story image and installation

Changes are consolidated in one follow-up PR on top of merged PR #3.

- The product Share action is a 44px icon at the image's top-right on small screens. Desktop keeps the labelled button. Touching Share does not propagate gallery swipe handlers.
- Our Story replaces the fashion photograph with the existing local cakes, cookies and handmade gifts image. Responsive sizes and a taller mobile frame keep the photo relevant and readable.
- The mobile Sell shortcut opens `/seller/dashboard` for sellers and `/admin` for admins. Buyers/guests retain the application route. Pending/error role checks use the existing dashboard resolver rather than assume a buyer role; this reuses the shared account role listener. Server-side dashboard access checks remain unchanged.
- A global installation notice appears on browser visits, with a native installation action when `beforeinstallprompt` is available. Native browser prompts require a user tap. iPhone/iPad shows Safari Share → Add to Home Screen instructions. Other unsupported browsers show menu instructions rather than a nonworking install button.
- Installed app windows, related installed web apps (where the browser reports them), and recorded successful installs suppress the notice. Dismissal lasts for the tab session. `appinstalled` and display-mode changes hide it immediately. The manifest identifies the canonical production PWA as a related application for supporting browsers.

Install detection is limited by browser APIs: a browser may not report a previously installed app opened in a normal tab, especially across browsers or profiles. Standalone launches and installs observed by this site are handled. The new notice does not add offline support or create an App Store/Play Store binary.

Browser verification uses only the loopback demo emulators, synthetic sign-ins and simulated install events; it installs no actual app and modifies no production data. Run `TREATSTORY_AUDIT=local-only node scripts/audit/mobile-ux-check.cjs` after the existing isolated audit build/seed/server setup. See the JSON checks alongside this report and `docs/customer-support.md` for the existing support workflow.

Verification: 14 isolated browser checks passed for mobile/desktop sharing, story-image rendering, buyer/seller/admin routing, dismiss/reload, user-triggered install, standalone/related/remembered installation, iOS instructions and an installation/query race. No actual installation, mail sending or order placement occurred.

Final checks: production build, TypeScript check and all 69 existing regression tests passed. No dependencies changed.
