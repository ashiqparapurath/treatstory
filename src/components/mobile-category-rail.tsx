import Link from 'next/link';
import { ArrowRight, CakeSlice, Cookie, Gift, Palette, Croissant } from 'lucide-react';

/** Browse suggestions, not hard-coded inventory or claimed availability. */
const categories = [
  { label: 'Cakes', query: 'cake', Icon: CakeSlice, color: 'bg-[#f7e8dc]' },
  { label: 'Cookies', query: 'cookie', Icon: Cookie, color: 'bg-[#f4e9de]' },
  { label: 'Breads', query: 'bread', Icon: Croissant, color: 'bg-[#f2e7d6]' },
  { label: 'Handmade', query: 'handmade', Icon: Gift, color: 'bg-[#f6ebe6]' },
  { label: 'Art', query: 'art', Icon: Palette, color: 'bg-[#f0e8e0]' },
];

export function MobileCategoryRail() {
  return <section aria-labelledby="mobile-categories-heading" className="md:hidden">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="mobile-categories-heading" className="text-[19px] font-semibold tracking-tight text-[#30251c]">Categories</h2>
      <Link href="/products" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-[#874a28]">See all <ArrowRight className="h-3.5 w-3.5"/></Link>
    </div>
    <div className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map(({ label, query, Icon, color }) => <Link key={label} href={`/products?q=${encodeURIComponent(query)}`} className="group flex w-[73px] shrink-0 snap-start flex-col items-center gap-2 text-center outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[#895335]">
        <span className={`relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-white shadow-[0_4px_14px_rgba(70,42,20,0.10)] ring-1 ring-[#efdfd0] ${color} transition-transform group-active:scale-95`}><Icon aria-hidden="true" className="h-[29px] w-[29px] stroke-[1.55] text-[#89502c]"/></span>
        <span className="text-[11px] font-semibold leading-4 text-[#46372d]">{label}</span>
      </Link>)}
    </div>
  </section>;
}
