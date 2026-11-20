'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OptimizedImage } from '@/components/optimized-image';
import type { Banner } from '@/lib/products';
import { bannerImageRect, normalizeBannerHotspot, safeBannerLink } from '@/lib/banner-layout';
import { BANNER_IMAGE_SIZES } from '@/lib/image-source';

type Props = { banner: Banner; shouldLoad: boolean; onLoad: () => void; active: boolean };
type BoxSize = { width: number; height: number };

/** Keep desktop full bleed, but show the complete image on mobile.
 * Hotspots follow the visible image, which is contained on mobile and covered on desktop.
 */
function ImageSlide({ banner, mobile, shouldLoad, onLoad, active }: Props & { mobile: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<BoxSize | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setFrameSize((previous) => previous?.width === rect.width && previous?.height === rect.height
        ? previous : { width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const src = mobile && banner.mobileImageUrl ? banner.mobileImageUrl : banner.imageUrl;
  const rawRatio = mobile && banner.mobileImageUrl
    ? banner.mobileAspectRatio || banner.imageAspectRatio || 16 / 9
    : banner.imageAspectRatio || 16 / 9;
  const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 16 / 9;
  const hotspot = normalizeBannerHotspot(mobile ? banner.mobileHotspot || banner.desktopHotspot : banner.desktopHotspot);
  const href = safeBannerLink(banner.buttonLink);
  const accessibleLabel = banner.linkLabel?.trim() || 'Explore collection';
  const mode = banner.imageLinkMode || 'none';
  const cover = frameSize ? bannerImageRect(frameSize.width, frameSize.height, ratio,
    mobile ? 'contain' : 'cover', mobile ? banner.mobilePlacement : banner.desktopPlacement) : null;

  return <div ref={frameRef}
    className={mobile
      ? 'relative h-[210px] w-full overflow-hidden bg-[#f7f0e8] md:hidden'
      : 'relative hidden h-[clamp(200px,54vw,236px)] w-full overflow-hidden bg-[#f7f0e8] sm:h-64 md:block md:h-72 lg:h-[340px]'}>
    {/* Cover the entire frame immediately, including before ResizeObserver measures it. */}
    {!cover && shouldLoad && <OptimizedImage src={src}
      alt={banner.imageAlt || banner.title || 'TreatStory collection banner'} fill
      sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
      quality={80} loading="lazy" onLoad={onLoad}
      className={mobile ? "object-contain object-center" : "object-cover object-center"} />}
    {cover && <div className="absolute" style={{
      left: cover.left, top: cover.top, width: cover.width, height: cover.height,
    }}>
      {shouldLoad && <OptimizedImage src={src}
        alt={banner.imageAlt || banner.title || 'TreatStory collection banner'} fill
        sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
        quality={80} loading="lazy" fetchPriority={active ? 'auto' : 'low'} onLoad={onLoad}
        className={mobile ? "object-contain object-center" : "object-cover object-center"} />}
      {href && mode === 'hotspot' && <Link href={href} aria-label={accessibleLabel}
        className="absolute z-10 block rounded-sm bg-transparent outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874a28]"
        style={{
          left: `${hotspot.x}%`, top: `${hotspot.y}%`,
          width: `${hotspot.width}%`, height: `${hotspot.height}%`,
        }}>
        <span className="sr-only">{accessibleLabel}</span>
      </Link>}
    </div>}
    {href && mode === 'full' && <Link href={href} aria-label={accessibleLabel}
      className="absolute inset-0 z-10 block rounded-sm bg-transparent outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874a28]">
      <span className="sr-only">{accessibleLabel}</span>
    </Link>}
  </div>;
}

export function ImageOnlyBannerSlide(props: Props) {
  return <>
    <ImageSlide {...props} mobile onLoad={props.onLoad} />
    <ImageSlide {...props} mobile={false} onLoad={props.onLoad} />
  </>;
}
