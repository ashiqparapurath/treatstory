'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';

type Status = 'idle' | 'loading' | 'found' | 'denied' | 'unavailable';
const CACHE_KEY = 'treatstory.home-area.v1';
const AUTO_KEY = 'treatstory.home-location-attempted.v1';

export function MobileLocationIndicator() {
  const [status, setStatus] = useState<Status>('idle');
  const [label, setLabel] = useState('Detect your area');
  const mounted = useRef(false);
  const busy = useRef(false);

  const locate = useCallback((manual: boolean) => {
    if (busy.current || !navigator.geolocation) {
      if (!navigator.geolocation) setStatus('unavailable');
      return;
    }
    busy.current = true;
    if (manual) {
      try { sessionStorage.removeItem(CACHE_KEY); } catch { /* Storage may be disabled. */ }
    }
    setStatus('loading');
    setLabel('Finding your area…');
    navigator.geolocation.getCurrentPosition(async position => {
      if (!mounted.current) { busy.current = false; return; }
      // Browser permission is explicit. Only coarse ~1km coordinates leave the browser;
      // no delivery address, precise GPS fix or location history is stored.
      setStatus('found');
      setLabel('Current location');
      try {
        const response = await fetch('/api/location/area', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            latitude: Math.round(position.coords.latitude * 100) / 100,
            longitude: Math.round(position.coords.longitude * 100) / 100,
          }),
        });
        const data = await response.json().catch(() => null);
        if (mounted.current && response.ok && typeof data?.label === 'string' && data.label.trim()) {
          const area = data.label.trim().slice(0, 95);
          setLabel(area);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ area, expires: Date.now() + 4 * 60 * 60 * 1000 })); } catch { /* Optional. */ }
        }
      } catch {
        // GPS is still enabled; a failed area lookup must not block shopping.
      } finally {
        busy.current = false;
      }
    }, error => {
      busy.current = false;
      if (!mounted.current) return;
      const denied = error.code === 1;
      setStatus(denied ? 'denied' : 'unavailable');
      setLabel(denied ? 'Enable your location' : 'Detect your area');
    }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { area?: unknown; expires?: unknown };
        if (typeof saved.area === 'string' && typeof saved.expires === 'number' && saved.expires > Date.now()) {
          setLabel(saved.area);
          setStatus('found');
          return () => { mounted.current = false; };
        }
      }
      // Never start another automatic permission prompt after a declined
      // request during this tab session. The button always allows a retry.
      if (sessionStorage.getItem(AUTO_KEY)) return () => { mounted.current = false; };
    } catch { /* Private browsing may disable storage. */ }

    const start = async () => {
      try {
        // The Permissions API may be absent on older iOS Safari.
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (cancelled) return;
        if (permission?.state === 'denied') {
          setStatus('denied');
          setLabel('Enable your location');
          return;
        }
      } catch { /* Call the browser API directly if querying is unsupported. */ }
      if (cancelled) return;
      // Strict Mode may unmount the first effect before permissions resolve.
      // Mark the automatic attempt only when the live effect is ready to run it.
      try {
        if (sessionStorage.getItem(AUTO_KEY)) return;
        sessionStorage.setItem(AUTO_KEY, '1');
      } catch { /* Optional session-only flag. */ }
      locate(false);
    };
    void start();
    return () => { cancelled = true; mounted.current = false; };
  }, [locate]);

  const prompt = status === 'denied' ? 'Location blocked in browser settings. Tap to retry.' :
    status === 'found' ? 'Approximate area via OpenStreetMap. Tap to refresh; this is not your saved delivery address.' :
    'Find your approximate area using browser location permission.';
  return (
    <button type="button" onClick={() => locate(true)} disabled={status === 'loading'}
      aria-label={status === 'loading' ? 'Detecting your current location' : 'Detect your current location'}
      aria-busy={status === 'loading'} title={prompt}
      className="mt-0.5 flex min-h-11 max-w-full items-center gap-1.5 rounded-lg pr-1 text-left text-[11px] font-medium text-white/85 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-75">
      {status === 'loading' ? <LoaderCircle aria-hidden="true" className="h-[14px] w-[14px] shrink-0 animate-spin" /> : <MapPin aria-hidden="true" className="h-[14px] w-[14px] shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
