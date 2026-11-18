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
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map(({ label, query, Icon, color }) => <Link key={label} href={`/products?q=${encodeURIComponent(query)}`} className="group flex w-[69px] shrink-0 snap-start flex-col items-center gap-2.5 text-center">
        <span className={`flex h-[68px] w-[68px] items-center justify-center rounded-full border border-[#ebddd0] ${color} transition-transform group-active:scale-95`}><Icon aria-hidden="true" className="h-8 w-8 stroke-[1.5] text-[#9a5a34]"/></span>
        <span className="text-[11px] font-medium text-[#42382f]">{label}</span>
      </Link>)}
    </div>
  </section>;
}
