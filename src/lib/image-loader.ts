import type { ImageLoaderProps } from "next/image";

export function isCloudinaryImage(source: string) {
  try {
    const url = new URL(source);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/[^/]+\/image\/upload\//.test(url.pathname) &&
      !url.pathname.includes("/s--") &&
      !url.search
    );
  } catch {
    return false;
  }
}
/** Use the image CDN directly instead of shipping a second client SDK or proxying it twice. */
export function cloudinaryImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps) {
  if (!isCloudinaryImage(src)) return src;
  const url = new URL(src);
  const size = Math.max(1, Math.min(3840, Math.round(width)));
  const q =
    quality === undefined
      ? "auto"
      : String(Math.max(1, Math.min(100, Math.round(quality))));
  url.pathname = url.pathname.replace(
    "/image/upload/",
    `/image/upload/f_auto,q_${q},c_limit,w_${size}/`,
  );
  return url.href;
}
