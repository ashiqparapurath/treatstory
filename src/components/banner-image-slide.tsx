'use client';

import Link from 'next/link';
import { OptimizedImage } from '@/components/optimized-image';
import type { Banner } from '@/lib/products';
import { normalizeBannerHotspot, safeBannerLink } from '@/lib/banner-layout';
import { BANNER_IMAGE_SIZES } from '@/lib/image-source';

type Props = { banner: Banner; shouldLoad: boolean; onLoad: () => void; active: boolean };

function ImageSlide({
  banner, mobile, shouldLoad, onLoad, active,
}: Props & { mobile: boolean }) {
  const src = mobile && banner.mobileImageUrl ? banner.mobileImageUrl : banner.imageUrl;
  const aspectRatio = mobile && banner.mobileImageUrl
    ? banner.mobileAspectRatio || banner.imageAspectRatio || 16 / 9
    : banner.imageAspectRatio || 16 / 9;
  const hotspot = normalizeBannerHotspot(mobile ? banner.mobileHotspot || banner.desktopHotspot : banner.desktopHotspot);
  const href = safeBannerLink(banner.buttonLink);
  const accessibleLabel = banner.linkLabel?.trim() || 'Explore collection';
  const mode = banner.imageLinkMode || 'none';
  const overlayStyle = mode === 'hotspot' ? {
    left: `${hotspot.x}%`, top: `${hotspot.y}%`,
    width: `${hotspot.width}%`, height: `${hotspot.height}%`,
  } : { inset: 0 };

  return (
    <div className={mobile ? 'relative block w-full bg-[#f7f0e8] md:hidden' : 'relative hidden w-full bg-[#f7f0e8] md:block'}
      style={{ aspectRatio: Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9 }}>
      {shouldLoad && <OptimizedImage src={src} alt={banner.imageAlt || banner.title || 'TreatStory collection banner'}
        fill sizes={mobile ? '(max-width: 767px) 100vw, 0px' : BANNER_IMAGE_SIZES}
        quality={80} loading="lazy" fetchPriority={active ? 'auto' : 'low'} onLoad={onLoad}
        className="object-contain" />}
      {href && mode !== 'none' && <Link href={href} aria-label={accessibleLabel}
        className="absolute z-10 block rounded-sm bg-transparent outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#874a28]"
        style={overlayStyle}>
        <span className="sr-only">{accessibleLabel}</span>
      </Link>}
    </div>
  );
}

/** A complete artwork: never crop it, darken it, or draw a second CTA over it. */
export function ImageOnlyBannerSlide(props: Props) {
  return <>
    <ImageSlide {...props} mobile onLoad={props.onLoad} />
    <ImageSlide {...props} mobile={false} onLoad={props.onLoad} />
  </>;
}
