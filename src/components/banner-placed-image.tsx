'use client';

import { useEffect, useRef, useState } from 'react';
import { OptimizedImage } from '@/components/optimized-image';
import { bannerImageRect, type BannerImagePlacement } from '@/lib/banner-layout';

type Props = {
  src: string;
  alt: string;
  ratio: number;
  placement?: BannerImagePlacement;
  fit?: 'cover' | 'contain';
  sizes: string;
  shouldLoad: boolean;
  active?: boolean;
  onLoad?: () => void;
};

/** Shared image positioning for legacy-style promotional banners.
 * The same geometry powers the interactive admin preview.
 */
export function BannerPlacedImage({
  src, alt, ratio, placement, fit = 'cover', sizes, shouldLoad, active, onLoad,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width && bounds.height) setFrame(old =>
        old?.width === bounds.width && old?.height === bounds.height ? old :
          { width: bounds.width, height: bounds.height });
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const rect = frame ? bannerImageRect(frame.width, frame.height, ratio, fit, placement) : null;
  return <div ref={frameRef} className="absolute inset-0 overflow-hidden">
    {shouldLoad && (!rect ? <OptimizedImage src={src} alt={alt} fill
      sizes={sizes} loading="lazy" quality={75} onLoad={onLoad}
      className={fit === 'contain' ? 'object-contain' : 'object-cover'} /> :
      <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
        <OptimizedImage src={src} alt={alt} fill sizes={sizes} loading="lazy"
          fetchPriority={active ? 'auto' : 'low'} quality={75} onLoad={onLoad} className="object-cover" />
      </div>)}
  </div>;
}
