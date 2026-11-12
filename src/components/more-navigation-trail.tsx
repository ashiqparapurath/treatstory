'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { nextMoreJourney, readMoreJourney, storeMoreJourney } from '@/lib/more-journey';

function JourneyContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const params = search.toString();
  const [previous, setPrevious] = useState<string | null>(null);
  useEffect(() => {
    const href = pathname + (params ? '?' + params : '');
    const journey = readMoreJourney();
    if (!journey.length || pathname === '/more') { setPrevious(null); return; }
    const updated = nextMoreJourney(journey, href);
    if (!updated.length) { setPrevious(null); return; }
    storeMoreJourney(updated);
    setPrevious(updated.length > 1 ? updated[updated.length - 2] : null);
  }, [pathname, params]);
  if (!previous) return null;
  return (
    <nav aria-label="More navigation history" className="pointer-events-none fixed left-3 top-[76px] z-40 md:hidden">
      <button type="button" onClick={() => {
        const journey = readMoreJourney();
        if (journey.length > 1) storeMoreJourney(journey.slice(0, -1));
        router.push(previous, {scroll:true});
      }} className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fffdfa]/95 px-4 text-xs font-semibold text-[#524536] shadow-[0_4px_22px_rgba(37,31,24,.15)] backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a28a66]">
        <ArrowLeft className="h-4 w-4" /> {previous === '/more' ? 'Back to More' : 'Back'}
      </button>
    </nav>
  );
}
export function MoreNavigationTrail() {
  return <Suspense fallback={null}><JourneyContent /></Suspense>;
}
