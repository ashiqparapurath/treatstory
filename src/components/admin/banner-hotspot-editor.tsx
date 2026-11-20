'use client';

import { useRef, type PointerEvent } from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import type { BannerHotspot } from '@/lib/banner-layout';
import { normalizeBannerHotspot } from '@/lib/banner-layout';

type Props = {
  label: string;
  src: string | null;
  aspectRatio: number;
  value: BannerHotspot;
  onChange: (next: BannerHotspot) => void;
  disabled?: boolean;
};
type Gesture = {
  pointerId: number;
  startX: number; startY: number;
  hostWidth: number; hostHeight: number;
  original: BannerHotspot;
  resize: boolean;
};

export function BannerHotspotEditor({ label, src, aspectRatio, value, onChange, disabled }: Props) {
  const gesture = useRef<Gesture | null>(null);
  const current = normalizeBannerHotspot(value);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const element = event.target as HTMLElement;
    const host = event.currentTarget;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (!element.closest('[data-banner-hotspot]')) {
      onChange(normalizeBannerHotspot({
        ...current,
        x: ((event.clientX - bounds.left) / bounds.width) * 100 - current.width / 2,
        y: ((event.clientY - bounds.top) / bounds.height) * 100 - current.height / 2,
      }));
      return;
    }
    event.preventDefault();
    host.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      hostWidth: bounds.width, hostHeight: bounds.height,
      original: current,
      resize: !!element.closest('[data-hotspot-resize]'),
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - active.startX) / active.hostWidth) * 100;
    const dy = ((event.clientY - active.startY) / active.hostHeight) * 100;
    onChange(normalizeBannerHotspot(active.resize
      ? { ...active.original, width: Math.max(8, Math.min(100 - active.original.x, active.original.width + dx)),
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
    <p className="text-xs text-muted-foreground">Drag the blue area to move it, drag its lower-right corner to resize, or tap the preview to reposition.</p>
    <div className="relative w-full overflow-hidden rounded-lg border bg-[#eee2d7] touch-none"
      style={{ aspectRatio: aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : 16 / 9 }}
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {src ? <Image src={src} alt="" fill unoptimized className="pointer-events-none object-contain" /> :
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Upload a banner to position its button</div>}
      {src && <div data-banner-hotspot className="absolute z-10 cursor-move rounded border-2 border-blue-600 bg-blue-500/20 shadow-[0_0_0_1px_white] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        style={{ left: `${current.x}%`, top: `${current.y}%`, width: `${current.width}%`, height: `${current.height}%` }}
        role="img" aria-label={`${label} clickable area preview`}>
        <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-blue-600 px-1 text-[9px] font-semibold text-white">Link</span>
        <span data-hotspot-resize className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-blue-600" />
      </div>}
    </div>
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
