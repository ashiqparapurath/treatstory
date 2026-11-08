'use client';

import Link from 'next/link';
import { ShoppingBag, ArrowUpRight, UserRound, Bell, Home, Search, Store } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/firebase';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop all' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/about', label: 'Our story' },
];

export function Header() {
  const { cartCount } = useCart();
  const { user } = useUser();
  const pathname = usePathname();

  return (
    <>

      <header className="sticky top-0 z-40 border-b border-[#e9e2d8] bg-[#fcfaf6]/95 shadow-[0_3px_18px_rgba(48,36,22,0.035)] backdrop-blur-xl">
        <div className="section-shell">
          <div className="grid h-[64px] grid-cols-[1fr_auto_1fr] items-center md:h-[72px]">
            <div className="flex items-center justify-start">
              <Link href="/become-a-seller" className="hidden items-center gap-2 rounded-full border border-[#d7c8b4] bg-white px-4 py-2.5 text-[11px] font-semibold tracking-[0.04em] text-[#44372a] transition-colors hover:bg-[#eee7dc] md:inline-flex">
                Become a seller <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <Link href="/" aria-label="TreatStory home" className="brand-wordmark justify-self-center whitespace-nowrap text-[28px] leading-none text-foreground sm:text-[33px] md:text-[36px]">
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
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 rounded-t-3xl border border-white/70 bg-[#fcfaf6]/95 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_4px_30px_rgba(35,29,23,0.18)] backdrop-blur-xl md:hidden">
        {[{href:'/',label:'Home',icon:Home},{href:'/products',label:'Shop',icon:Search},{href:'/cart',label:cartCount ? `Cart (${cartCount})` : 'Cart',icon:ShoppingBag},{href:user ? '/account' : '/login',label:'Profile',icon:UserRound},{href:'/become-a-seller',label:'Sell',icon:Store}].map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] ${pathname === item.href ? 'bg-[#ece3d6] font-semibold text-[#59452b]' : 'text-[#756b60]'}`}><item.icon className="h-5 w-5"/><span className="truncate">{item.label}</span></Link>)}
      </nav>
    </>
  );
}
