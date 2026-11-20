/** Image-only banners store clickable areas as percentages of the original image. */
export type BannerHotspot = { x: number; y: number; width: number; height: number };
export type BannerDisplayMode = 'standard' | 'image-only';
export type BannerImageLinkMode = 'none' | 'full' | 'hotspot';

export const DEFAULT_BANNER_HOTSPOT: BannerHotspot = { x: 6, y: 72, width: 27, height: 16 };

function clamp(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : min;
}

/** Prevent malformed persisted coordinates from producing off-image clickable areas. */
export function normalizeBannerHotspot(value?: Partial<BannerHotspot> | null): BannerHotspot {
  const input = { ...DEFAULT_BANNER_HOTSPOT, ...value };
  const width = clamp(input.width, 8, 100);
  const height = clamp(input.height, 8, 100);
  return {
    x: clamp(input.x, 0, 100 - width),
    y: clamp(input.y, 0, 100 - height),
    width,
    height,
  };
}

/** Only internal product/category pages are selectable; reject external or script links. */
export function safeBannerLink(link: unknown): string | null {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || /[\\\r\n\t]/.test(link)) return null;
  try {
    const url = new URL(link, 'https://treatstory.invalid');
    if (url.origin !== 'https://treatstory.invalid' || url.pathname !== '/products' || url.hash) return null;
    if ([...url.searchParams.keys()].some((key) => key !== 'category')) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/** Bounds of an object-cover image centered inside a banner frame, in CSS pixels. */
export type BannerCoverRect = { left: number; top: number; width: number; height: number };

export function bannerCoverRect(frameWidth: number, frameHeight: number, imageRatio: number): BannerCoverRect {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) ||
      frameWidth <= 0 || frameHeight <= 0) return { left: 0, top: 0, width: 0, height: 0 };
  const ratio = Number.isFinite(imageRatio) && imageRatio > 0 ? imageRatio : 16 / 9;
  const height = Math.max(frameHeight, frameWidth / ratio);
  const width = height * ratio;
  return { left: (frameWidth - width) / 2, top: (frameHeight - height) / 2, width, height };
}

/** How much of the clickable rectangle survives object-cover cropping (0..1). */
export function bannerHotspotVisibility(
  cover: BannerCoverRect, hotspot: BannerHotspot, frameWidth: number, frameHeight: number,
): number {
  if (!cover.width || !cover.height || !frameWidth || !frameHeight) return 0;
  const area = normalizeBannerHotspot(hotspot);
  const left = cover.left + cover.width * area.x / 100;
  const top = cover.top + cover.height * area.y / 100;
  const width = cover.width * area.width / 100;
  const height = cover.height * area.height / 100;
  const visibleW = Math.max(0, Math.min(frameWidth, left + width) - Math.max(0, left));
  const visibleH = Math.max(0, Math.min(frameHeight, top + height) - Math.max(0, top));
  return (visibleW * visibleH) / (width * height);
}

/** Image bounds for the mobile contain fit: show the entire artwork without cropping. */
export function bannerContainRect(frameWidth: number, frameHeight: number, imageRatio: number): BannerCoverRect {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) ||
      frameWidth <= 0 || frameHeight <= 0) return { left: 0, top: 0, width: 0, height: 0 };
  const ratio = Number.isFinite(imageRatio) && imageRatio > 0 ? imageRatio : 16 / 9;
  const width = Math.min(frameWidth, frameHeight * ratio);
  const height = width / ratio;
  return { left: (frameWidth - width) / 2, top: (frameHeight - height) / 2, width, height };
}

/** Placement is persisted per device; center/100% preserves existing banners. */
export type BannerImagePlacement = { x: number; y: number; zoom: number };
export const DEFAULT_BANNER_PLACEMENT: BannerImagePlacement = { x: 50, y: 50, zoom: 100 };

export function normalizeBannerPlacement(value?: Partial<BannerImagePlacement> | null): BannerImagePlacement {
  return {
    x: clamp(value?.x ?? 50, 0, 100),
    y: clamp(value?.y ?? 50, 0, 100),
    zoom: clamp(value?.zoom ?? 100, 100, 250),
  };
}

/** The single layout calculation for both the admin's preview and actual storefront.
 * Image placement is an alignment within available free space, or a crop offset
 * when the zoomed image extends beyond the frame.
 */
export function bannerImageRect(
  frameWidth: number, frameHeight: number, imageRatio: number,
  fit: 'cover' | 'contain', value?: Partial<BannerImagePlacement> | null,
): BannerCoverRect {
  const base = fit === 'contain'
    ? bannerContainRect(frameWidth, frameHeight, imageRatio)
    : bannerCoverRect(frameWidth, frameHeight, imageRatio);
  const placement = normalizeBannerPlacement(value);
  const width = base.width * placement.zoom / 100;
  const height = base.height * placement.zoom / 100;
  const offsetX = (frameWidth - width) * placement.x / 100;
  const offsetY = (frameHeight - height) * placement.y / 100;
  return {
    left: Math.abs(offsetX) < 1e-9 ? 0 : offsetX,
    top: Math.abs(offsetY) < 1e-9 ? 0 : offsetY,
    width, height,
  };
}

/** Convert a drag in pixels to a new image position without changing its size. */
export function panBannerImage(
  value: BannerImagePlacement, frameWidth: number, frameHeight: number,
  rect: BannerCoverRect, deltaX: number, deltaY: number,
): BannerImagePlacement {
  const current = normalizeBannerPlacement(value);
  const xSpace = frameWidth - rect.width;
  const ySpace = frameHeight - rect.height;
  return normalizeBannerPlacement({
    ...current,
    x: Math.abs(xSpace) < 0.01 ? current.x : current.x + deltaX / xSpace * 100,
    y: Math.abs(ySpace) < 0.01 ? current.y : current.y + deltaY / ySpace * 100,
  });
}
