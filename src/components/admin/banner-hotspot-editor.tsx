'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BannerHotspot, BannerCoverRect, BannerImagePlacement } from '@/lib/banner-layout';
import {
  bannerImageRect, bannerHotspotVisibility, normalizeBannerHotspot,
  normalizeBannerPlacement, panBannerImage,
} from '@/lib/banner-layout';

type Props = {
  label: 'Desktop' | 'Mobile';
  src: string | null;
  aspectRatio: number;
  /** Matches the production carousel proportions at this viewport. */
  frameAspectRatio: number;
  fit?: 'cover' | 'contain';
  displayMode?: 'standard' | 'image-only';
  imageLinkMode?: 'none' | 'full' | 'hotspot';
  title?: string;
  subtitle?: string;
  buttonText?: string;
  value: BannerHotspot;
  onChange: (next: BannerHotspot) => void;
  placement: BannerImagePlacement;
  onPlacementChange: (next: BannerImagePlacement) => void;
  disabled?: boolean;
};

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
  rect: BannerCoverRect;
  initialHotspot: BannerHotspot;
  initialPlacement: BannerImagePlacement;
  action: 'pan' | 'hotspot' | 'resize';
};

type Dimensions = { width: number; height: number };

export function BannerHotspotEditor({
  label, src, aspectRatio, frameAspectRatio, fit = 'cover', displayMode = 'image-only',
  imageLinkMode = 'hotspot', title, subtitle, buttonText, value, onChange,
  placement, onPlacementChange, disabled,
}: Props) {
  const gesture = useRef<Gesture | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [editTarget, setEditTarget] = useState<'image' | 'button'>('image');
  const [viewMode, setViewMode] = useState<'artwork' | 'website'>(
    displayMode === 'image-only' ? 'artwork' : 'website',
  );
  const [sourceRatio, setSourceRatio] = useState<number | null>(null);

  useEffect(() => {
    setViewMode(displayMode === 'image-only' ? 'artwork' : 'website');
  }, [displayMode]);

  useEffect(() => { setSourceRatio(null); }, [src]);

  const measureImage = (image: HTMLImageElement) => {
    const ratio = image.naturalWidth / image.naturalHeight;
    if (Number.isFinite(ratio) && ratio > 0) setSourceRatio(old => old === ratio ? old : ratio);
  };
  const hotspot = normalizeBannerHotspot(value);
  const position = normalizeBannerPlacement(placement);
  const mobile = label === 'Mobile';
  const isStandard = displayMode === 'standard';
  const canPositionHotspot = !isStandard && imageLinkMode === 'hotspot';
  const editingHotspot = canPositionHotspot && editTarget === 'button';
  const imageRatio = sourceRatio || (Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9);
  const artworkMode = !isStandard && viewMode === 'artwork';
  const previewRatio = artworkMode ? imageRatio
    : Number.isFinite(frameAspectRatio) && frameAspectRatio > 0 ? frameAspectRatio : 4;
  const previewFit = artworkMode ? 'contain' : fit;

  useEffect(() => {
    const el = preview.current;
    if (!el) return;
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0)
        setDimensions(old => old?.width === bounds.width && old?.height === bounds.height
          ? old : { width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const areaWidth = dimensions ? dimensions.width * (isStandard && mobile ? 0.56 : 1) : 0;
  const areaLeft = dimensions && isStandard && mobile ? dimensions.width - areaWidth : 0;
  const areaHeight = dimensions?.height || 0;
  const imageRect = dimensions
    ? bannerImageRect(areaWidth, areaHeight, imageRatio, previewFit, position)
    : null;
  const fractionVisible = dimensions && imageRect
    ? bannerHotspotVisibility(imageRect, hotspot, areaWidth, areaHeight) : 1;

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !dimensions || !imageRect || !imageRect.width || !imageRect.height) return;
    const element = event.target as HTMLElement;
    const frame = event.currentTarget.getBoundingClientRect();
    const onHotspot = !!element.closest('[data-banner-hotspot]');
    const resizing = !!element.closest('[data-hotspot-resize]');
    const action: Gesture['action'] = editingHotspot
      ? resizing ? 'resize' : 'hotspot' : 'pan';

    if (editingHotspot && !onHotspot) {
      const clickX = event.clientX - frame.left - areaLeft - imageRect.left;
      const clickY = event.clientY - frame.top - imageRect.top;
      onChange(normalizeBannerHotspot({
        ...hotspot,
        x: clickX / imageRect.width * 100 - hotspot.width / 2,
        y: clickY / imageRect.height * 100 - hotspot.height / 2,
      }));
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      frameWidth: areaWidth, frameHeight: areaHeight,
      imageWidth: imageRect.width, imageHeight: imageRect.height,
      rect: imageRect, initialHotspot: hotspot, initialPlacement: position, action,
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;

    if (current.action === 'pan') {
      onPlacementChange(panBannerImage(
        current.initialPlacement, current.frameWidth, current.frameHeight,
        current.rect, dx, dy,
      ));
    } else {
      const x = dx / current.imageWidth * 100;
      const y = dy / current.imageHeight * 100;
      onChange(normalizeBannerHotspot(current.action === 'resize'
        ? { ...current.initialHotspot,
          width: Math.max(8, Math.min(100 - current.initialHotspot.x, current.initialHotspot.width + x)),
          height: Math.max(8, Math.min(100 - current.initialHotspot.y, current.initialHotspot.height + y)) }
        : { ...current.initialHotspot, x: current.initialHotspot.x + x, y: current.initialHotspot.y + y }));
    }
  };

  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const setPosition = (next: Partial<BannerImagePlacement>) =>
    onPlacementChange(normalizeBannerPlacement({ ...position, ...next }));

  const nudge = (axis: 'x' | 'y', direction: -1 | 1) => {
    // If the image exactly fits an axis, a small zoom creates room to pan.
    const free = axis === 'x' ? areaWidth - (imageRect?.width || areaWidth)
      : areaHeight - (imageRect?.height || areaHeight);
    if (Math.abs(free) < 0.5) {
      setPosition({ zoom: Math.max(position.zoom, 120), [axis]: 50 + (direction === -1 ? 10 : -10) });
      return;
    }
    // Alignment percentages reverse direction when an image overflows its frame.
    setPosition({ [axis]: position[axis] + direction * (free > 0 ? 10 : -10) });
  };

  return <section className="min-w-0 space-y-3 rounded-xl border border-[#e5dcd1] bg-white/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{label} live preview</p>
        <p className="text-xs text-muted-foreground">{artworkMode
          ? 'Full original artwork · no padding'
          : mobile ? 'Actual mobile frame · 390 × 210' : 'Actual desktop frame · 1360 × 340'}</p>
      </div>
      {canPositionHotspot && <div className="flex gap-1 rounded-full bg-[#f2ece5] p-1" aria-label={`${label} editor mode`}>
        <Button type="button" size="sm" variant={editTarget === 'image' ? 'default' : 'ghost'}
          className="rounded-full text-xs" disabled={disabled} onClick={() => setEditTarget('image')}>Move image</Button>
        <Button type="button" size="sm" variant={editTarget === 'button' ? 'default' : 'ghost'}
          className="rounded-full text-xs" disabled={disabled} onClick={() => setEditTarget('button')}>Move button</Button>
      </div>}
    </div>
    {!isStandard && <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-lg border border-[#e5dcd1] bg-white p-1" role="group" aria-label={`${label} preview view`}>
        <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs"
          variant={artworkMode ? 'default' : 'ghost'} aria-pressed={artworkMode} disabled={disabled}
          onClick={() => setViewMode('artwork')}>Full artwork</Button>
        <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs"
          variant={!artworkMode ? 'default' : 'ghost'} aria-pressed={!artworkMode} disabled={disabled}
          onClick={() => setViewMode('website')}>Website view</Button>
      </div>
      <span className="text-[11px] text-muted-foreground">{artworkMode ? 'No unused preview space' : 'Actual storefront proportions'}</span>
    </div>}
    <div ref={preview} className={`relative w-full overflow-hidden rounded-xl border border-[#e7d9ca] touch-none select-none ${mobile && !artworkMode ? 'mx-auto max-w-[390px]' : ''} bg-[#f7f0e8]`}
      role="group" aria-label={`${label} ${artworkMode ? 'full artwork editor' : 'website banner preview'}`}
      style={{ aspectRatio: previewRatio, cursor: disabled ? 'default' : editingHotspot ? 'crosshair' : 'grab' }}
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {src && !imageRect && <Image src={src} alt="" fill unoptimized
        onLoad={event => measureImage(event.currentTarget)}
        className={previewFit === 'contain' ? 'pointer-events-none object-contain' : 'pointer-events-none object-cover'} />}
      {src && imageRect && <div className="pointer-events-none absolute overflow-hidden"
        style={{ left: areaLeft, top: 0, width: areaWidth, height: areaHeight }}>
        <div className="absolute" style={{
          left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height,
        }}>
          <Image src={src} alt="" fill unoptimized onLoad={event => measureImage(event.currentTarget)} className="object-cover" />
          {canPositionHotspot && <div data-banner-hotspot className={`pointer-events-auto absolute z-10 rounded border-2 border-sky-600 bg-sky-400/25 ${editingHotspot ? 'cursor-move' : 'pointer-events-none'}`}
            style={{
              left: `${hotspot.x}%`, top: `${hotspot.y}%`,
              width: `${hotspot.width}%`, height: `${hotspot.height}%`,
            }} aria-label="Clickable image button area">
            <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-sky-600 px-1 text-[9px] text-white">Link</span>
            {editingHotspot && <span data-hotspot-resize className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-sky-600" />}
          </div>}
        </div>
      </div>}
      {isStandard && mobile && <>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#f9f3eb_0%,#f9f3eb_45%,rgba(249,243,235,0.98)_65%,rgba(249,243,235,0.58)_83%,rgba(249,243,235,0.06)_100%)]" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-start justify-start gap-1 px-3 py-2 text-left">
          <span className="rounded-full bg-white/95 px-1.5 py-0.5 text-[8px] text-[#78502f]">Made for you</span>
          <p className="max-w-[65%] text-xs font-semibold leading-4 text-[#33251c]">{title || 'Your banner title'}</p>
          <p className="max-w-[65%] line-clamp-2 text-[9px] text-[#685548]">{subtitle || 'Banner subtitle'}</p>
          <span className="mt-1 rounded-full bg-[#754328] px-2.5 py-1 text-[9px] text-white">{buttonText || 'Shop now'} →</span>
        </div>
      </>}
      {isStandard && !mobile && <>
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-white">
          <span className="text-[8px] font-semibold tracking-widest">THE TREATSTORY EDIT</span>
          <p className="line-clamp-2 text-lg font-semibold leading-tight">{title || 'Your banner title'}</p>
          <p className="max-w-[70%] line-clamp-2 text-xs">{subtitle || 'Banner subtitle'}</p>
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-[#372920]">{buttonText || 'Shop now'} →</span>
        </div>
      </>}
      {!src && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Upload a banner to see its live preview</div>}
    </div>
    <p className="text-xs text-muted-foreground">{editingHotspot
      ? 'Drag the blue button area, resize its corner, or tap the new position.'
      : artworkMode
        ? 'The full image is shown without empty bands. Zoom in to move it, then check Website view to confirm the real mobile/desktop crop.'
        : 'This shows the actual website frame. Space around a wide image is intentional in no-crop mode; switch to Full artwork for easier editing.'}</p>
    {canPositionHotspot && fractionVisible < 0.9 && <p role="status" className="text-xs text-amber-700">
      The clickable button area is partly or fully outside the visible image crop. Reposition it before saving.
    </p>}

    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium" htmlFor={`banner-zoom-${label}`}>Image zoom</label>
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(position.zoom)}%</span>
      </div>
      <input id={`banner-zoom-${label}`} type="range" min={100} max={250} step={5}
        value={position.zoom} disabled={disabled} onChange={e => setPosition({ zoom: Number(e.target.value) })}
        className="w-full accent-[#754328]" />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="min-w-0 space-y-1">Horizontal position
          <input type="range" min={0} max={100} step={1} value={position.x}
            disabled={disabled} onChange={e => setPosition({ x: Number(e.target.value) })}
            aria-label={`${label} image horizontal position`} className="w-full accent-[#754328]" />
        </label>
        <label className="min-w-0 space-y-1">Vertical position
          <input type="range" min={0} max={100} step={1} value={position.y}
            disabled={disabled} onChange={e => setPosition({ y: Number(e.target.value) })}
            aria-label={`${label} image vertical position`} className="w-full accent-[#754328]" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`${label} move image left`}
          onClick={() => nudge('x', -1)}><ArrowLeft className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`${label} move image right`}
          onClick={() => nudge('x', 1)}><ArrowRight className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`${label} move image up`}
          onClick={() => nudge('y', -1)}><ArrowUp className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={`${label} move image down`}
          onClick={() => nudge('y', 1)}><ArrowDown className="h-4 w-4" /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} className="ml-auto text-xs"
          onClick={() => onPlacementChange({ x: 50, y: 50, zoom: 100 })}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset</Button>
      </div>
    </div>
    {canPositionHotspot && <details className="rounded-lg border p-2 text-xs">
      <summary className="cursor-pointer font-medium">Button area coordinates</summary>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(['x', 'y', 'width', 'height'] as const).map(key =>
          <label key={key} className="min-w-0 space-y-1 text-muted-foreground">
            <span>{key === 'x' ? 'Left %' : key === 'y' ? 'Top %' : key === 'width' ? 'Width %' : 'Height %'}</span>
            <Input type="number" min={0} max={100} step={1} className="h-9 px-2"
              value={Math.round(hotspot[key])} disabled={disabled}
              onChange={event => {
                const n = Number(event.target.value);
                if (Number.isFinite(n)) onChange(normalizeBannerHotspot({ ...hotspot, [key]: n }));
              }} />
          </label>)}
      </div>
    </details>}
  </section>;
}
