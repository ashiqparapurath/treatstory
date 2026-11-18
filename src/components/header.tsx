'use client';

import Link from 'next/link';
import { ShoppingBag, ArrowUpRight, UserRound, Bell, Home, Search, Menu, LoaderCircle, MapPin, SlidersHorizontal, Heart } from 'lucide-react';
import { mobileProfileHref, isMobileProfilePath, mobileNavIsActive } from '@/lib/mobile-navigation';
import { useMobileAttention } from '@/hooks/use-mobile-attention';
import { MoreNavigationTrail } from '@/components/more-navigation-trail';
import { clearMoreJourney } from '@/lib/more-journey';
import { useCart } from '@/context/cart-context';
import { Badge } from '@/components/ui/badge';
import { useAccountRole, useUser } from '@/firebase';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop all' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/about', label: 'Our story' },
];

export function Header() {
  const { cartCount } = useCart();
  const { user, isUserLoading } = useUser();
  const pathname = usePathname();
  const { role, isRoleLoading, roleError } = useAccountRole();
  // Use the same authoritative live role result as the dashboard router.
  // Never assume customer access while role resolution is pending or failed.
  const profileHref = mobileProfileHref({
    authenticated: !!user, authLoading: isUserLoading, role,
    roleLoading: isRoleLoading, roleError: !!roleError,
  });
  const pendingRole = !!user && isRoleLoading && !roleError;
  const attention = useMobileAttention(user?.uid ?? null, role, !isRoleLoading && !roleError);
  const actionPending = attention.orders || attention.applications;
  const isProductDetail = pathname.startsWith('/product/');
  const isHome = pathname === '/';

  return (
    <>

      {!isProductDetail && <header className={`${isHome ? 'relative z-30 overflow-hidden rounded-b-[28px] bg-[#754328] text-white shadow-[0_12px_28px_rgba(69,37,21,0.16)]' : 'sticky top-0 z-40 border-b border-[#eee5dc] bg-[#fffcf8]/95 text-[#30251c] backdrop-blur-xl'} md:hidden`}>
        {isHome ? <div className="section-shell relative pb-6 pt-4">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-56 w-56 rounded-full border-[32px] border-white/[0.045]" />
          <div className="relative flex min-h-[60px] items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href="/" aria-label="TreatStory home" onClick={clearMoreJourney} className="brand-wordmark block w-fit max-w-full truncate text-[30px] leading-none text-white">TreatStory</Link>
              <span className="mt-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.035em] text-white/80"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Made with care in Kerala</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/cart" aria-label={`Shopping bag, ${cartCount} items`} className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><ShoppingBag className="h-5 w-5"/>{cartCount>0&&<span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#faf7f1] px-1 text-[10px] font-bold text-[#784225]">{cartCount}</span>}</Link>
              <Link href={user ? '/notifications' : '/login'} aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Bell className="h-5 w-5"/>{actionPending&&<span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-white"/>}</Link>
            </div>
          </div>
          <form action="/products" method="get" role="search" className="relative mt-5 flex items-center gap-2.5">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9d816b]"/><input type="search" name="q" aria-label="Search TreatStory products" placeholder="Search cakes, gifts, crafts..." className="h-[52px] w-full rounded-2xl border border-white/70 bg-[#fffefa] pl-11 pr-3 text-[16px] text-[#30251c] shadow-[0_4px_14px_rgba(36,23,15,0.1)] outline-none placeholder:text-[#99887a] focus-visible:ring-2 focus-visible:ring-[#ecc9ae]"/></div>
            <button type="submit" className="sr-only">Search products</button><Link href="/products" aria-label="Browse products and category filters" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border border-white/65 bg-[#fffefa] text-[#754328] shadow-[0_4px_14px_rgba(36,23,15,0.1)] transition-colors hover:bg-[#f3e8dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><SlidersHorizontal className="h-5 w-5"/></Link>
          </form>
        </div> : <div className="section-shell flex h-[64px] items-center justify-between gap-2">
          <Link href="/" onClick={clearMoreJourney} aria-label="TreatStory home" className="brand-wordmark min-w-0 truncate text-[29px] leading-none">TreatStory</Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/products" aria-label="Search products" className="flex h-11 w-11 items-center justify-center rounded-xl"><Search className="h-5 w-5"/></Link>
            <Link href="/cart" aria-label={`Shopping bag, ${cartCount} items`} className="relative flex h-11 w-11 items-center justify-center rounded-xl"><ShoppingBag className="h-5 w-5"/>{cartCount>0&&<span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#874a28] px-1 text-[10px] text-white">{cartCount}</span>}</Link>
            <Link href={user ? '/notifications' : '/login'} aria-label="Notifications" className="flex h-11 w-11 items-center justify-center rounded-xl"><Bell className="h-5 w-5"/></Link>
          </div>
        </div>}
      </header>}

      <header className="hidden md:block sticky top-0 z-40 border-b border-[#e9e2d8] bg-[#fcfaf6]/95 shadow-[0_3px_18px_rgba(48,36,22,0.035)] backdrop-blur-xl">
        <div className="section-shell">
          <div className="grid h-[64px] grid-cols-[1fr_auto_1fr] items-center md:h-[72px]">
            <div className="flex items-center justify-start">
              <Link href="/become-a-seller" className="hidden items-center gap-2 rounded-full border border-[#d7c8b4] bg-white px-4 py-2.5 text-[11px] font-semibold tracking-[0.04em] text-[#44372a] transition-colors hover:bg-[#eee7dc] md:inline-flex">
                Become a seller <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <Link href="/" aria-label="TreatStory home" onClick={clearMoreJourney} className="brand-wordmark justify-self-center whitespace-nowrap text-[28px] leading-none text-foreground sm:text-[33px] md:text-[36px]">
              TreatStory
            </Link>

            <div className="hidden items-center justify-end gap-0.5 sm:gap-2 md:flex">
              <nav className="hidden items-center gap-5 xl:gap-7 lg:flex">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.10em] text-[#72685d] transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ))}
              </nav>
              {user && <Link href="/notifications" aria-label="Notifications" title="Notifications" className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-muted"><Bell className="h-[19px] w-[19px]"/></Link>}
              <Link href={user ? "/dashboard" : "/login"} aria-label={user ? "Open dashboard" : "Sign in"} title={user ? "Open dashboard" : "Sign in"} className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted"><UserRound className="h-[19px] w-[19px]" /></Link>
              <Link href="/cart" aria-label={`Shopping bag, ${cartCount} items`} title="Shopping bag" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted">
                <ShoppingBag className="h-[19px] w-[19px]" />
                {cartCount > 0 && <Badge className="absolute -right-0.5 -top-0.5 h-[19px] min-w-[19px] justify-center rounded-full border-2 border-background bg-[#b28f62] px-1 text-[10px] text-white">{cartCount}</Badge>}
              </Link>
            </div>
          </div>
          <nav className="hidden h-10 items-center justify-center gap-8 border-t border-[#eee8df] lg:hidden md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground">{item.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <MoreNavigationTrail />
      {!isProductDetail && <nav aria-label="Mobile navigation" className="pwa-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 rounded-t-[22px] border-t border-[#eee8e1] bg-[#fffefa]/95 px-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_rgba(43,31,23,0.09)] backdrop-blur-xl md:hidden">
        {[
          { href: '/', label: 'Home', icon: Home, active: pathname === '/' },
          { href: '/products', label: 'Explore', icon: Search, active: mobileNavIsActive(pathname, 'shop') },
          { href: '/favorites', label: 'Wishlist', icon: Heart, active: pathname === '/favorites' },
          { href: '/more', label: 'More', icon: Menu, active: mobileNavIsActive(pathname, 'more') },
          { href: profileHref, label: 'Profile', icon: UserRound, active: isMobileProfilePath(pathname, role) },
        ].map(item => (
          <Link key={item.label} href={item.href}
            onClick={() => { if (item.label !== 'More') clearMoreJourney(); }}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            aria-busy={item.label === 'Profile' && pendingRole ? true : undefined}
            className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9b7a51] ${item.active ? 'font-semibold text-[#754328]' : 'text-[#89817c] hover:bg-[#f8f2ec]'}`}>
            <span className={`relative flex h-7 w-9 items-center justify-center rounded-lg ${item.active?'bg-[#f3e4d8]':''}`}>
              {item.label === 'Profile' && pendingRole ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <item.icon className={`h-[19px] w-[19px] ${item.active?'stroke-[2.25]':''}`} />}
              {(item.label === 'More' || item.label === 'Profile') && actionPending && <span aria-label="Pending activity" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#fcfaf6] bg-[#aa6447]"/>}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>}
    </>
  );
}
