# Android startup logo jump: viewport mitigation

The provided recording confirms a discrete upward logo jump rather than a gradual movement: at approximately 1.9 seconds its top changes from video y=623 to y=605 (18 encoded-video pixels), while the horizontal bounds stay unchanged. The bottom system-bar region also changes appearance at this point. The shift happens before the homepage becomes visible. Measurements are in `recording-measurements.json`; the personal recording/frames are not published here.

## Observation versus inference

The recording proves the position jump. It does not identify the native callback responsible. A change in status/navigation-bar insets is a plausible cause, given the simultaneous system-bar change and the existing `viewport-fit=cover` opt-in. This remains a hypothesis until compared on the user's phone.

Chrome documents that `viewport-fit=cover` opts into edge-to-edge content. Chromium's installed-web-app architecture also describes changing inset handling when that viewport value becomes known, with behavior depending on browser features/version:

- [Chrome edge-to-edge guide](https://developer.chrome.com/docs/css-ui/edge-to-edge)
- [Chromium installed-web-app display modes and insets](https://github.com/chromium/chromium/blob/main/components/webapps/docs/android_architecture.md#display-modes-and-immersive-mode)

## Targeted change

Set the root viewport fit to `auto` rather than `cover`, consistently on all pages. This avoids explicitly requesting a switch to edge-to-edge layout as the document is parsed. Content follows the browser's default safe viewport instead of deliberately extending under system bars; behavior can vary with the browser. Icon artwork, transparent canvas, manifest identity/colors, native startup images, page content, and the absence of a second in-app splash remain unchanged. No startup delay or compensating pixel offset is added.

## Validation and remaining test

- Production build and TypeScript check passed.
- All 79 existing regression tests passed.
- Six local production-browser checks passed across home/catalog/about at 393×852 portrait and 852×393 landscape: one `viewport-fit=auto` declaration, visible appropriate navigation, no horizontal overflow, no second splash, and no page/hydration errors. No dynamic change back to `cover` was observed.
- These tests use Linux Chromium with an installed-window signal; they cannot reproduce or prove a fix to Android/Chrome's native splash rendering. The production phone test is still required.

After deployment, fully close and reopen the installed app so it fetches the new document viewport, then compare another launch recording. If the jump remains, do not claim success or shift the logo artwork to compensate; inspect the phone's Android/Chrome versions and native startup behavior next. No production data or environment settings changed.

Reproduction: production Next server on loopback `9032`, then `TREATSTORY_AUDIT=local-only node scripts/audit/startup-viewport-check.cjs`.
