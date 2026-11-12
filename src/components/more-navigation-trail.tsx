'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { moreJourneyBackLabel, nextMoreJourney, readMoreJourney, storeMoreJourney } from '@/lib/more-journey';

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
    <nav aria-label="More navigation history" className="bg-[#fcfaf6] md:hidden">
      <div className="section-shell flex min-h-12 items-center">
        <button type="button" onClick={() => {
          const journey = readMoreJourney();
          if (journey.length > 1) storeMoreJourney(journey.slice(0, -1));
          router.push(previous, {scroll:true});
        }} className="inline-flex min-h-11 items-center gap-2 bg-transparent px-0 text-xs font-semibold text-[#76614a] transition-colors hover:text-[#30271f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a28a66]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {previous === '/more' ? 'Back to More' : 'Back to ' + moreJourneyBackLabel(previous)}
        </button>
      </div>
    </nav>
  );
}
export function MoreNavigationTrail() {
  return <Suspense fallback={null}><JourneyContent /></Suspense>;
}
