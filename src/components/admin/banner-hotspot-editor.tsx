'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import type { BannerHotspot, BannerCoverRect } from '@/lib/banner-layout';
import { bannerContainRect, bannerCoverRect, bannerHotspotVisibility, normalizeBannerHotspot } from '@/lib/banner-layout';

type Props = {
  label: string;
  src: string | null;
  aspectRatio: number;
  /** The proportions of the live carousel frame represented in the admin preview. */
  frameAspectRatio: number;
  /** Desktop crops to fill; mobile displays the complete image. */
  fit?: 'cover' | 'contain';
  value: BannerHotspot;
  onChange: (next: BannerHotspot) => void;
  disabled?: boolean;
};
type Gesture = {
  pointerId: number;
  startX: number; startY: number;
  imageWidth: number; imageHeight: number;
  original: BannerHotspot;
  resize: boolean;
};
type BoxSize = { width: number; height: number };

export function BannerHotspotEditor({
  label, src, aspectRatio, frameAspectRatio, fit = 'cover', value, onChange, disabled,
}: Props) {
  const gesture = useRef<Gesture | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<BoxSize | null>(null);
  const current = normalizeBannerHotspot(value);
  const previewRatio = Number.isFinite(frameAspectRatio) && frameAspectRatio > 0 ? frameAspectRatio : 4;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setFrameSize((old) => old?.width === rect.width && old?.height === rect.height
        ? old : { width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const cover: BannerCoverRect | null = frameSize
    ? (fit === 'contain' ? bannerContainRect(frameSize.width, frameSize.height, aspectRatio)
      : bannerCoverRect(frameSize.width, frameSize.height, aspectRatio))
    : null;
  const visible = cover && frameSize
    ? bannerHotspotVisibility(cover, current, frameSize.width, frameSize.height)
    : 1;

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !cover || !cover.width || !cover.height) return;
    const element = event.target as HTMLElement;
    const host = event.currentTarget;
    if (!element.closest('[data-banner-hotspot]')) {
      const frame = host.getBoundingClientRect();
      onChange(normalizeBannerHotspot({
        ...current,
        x: ((event.clientX - frame.left - cover.left) / cover.width) * 100 - current.width / 2,
        y: ((event.clientY - frame.top - cover.top) / cover.height) * 100 - current.height / 2,
      }));
      return;
    }
    event.preventDefault();
    host.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      imageWidth: cover.width, imageHeight: cover.height,
      original: current,
      resize: !!element.closest('[data-hotspot-resize]'),
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - active.startX) / active.imageWidth) * 100;
    const dy = ((event.clientY - active.startY) / active.imageHeight) * 100;
    onChange(normalizeBannerHotspot(active.resize
      ? { ...active.original,
          width: Math.max(8, Math.min(100 - active.original.x, active.original.width + dx)),
          height: Math.max(8, Math.min(100 - active.original.y, active.original.height + dy)) }
      : { ...active.original, x: active.original.x + dx, y: active.original.y + dy }));
  };

  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className="min-w-0 space-y-2">
    <p className="text-sm font-medium">{label}</p>
    <p className="text-xs text-muted-foreground">{fit === 'contain'
      ? 'Mobile shows your complete banner. Drag the blue link area to move it over the printed button.'
      : 'Desktop fills the frame; the preview shows its actual crop and the clickable area.'}</p>
    <div ref={hostRef} className="relative w-full overflow-hidden rounded-lg border bg-[#eee2d7] touch-none"
      style={{ aspectRatio: previewRatio }}
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {src && !cover && <Image src={src} alt="" fill unoptimized className={fit === "contain" ? "pointer-events-none object-contain" : "pointer-events-none object-cover"} />}
      {src && cover && <div className="pointer-events-none absolute" style={{
        left: cover.left, top: cover.top, width: cover.width, height: cover.height,
      }}>
        <Image src={src} alt="" fill unoptimized className="object-cover" />
      </div>}
      {!src && <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Upload a banner to position its button</div>}
      {src && cover && <div className="pointer-events-none absolute" style={{
        left: cover.left, top: cover.top, width: cover.width, height: cover.height,
      }}>
        <div data-banner-hotspot className="pointer-events-auto absolute z-10 cursor-move rounded border-2 border-blue-600 bg-blue-500/20 shadow-[0_0_0_1px_white]"
          style={{ left: `${current.x}%`, top: `${current.y}%`, width: `${current.width}%`, height: `${current.height}%` }}
          role="img" aria-label={`${label} clickable area preview`}>
          <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-blue-600 px-1 text-[9px] font-semibold text-white">Link</span>
          <span data-hotspot-resize className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-blue-600" />
        </div>
      </div>}
    </div>
    {src && fit === "cover" && visible < 0.9 && <p role="status" className="text-xs text-amber-700">
      The clickable area is {visible === 0 ? 'outside' : 'partially outside'} the visible crop.
      Move it over a visible button, use a differently composed {label.toLowerCase()} image, or select Whole banner clickable.
    </p>}
    <div className="grid grid-cols-4 gap-2">
      {(['x', 'y', 'width', 'height'] as const).map((key) =>
        <label key={key} className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span>{key === 'x' ? 'Left %' : key === 'y' ? 'Top %' : key === 'width' ? 'Width %' : 'Height %'}</span>
          <Input type="number" min={0} max={100} step={1} className="h-9 px-2" disabled={disabled}
            value={Math.round(current[key])}
            onChange={(event) => {
              const n = Number(event.target.value);
              if (Number.isFinite(n)) onChange(normalizeBannerHotspot({ ...current, [key]: n }));
            }} />
        </label>)}
    </div>
  </div>;
}
