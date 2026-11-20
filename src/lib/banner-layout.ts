/** Image-only banners store click areas as percentages of the *uncropped* image. */
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
