'use client';

import { errorToast } from '@/lib/user-notices';
import { SectionSkeleton } from '@/components/loading-states';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { AccountEmailSettings } from '@/components/account-email-settings';
import { DeleteAccountSection } from '@/components/delete-account-section';
import { DefaultDeliveryAddress } from '@/components/default-delivery-address';
import { useAccountData, useAccountRole, useAuth, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { UserRound, ShoppingBag, PackageCheck, Clock3, Store, LogOut, Mail, Pencil, ShieldCheck, ArrowUpRight, Heart, Bell, ChevronRight, MapPin, Package, Settings, LifeBuoy } from 'lucide-react';

const quickLinks = [
  { href: '/account/settings', label: 'Account settings', description: 'Manage your account preferences', icon: Settings },
  { href: '/account/personal', label: 'Personal information', description: 'Name and email details', icon: UserRound },
  { href: '/account/delivery', label: 'Delivery addresses', description: 'Saved addresses and delivery preferences', icon: MapPin },
  { href: '/notifications', label: 'Notifications', description: 'Updates about your activity', icon: Bell },
  { href: '/account/privacy', label: 'Privacy & security', description: 'Manage your data and account', icon: Settings },
];

export default function AccountPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { buyerOrders: orders, buyerOrdersLoading, buyerOrdersError } = useAccountData();
  const { seller } = useAccountRole();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!isUserLoading && !user) router.replace('/login?next=%2Faccount'); }, [user, isUserLoading, router]);
  useEffect(() => { setName(user?.displayName ?? ''); }, [user?.uid, user?.displayName]);
  async function saveName() {
    if (!user || !name.trim() || name.trim().length > 80) return;
    setSaving(true);
    try { await updateProfile(user, { displayName: name.trim() }); setEditing(false); toast({ title: 'Profile updated' }); }
    catch(error) { toast(errorToast(error, 'save-profile')); }
    finally { setSaving(false); }
  }
  const firstName = (user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const sellerExpiry = (seller?.accessEndsAt as { toDate?: () => Date } | null)?.toDate?.();
  const completed = orders?.filter(o => o.status === 'completed').length ?? 0;
  const active = orders?.filter(o => !['completed','cancelled','rejected'].includes(o.status)).length ?? 0;

  return (
    <div className="min-h-screen bg-[#fcfaf6] lg:bg-[#f7f5f1]">
      <Header />
      {/* Compact mobile overview; preserve the original full desktop dashboard at lg+. */}
      <div className="lg:hidden">
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
      <div className="hidden lg:block">
        <main className="section-shell py-5 sm:py-10">
    {!user ? <SectionSkeleton /> : <>
    <div className="mb-5 rounded-2xl bg-[#29251f] px-5 py-6 text-white sm:mb-8 sm:rounded-3xl sm:px-8 sm:py-9"><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d2b58b]">Your personal space</p><h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-5xl">Hello, {firstName}.</h1><p className="mt-3 text-sm text-white/70">Everything you love about TreatStory, all in one place.</p>{seller && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#e8cfa8]">{seller.accessType === 'trial' ? 'Seller trial access' : 'Full seller access'}</span><span className="text-xs text-white/80">Valid until {sellerExpiry ? sellerExpiry.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'date not set'} · {seller.status}</span><Link href="/seller/dashboard" className="rounded-full border border-white/40 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10">Seller studio</Link></div>}</div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      <aside className="min-w-0 space-y-3 lg:space-y-5"><div className="rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-7"><div className="flex h-12 w-12 items-center justify-center rounded-full sm:h-16 sm:w-16 bg-[#efe7db] text-2xl font-medium text-[#846b49]">{(user.displayName || user.email || 'T').charAt(0).toUpperCase()}</div><h2 className="mt-3 text-lg font-semibold sm:mt-5 sm:text-xl">{user.displayName || 'TreatStory member'}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><span className="mt-4 inline-flex rounded-full bg-[#f5f0e8] px-3 py-1 text-[11px] font-medium capitalize text-[#846b49]">Member</span><div className="mt-4 border-t pt-3 sm:mt-6 sm:pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Your account is protected</p></div></div>
      <nav aria-label="Account navigation" className="grid grid-cols-2 gap-2 rounded-2xl border border-[#e8e0d5] bg-white p-2 sm:grid-cols-4 lg:grid-cols-1 lg:rounded-3xl lg:p-4"><a href="#profile-details" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><UserRound className="h-4 w-4 shrink-0" />My profile</a><a href="#delivery-address" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><Store className="h-4 w-4 shrink-0" />Delivery details</a><a href="#delete-account" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#fff7f5] p-3 text-xs font-medium text-red-700 transition hover:bg-red-50 sm:text-sm lg:bg-transparent"><ShieldCheck className="h-4 w-4 shrink-0" />Privacy settings</a><Link href="/favorites" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><Heart className="h-4 w-4 shrink-0" />Wishlist <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/orders" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><ShoppingBag className="h-4 w-4" />My orders <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/cart" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><PackageCheck className="h-4 w-4" />Shopping bag <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/products" className="flex items-center gap-3 rounded-xl p-3 text-sm hover:bg-[#f7f5f1]"><Store className="h-4 w-4" />Explore creators <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/support" className="flex min-h-12 items-center gap-3 rounded-xl p-3 text-sm font-medium text-[#685541] transition hover:bg-[#f7f5f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a58a68]"><LifeBuoy className="h-4 w-4 shrink-0 text-[#a68a64]" />Help &amp; Support <ArrowUpRight className="ml-auto h-4 w-4" /></Link><button onClick={async () => { try {if (auth) await firebaseSignOut(auth); router.replace('/');}catch(error){toast(errorToast(error,'sign-out'));} }} className="flex min-h-12 min-w-0 w-full items-center gap-2 rounded-xl bg-[#fff7f5] p-3 text-left text-xs text-red-700 hover:bg-red-50 sm:text-sm lg:bg-transparent"><LogOut className="h-4 w-4" />Sign out</button></nav></aside>
      <div className="min-w-0 space-y-4 sm:space-y-6"><div className="grid grid-cols-3 gap-2 sm:gap-4">{[{ label: 'Recent orders', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : orders?.length ?? 0, icon: ShoppingBag }, { label: 'Active · recent', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : active, icon: Clock3 }, { label: 'Completed · recent', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : completed, icon: PackageCheck }].map(metric => <div key={metric.label} className="min-w-0 rounded-2xl border border-[#e8e0d5] bg-white p-3 shadow-sm shadow-[#29251f]/[0.03] sm:p-5"><metric.icon className="h-5 w-5 text-[#a68a64]" /><p className="mt-3 text-2xl font-semibold tracking-tight sm:mt-5 sm:text-3xl">{metric.value}</p><p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">{metric.label}</p></div>)}</div>
      <section className="rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Your recent activity</p><h2 className="mt-1 text-lg font-medium">Recent orders</h2></div><Link href="/orders" className="text-xs font-medium text-[#846b49] underline-offset-4 hover:underline">All orders</Link></div>
        {buyerOrdersLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading recent orders…</p> : buyerOrdersError ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>{'code' in buyerOrdersError && buyerOrdersError.code === 'failed-precondition' ? 'Order history is temporarily unavailable. Please try again later.' : 'We couldn’t load your recent orders. Please try again.'}</p><button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-9 rounded-full border border-amber-300 bg-white px-4 text-xs font-semibold hover:bg-amber-100">Retry orders</button></div> : !orders?.length ? <p className="mt-4 text-sm text-muted-foreground">You haven’t placed a creator order yet.</p> : <div className="mt-4 divide-y divide-[#f0ebe5]">
          {orders.slice(0, 3).map(order => <Link href="/orders" key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[#846b49]"><div className="min-w-0"><p className="truncate font-medium">{order.productName}</p><p className="mt-1 text-xs text-muted-foreground">#{order.orderReference||order.id.slice(0,8)} · {order.status.replaceAll('-', ' ')}</p></div><div className="shrink-0 text-right"><p className="font-semibold">₹{order.subtotal.toLocaleString('en-IN')}</p><ArrowUpRight className="ml-auto mt-1 h-3.5 w-3.5 text-[#a68a64]" /></div></Link>)}
        </div>}
      </section>
      <section id="profile-details" className="scroll-mt-24 rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-8"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Account details</p><h2 className="mt-2 text-xl font-medium">Your profile</h2></div><UserRound className="h-6 w-6 text-[#a68a64]" /></div><div className="mt-7 space-y-5"><div><p className="text-xs text-muted-foreground">Display name</p>{editing ? <div className="mt-2 flex flex-wrap gap-2"><Input className="min-w-[140px] flex-1" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><Button disabled={saving || !name.trim()} onClick={saveName}>Save</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div> : <div className="mt-2 flex items-center justify-between gap-2"><p className="font-medium">{user.displayName || 'Not set'}</p><Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button></div>}</div><div className="border-t pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-4 w-4" />Email address</p><p className="mt-2 break-all font-medium">{user.email}</p><AccountEmailSettings user={user}/></div><div className="mt-5 border-t pt-5"><Button type="button" variant="outline" onClick={async () => { if (!auth) return; try { await firebaseSignOut(auth); router.replace('/'); } catch(error) {toast(errorToast(error,'sign-out'));} }} className="h-11 rounded-full border-red-200 text-red-700"><LogOut className="mr-2 h-4 w-4"/>Sign out of TreatStory</Button></div></div></section>
      <div id="delivery-address" className="scroll-mt-24"><DefaultDeliveryAddress /></div>
      <DeleteAccountSection user={user} auth={auth} isSeller={!!seller} />
      <section className="rounded-2xl border border-[#e8e0d5] bg-[#eee6da] p-5 sm:rounded-3xl sm:p-7"><p className="text-[10px] font-semibold uppercase tracking-widest text-[#846b49]">Handmade stories await</p><h2 className="mt-3 text-2xl font-medium">Discover something personal.</h2><p className="mt-2 max-w-lg text-sm text-muted-foreground">Shop thoughtful bakes, art and handmade creations from independent sellers.</p><Link href="/products" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Explore TreatStory <ArrowUpRight className="h-4 w-4" /></Link></section>
      </div>
    </div></>}
  </main>
      </div>
    </div>
  );
}
