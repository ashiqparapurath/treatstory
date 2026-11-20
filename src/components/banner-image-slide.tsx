'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OptimizedImage } from '@/components/optimized-image';
import type { Banner } from '@/lib/products';
import { normalizeBannerHotspot, safeBannerLink } from '@/lib/banner-layout';
import { BANNER_IMAGE_SIZES } from '@/lib/image-source';

type Props = { banner: Banner; shouldLoad: boolean; onLoad: () => void; active: boolean };
type BoxSize = { width: number; height: number };

/**
 * Match the original compact promotional carousel dimensions while keeping
 * uploaded image artwork intact and hotspots on the visible artwork.
 */
function ImageSlide({
  banner, mobile, shouldLoad, onLoad, active,
}: Props & { mobile: boolean }) {
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
  const aspectRatio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 16 / 9;
  // Only the uploaded image's visible area carries the hotspot. The rest of
  // the compact frame is softly extended with the same artwork rather than a
  // blank panel or a crop that cuts off printed text/buttons.
  const needsSideFill = !frameSize || Math.abs(aspectRatio - frameSize.width / frameSize.height) > 0.015;
  const hotspot = normalizeBannerHotspot(mobile ? banner.mobileHotspot || banner.desktopHotspot : banner.desktopHotspot);
  const href = safeBannerLink(banner.buttonLink);
  const accessibleLabel = banner.linkLabel?.trim() || 'Explore collection';
  const mode = banner.imageLinkMode || 'none';

  // object-contain geometry: the visible image is the largest box with this
  // aspect ratio that fits inside the shared fixed-size carousel frame.
  const imageWidth = frameSize ? Math.min(frameSize.width, frameSize.height * aspectRatio) : 0;
  const imageHeight = imageWidth / aspectRatio;

  return (
    <div ref={frameRef}
      className={mobile
        ? 'relative flex h-[210px] w-full items-center justify-center overflow-hidden bg-[#f7f0e8] md:hidden'
        : 'relative hidden h-[clamp(200px,54vw,236px)] w-full items-center justify-center overflow-hidden bg-[#f7f0e8] sm:h-64 md:flex md:h-72 lg:h-[340px]'}>
      {/* Keep the entire 16:9 upload readable in the original wide frame.
          Only use a soft decorative extension when its ratio does not fit. */}
      {shouldLoad && needsSideFill && <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <OptimizedImage src={src} alt="" fill
          sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
          quality={60} loading="lazy"
          className="scale-110 object-cover blur-[24px] saturate-90" />
        <div className="absolute inset-0 bg-[#f7f0e8]/20" />
      </div>}
      {/* The fallback image stays visible while the frame is being measured. */}
      {!frameSize && shouldLoad && <OptimizedImage src={src}
        alt={banner.imageAlt || banner.title || 'TreatStory collection banner'} fill
        sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
        quality={80} loading="lazy" onLoad={onLoad} className="object-contain" />}
      {frameSize && (
        <div className="relative shrink-0" style={{ width: imageWidth, height: imageHeight }}>
          {shouldLoad && <OptimizedImage src={src}
            alt={banner.imageAlt || banner.title || 'TreatStory collection banner'}
            fill sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
            quality={80} loading="lazy" fetchPriority={active ? 'auto' : 'low'} onLoad={onLoad}
            className="object-contain" />}
          {href && mode === 'hotspot' && <Link href={href} aria-label={accessibleLabel}
            className="absolute z-10 block rounded-sm bg-transparent outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874a28]"
            style={{
              left: `${hotspot.x}%`, top: `${hotspot.y}%`,
              width: `${hotspot.width}%`, height: `${hotspot.height}%`,
            }}>
            <span className="sr-only">{accessibleLabel}</span>
          </Link>}
        </div>
      )}
      {href && mode === 'full' && <Link href={href} aria-label={accessibleLabel}
        className="absolute inset-0 z-10 block rounded-sm bg-transparent outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874a28]">
        <span className="sr-only">{accessibleLabel}</span>
      </Link>}
    </div>
  );
}

/** Both modes occupy the same original compact carousel height at each breakpoint. */
export function ImageOnlyBannerSlide(props: Props) {
  return <>
    <ImageSlide {...props} mobile onLoad={props.onLoad} />
    <ImageSlide {...props} mobile={false} onLoad={props.onLoad} />
  </>;
}
