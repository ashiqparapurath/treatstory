'use client';

import Link from 'next/link';
import { Menu, ShoppingBag, ArrowUpRight, UserRound, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useUser, useAuth } from '@/firebase';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop all' },
  { href: '/favorites', label: 'Favourites' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/about', label: 'Our story' },
];

export function Header() {
  const { cartCount } = useCart();
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  async function handleSignOut() {
    if (!auth || signingOut) return;
    setSigningOut(true);
    try {
      await firebaseSignOut(auth);
      setIsMobileMenuOpen(false);
      router.replace('/');
    } catch {
      toast({ variant: 'destructive', title: 'Unable to sign out', description: 'Please try again.' });
    } finally {
      setSigningOut(false);
    }
  }
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>

      <header className="sticky top-0 z-40 border-b border-[#e9e2d8] bg-[#fcfaf6]/95 shadow-[0_3px_18px_rgba(48,36,22,0.035)] backdrop-blur-xl">
        <div className="section-shell">
          <div className="grid h-[64px] grid-cols-[1fr_auto_1fr] items-center md:h-[72px]">
            <div className="flex items-center justify-start">
              <div className="md:hidden">
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Open navigation" className="-ml-2 h-10 w-10 rounded-full">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[min(86vw,360px)] overflow-y-auto border-r-0 bg-[#faf8f3] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                    <SheetHeader className="border-b border-[#e9e2d8] pb-6 text-left">
                      <SheetTitle>
                        <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="brand-wordmark text-3xl text-foreground">TreatStory</Link>
                      </SheetTitle>
                      <p className="eyebrow pt-2 text-muted-foreground">A little something for every story</p>
                    </SheetHeader>
                    <nav className="mt-8 flex flex-col">
                      {navItems.map((item, index) => (
                        <SheetClose asChild key={item.href}>
                          <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="flex items-center justify-between border-b border-[#e9e2d8] py-5 text-lg font-medium tracking-tight">
                            <span><span className="mr-4 text-xs text-[#b59a73]">0{index + 1}</span>{item.label}</span>
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </SheetClose>
                      ))}
                    </nav>
                    <Link href="/become-a-seller" onClick={() => setIsMobileMenuOpen(false)} className="mt-5 flex min-h-12 items-center justify-between rounded-xl bg-[#29251f] px-4 text-sm font-semibold text-white">Become a seller <ArrowUpRight className="h-4 w-4" /></Link>
                    {user && <div className="mt-6 border-t border-[#e9e2d8] pt-4">
                      <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-[#eee7dc]"><UserRound className="h-4 w-4" />My account</Link>
                      <button type="button" onClick={handleSignOut} disabled={signingOut} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><LogOut className="h-4 w-4" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
                    </div>}
                    <div className="mt-6 rounded-2xl bg-[#eee7dc] p-5">
                      <p className="eyebrow text-muted-foreground">The TreatStory edit</p>
                      <p className="mt-2 text-sm leading-relaxed">Discover pieces that make the everyday feel a little more special.</p>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              <Link href="/become-a-seller" className="hidden items-center gap-2 rounded-full border border-[#d7c8b4] bg-white px-4 py-2.5 text-[11px] font-semibold tracking-[0.04em] text-[#44372a] transition-colors hover:bg-[#eee7dc] md:inline-flex">
                Become a seller <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <Link href="/" aria-label="TreatStory home" className="brand-wordmark justify-self-center whitespace-nowrap text-[28px] leading-none text-foreground sm:text-[33px] md:text-[36px]">
              TreatStory
            </Link>

            <div className="flex items-center justify-end gap-0.5 sm:gap-2">
              <nav className="hidden items-center gap-5 xl:gap-7 lg:flex">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.10em] text-[#72685d] transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ))}
              </nav>
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
    </>
  );
}
