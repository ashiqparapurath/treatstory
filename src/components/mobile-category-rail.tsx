import Link from 'next/link';
import type { SVGProps } from 'react';
import { ArrowRight, Cake, Wheat, HandHeart, Paintbrush } from 'lucide-react';

/** Two hand-drawn biscuits, distinct from the standard single bitten-cookie icon. */
function CookiesIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18.4 7.6a9.5 9.5 0 1 0-11 14.1" />
    <path d="M6.2 9.5c1.1.3 2.1.1 2.9-.6.7-.7 1-1.5 1-2.5M15 4.2c-.3 1.6.4 2.7 2.2 3.1" />
    <circle cx="20.5" cy="20.1" r="8.4" />
    <path d="M17.6 16.9h.1M23 16.4h.1M21.8 22.5h.1M16.8 22h.1M24.4 25h.1M8.7 14.2h.1M13.5 10.5h.1" strokeWidth="2.8" />
  </svg>;
}

/** Browse suggestions, not hard-coded inventory or claimed availability. */
const categories = [
  { label: 'Cakes', query: 'cake', Icon: Cake, color: 'bg-[#f7e8dc]' },
  { label: 'Cookies', query: 'cookie', Icon: CookiesIcon, color: 'bg-[#f4e9de]' },
  { label: 'Breads', query: 'bread', Icon: Wheat, color: 'bg-[#f2e7d6]' },
  { label: 'Handmade', query: 'handmade', Icon: HandHeart, color: 'bg-[#f6ebe6]' },
  { label: 'Art', query: 'art', Icon: Paintbrush, color: 'bg-[#f0e8e0]' },
];

export function MobileCategoryRail() {
  return <section aria-labelledby="mobile-categories-heading" className="md:hidden">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="mobile-categories-heading" className="text-[19px] font-semibold tracking-tight text-[#30251c]">Categories</h2>
      <Link href="/products" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-[#874a28]">See all <ArrowRight className="h-3.5 w-3.5"/></Link>
    </div>
    <div className="flex w-full snap-x snap-mandatory gap-3.5 overflow-x-auto pt-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map(({ label, query, Icon, color }) => <Link key={label} href={`/products?q=${encodeURIComponent(query)}`} className="group flex w-[73px] shrink-0 snap-start flex-col items-center gap-2 text-center outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[#895335]">
        <span className={`relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-white shadow-[0_4px_14px_rgba(70,42,20,0.10)] ring-1 ring-[#efdfd0] ${color} transition-transform group-active:scale-95`}><Icon aria-hidden="true" className="h-[29px] w-[29px] stroke-[1.7] text-[#89502c]"/></span>
        <span className="text-[11px] font-semibold leading-4 text-[#46372d]">{label}</span>
      </Link>)}
    </div>
  </section>;
}
