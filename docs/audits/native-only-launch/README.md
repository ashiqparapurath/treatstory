# Remove the second, in-app splash

The user requested removal of the second splash in addition to the transparent Android icon change. Both changes stay on `fix/transparent-android-launch-icon` for one follow-up PR.

- Remove the custom in-app launch overlay, inline startup detector, artwork preload, opacity/position CSS and startup/failure timers.
- Replace the full-screen wordmark route fallback with an unbranded page skeleton. It has accessible loading status, no logo/icon image and no minimum display delay.
- Preserve the platform-native startup settings, transparent regular Chrome icon manifest, cream theme/background, Apple icon and native iOS startup images. The supplied artwork remains the icon/native-startup source.
- No page navigation replays an in-app splash. Normal browsing and installed contexts request no extra splash SVG/PNG during the tested page loads. Native OS image fetching is outside these browser page checks.

## Validation

Production build and TypeScript validation passed. All **79 current regression tests** passed. Tests for the deleted launch detector were replaced with absence-of-overlay and unbranded-loading regressions. Eight production-browser launch checks and four focused branding checks passed for mobile/desktop installed and regular visits, navigation/hydration, blocked JavaScript, JavaScript disabled, retained native iOS metadata, actual skeleton rendering and transparent/legacy icon serving.

The skeleton preview below renders the actual loading and Skeleton components with production CSS in a local browser fixture. Physical Android native splash/outline behavior remains unverified; transparent assets remove the source's opaque tile but cannot guarantee removal of an OS-generated outline. See the transparent icon report for installation refresh requirements.

![Neutral route-loading skeleton](loading.png)

## Publication status

The previous PR #6 is merged. Automatic approval review rejected opening another PR without explicit user authorization under the single-PR instruction. The combined changes are prepared on one branch; no alternative PR creation path was used. Ask permission to open one consolidated follow-up PR after verification.
