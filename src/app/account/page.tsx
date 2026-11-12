'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Bell, ChevronRight, Clock3, Heart, MapPin, Package, Settings, ShoppingBag, Store, UserRound } from 'lucide-react';
import { useAccountData, useAccountRole, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { SectionSkeleton } from '@/components/loading-states';

const quickLinks = [
  { href: '/account/settings', label: 'Account settings', description: 'Manage your account preferences', icon: Settings },
  { href: '/account/personal', label: 'Personal information', description: 'Name and email details', icon: UserRound },
  { href: '/account/delivery', label: 'Delivery addresses', description: 'Saved addresses and delivery preferences', icon: MapPin },
  { href: '/notifications', label: 'Notifications', description: 'Updates about your activity', icon: Bell },
  { href: '/account/privacy', label: 'Privacy & security', description: 'Manage your data and account', icon: Settings },
];

export default function AccountPage() {
  const { user, isUserLoading } = useUser();
  const { seller } = useAccountRole();
  const { buyerOrders: orders, buyerOrdersLoading, buyerOrdersError } = useAccountData();
  const router = useRouter();
  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login?next=%2Faccount');
  }, [user, isUserLoading, router]);
  const firstName = (user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const active = orders?.filter(order => !['completed','cancelled','rejected'].includes(order.status)).length ?? 0;
  const sellerExpiry = (seller?.accessEndsAt as { toDate?: () => Date } | null)?.toDate?.();

  return (
    <div className="min-h-screen bg-[#fcfaf6] text-[#312a21]">
      <Header />
      <main className="section-shell mx-auto max-w-5xl pb-32 pt-7 sm:pt-12">
        {isUserLoading || !user ? <SectionSkeleton /> : <>
          <header className="border-b border-[#e9e1d5] pb-8 sm:pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a58a68]">Your personal space</p>
            <h1 className="mt-3 break-words text-[clamp(2rem,7vw,3.4rem)] font-medium leading-tight tracking-[-0.04em]">Hello, {firstName}.</h1>
            <p className="mt-3 text-sm leading-7 text-[#766b5d]">Your recent activity and the places you return to most.</p>
            <div className="mt-6 flex min-w-0 items-center gap-3">
              <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eee4d6] text-xl font-medium text-[#8a6c45]">{(user.displayName || user.email || 'T').charAt(0).toUpperCase()}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.displayName || 'TreatStory member'}</p>
                <p className="truncate text-xs text-[#817568]">{user.email}</p>
              </div>
              <Link href="/account/personal" aria-label="Edit personal information" className="ml-auto inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-[#796044] underline underline-offset-4">Edit</Link>
            </div>
            {seller && <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-full bg-[#f1e8d9] px-3 py-2 font-medium text-[#816341]">{seller.accessType==='trial'?'Seller trial':'Seller'}</span>
              <span className="text-[#766b5d]">{sellerExpiry ? 'Access until ' + sellerExpiry.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Your seller account is active'}</span>
              <Link href="/seller/dashboard" className="inline-flex min-h-10 items-center gap-1 font-semibold text-[#7a6043]">Seller dashboard <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>}
          </header>

          <section aria-labelledby="recent-activity-title" className="mt-9 sm:mt-12">
            <div className="flex items-center justify-between gap-3">
              <h2 id="recent-activity-title" className="text-xl font-medium tracking-tight sm:text-2xl">Your activity</h2>
              <Link href="/orders" className="inline-flex min-h-10 items-center text-xs font-semibold text-[#80674b] underline underline-offset-4">View orders</Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
              <Link href="/orders" className="rounded-2xl bg-[#f1ebe3] p-5 transition hover:bg-[#ebe1d6] sm:p-6">
                <Clock3 className="h-5 w-5 text-[#997d59]" aria-hidden="true" />
                <p className="mt-3 text-3xl font-semibold tabular-nums">{buyerOrdersError?'—':buyerOrdersLoading?'…':active}</p>
                <p className="mt-1 text-xs text-[#746759]">Active recent orders</p>
              </Link>
              <Link href="/orders" className="rounded-2xl bg-[#f1ebe3] p-5 transition hover:bg-[#ebe1d6] sm:p-6">
                <ShoppingBag className="h-5 w-5 text-[#997d59]" aria-hidden="true" />
                <p className="mt-3 text-3xl font-semibold tabular-nums">{buyerOrdersError?'—':buyerOrdersLoading?'…':orders?.length??0}</p>
                <p className="mt-1 text-xs text-[#746759]">Recent purchases</p>
              </Link>
            </div>
            {buyerOrdersError ? <p role="alert" className="mt-5 text-sm text-[#9b5548]">Recent orders couldn’t be loaded. Open Orders to try again.</p> :
              buyerOrdersLoading ? <p role="status" className="mt-5 text-sm text-[#807365]">Loading recent activity…</p> :
              orders?.length ? <div className="mt-5 divide-y divide-[#ebe4dc]">
                {orders.slice(0,3).map(order => <Link href="/orders" key={order.id} className="flex items-center gap-3 py-4 transition hover:bg-[#f6f0e8]">
                  <Package className="h-5 w-5 shrink-0 text-[#a58a68]" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{order.productName}</span><span className="mt-1 block text-xs capitalize text-[#817568]">{order.status.replaceAll('-', ' ')} · #{order.orderReference || order.id.slice(0,8)}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#a58a68]" aria-hidden="true" />
                </Link>)}
              </div> : <p className="mt-5 text-sm leading-6 text-[#807365]">Your first order will appear here once you start shopping.</p>}
          </section>

          <section aria-labelledby="account-shortcuts-title" className="mt-11 sm:mt-14">
            <h2 id="account-shortcuts-title" className="text-xl font-medium tracking-tight sm:text-2xl">Manage your account</h2>
            <nav aria-label="Account shortcuts" className="mt-4 divide-y divide-[#eae2d7]">
              {quickLinks.map(item => <Link key={item.href} href={item.href} className="group flex min-h-[69px] items-center gap-3 py-3 transition hover:bg-[#f6f0e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a58a68] sm:px-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#efe7dc] text-[#866b4a]"><item.icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-[#86796a]">{item.description}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#aa9a88] transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>)}
            </nav>
          </section>

          <div className="mt-11 flex flex-wrap gap-4 border-t border-[#eae2d7] pt-7 text-sm">
            <Link href="/favorites" className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#795f43]"><Heart className="h-4 w-4" /> Saved items</Link>
            <Link href="/products" className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#795f43]"><Store className="h-4 w-4" /> Discover creators</Link>
          </div>
        </>}
      </main>
    </div>
  );
}
