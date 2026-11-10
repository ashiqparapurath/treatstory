# Transparent Chrome icons: remove the opaque source tile

The supplied phone screenshot shows a thin rounded outline around the native Android icon tile. The custom SVG launch cover and route-loading page do not draw that shape. The previously advertised Chrome icons were full opaque cream squares, so this follow-up removes that opaque source tile as a best-effort way to avoid the backplate.

- The manifest now selects transparent regular 192px/512px PNG icons with `purpose: any`. Every visible pixel belongs to the black supplied wordmark; the surrounding canvas is transparent.
- The opaque maskable variant is no longer advertised to new Chrome installations. Opaque generated maskable files remain available for legacy callers. Apple Home Screen icons and browser ICO images keep their cream backgrounds.
- New icon URL versions let Chrome detect the revised assets. App identity, start URL, related-app identity, cream launch background, supplied SVG and loading behavior remain unchanged.
- Existing stable icon URLs continue to work. The old content-hashed assets are retained so cached manifests do not encounter missing files.

## Limits and phone verification

This removes the square background from the app-provided Chrome PNGs; it does not guarantee removal of an Android/OEM-generated mask, shadow or outline. Android/Chrome still controls the native launch screen. A real installation test on the user's phone is required to know whether the outline in the screenshot disappears. Linux Chromium asset/browser tests cannot prove that native effect.

After deployment, open the updated site and refresh/reinstall the PWA if the installed icon still comes from the old manifest. If the border remains with the transparent icons, it is being drawn by the phone/browser rather than the source artwork, and further website CSS changes cannot remove that system decoration.

## Verification

Production build and TypeScript checks passed. All 81 tests passed, including icon dimensions, transparent padding/ink-only pixels, retained opaque Apple/legacy adaptive assets, ICO validity, and unchanged shared SVG markup. The existing local production-browser branding check verifies resource serving and installed/route-loading artwork; its output is recorded beside this report.

No artificial startup delay, dependencies, environment variables, database rules or production data changed.

Four local production-browser branding/resource checks passed with the transparent icon manifest. They verify the shared SVG launch/loading rendering and new asset URLs, not the Android/OEM outline shown in the user's screenshot. On-device verification remains outstanding.
