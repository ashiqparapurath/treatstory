export const IMAGE_FALLBACK = "/img/product-placeholder.svg";
const optimizedHosts = new Set([
  "firebasestorage.googleapis.com",
  "images.unsplash.com",
  "picsum.photos",
  "lh3.googleusercontent.com",
  "res.cloudinary.com",
]);
export function safeImageSource(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return IMAGE_FALLBACK;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"))
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return value;
  } catch {}
  return IMAGE_FALLBACK;
}
export function canOptimizeImage(source: string) {
  if (source.startsWith("/")) return true;
  try {
    return optimizedHosts.has(new URL(source).hostname);
  } catch {
    return false;
  }
}
export const CARD_IMAGE_SIZES =
  "(max-width: 639px) calc((100vw - 44px) / 2), (max-width: 1023px) calc((100vw - 88px) / 3), (max-width: 1439px) calc((100vw - 152px) / 4), 322px";
export const LEGACY_CARD_IMAGE_SIZES =
  "(max-width: 639px) calc((100vw - 44px) / 2), (max-width: 767px) calc((100vw - 68px) / 2), (max-width: 1023px) calc((100vw - 88px) / 3), (max-width: 1439px) calc((100vw - 152px) / 4), 322px";
export const DETAIL_IMAGE_SIZES =
  "(max-width: 639px) calc(100vw - 32px), (max-width: 767px) calc(100vw - 48px), (max-width: 1023px) calc((100vw - 80px) / 2), (max-width: 1439px) calc((100vw - 136px) / 2), 652px";
export const BANNER_IMAGE_SIZES =
  "(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 48px), (max-width: 1439px) calc(100vw - 80px), 1360px";

export function productPhotos(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .flatMap((url) => url.split(/\r?\n/))
    .map((url) => url.trim())
    .filter(Boolean);
}
