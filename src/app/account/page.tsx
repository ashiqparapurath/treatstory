'use client';
import { SectionSkeleton } from '@/components/loading-states';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { DefaultDeliveryAddress } from '@/components/default-delivery-address';
import { useAccountData, useAccountRole, useAuth, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { UserRound, ShoppingBag, PackageCheck, Clock3, Store, LogOut, Mail, Pencil, ShieldCheck, ArrowUpRight } from 'lucide-react';

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
  useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [user, isUserLoading, router]);
  useEffect(() => { setName(user?.displayName ?? ''); }, [user]);
  async function saveName() {
    if (!user || !name.trim() || name.trim().length > 80) return;
    setSaving(true);
    try { await updateProfile(user, { displayName: name.trim() }); setEditing(false); toast({ title: 'Profile updated' }); }
    catch { toast({ variant: 'destructive', title: 'Could not update profile' }); }
    finally { setSaving(false); }
  }
  const firstName = (user?.displayName || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const sellerExpiry = (seller?.accessEndsAt as { toDate?: () => Date } | null)?.toDate?.();
  const completed = orders?.filter(o => o.status === 'completed').length ?? 0;
  const active = orders?.filter(o => !['completed','cancelled','rejected'].includes(o.status)).length ?? 0;
  return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell py-5 sm:py-10">
    {!user ? <SectionSkeleton /> : <>
    <div className="mb-5 rounded-2xl bg-[#29251f] px-5 py-6 text-white sm:mb-8 sm:rounded-3xl sm:px-8 sm:py-9"><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d2b58b]">Your personal space</p><h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-5xl">Hello, {firstName}.</h1><p className="mt-3 text-sm text-white/70">Everything you love about TreatStory, all in one place.</p>{seller && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#e8cfa8]">{seller.accessType === 'trial' ? 'Seller trial access' : 'Full seller access'}</span><span className="text-xs text-white/80">Valid until {sellerExpiry ? sellerExpiry.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'date not set'} · {seller.status}</span><Link href="/seller/dashboard" className="rounded-full border border-white/40 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10">Seller studio</Link></div>}</div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      <aside className="min-w-0 space-y-3 lg:space-y-5"><div className="rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-7"><div className="flex h-12 w-12 items-center justify-center rounded-full sm:h-16 sm:w-16 bg-[#efe7db] text-2xl font-medium text-[#846b49]">{(user.displayName || user.email || 'T').charAt(0).toUpperCase()}</div><h2 className="mt-3 text-lg font-semibold sm:mt-5 sm:text-xl">{user.displayName || 'TreatStory member'}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><span className="mt-4 inline-flex rounded-full bg-[#f5f0e8] px-3 py-1 text-[11px] font-medium capitalize text-[#846b49]">Member</span><div className="mt-4 border-t pt-3 sm:mt-6 sm:pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Account secured with Firebase Authentication</p></div></div>
      <nav aria-label="Account navigation" className="grid grid-cols-2 gap-2 rounded-2xl border border-[#e8e0d5] bg-white p-2 sm:grid-cols-4 lg:grid-cols-1 lg:rounded-3xl lg:p-4"><a href="#profile-details" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><UserRound className="h-4 w-4 shrink-0" />My profile</a><a href="#delivery-address" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><Store className="h-4 w-4 shrink-0" />Delivery details</a><Link href="/orders" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium transition hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><ShoppingBag className="h-4 w-4" />My orders <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/cart" className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl bg-[#f7f5f1] p-3 text-xs font-medium hover:bg-[#eee6da] sm:text-sm lg:bg-transparent"><PackageCheck className="h-4 w-4" />Shopping bag <ArrowUpRight className="ml-auto h-4 w-4" /></Link><Link href="/products" className="flex items-center gap-3 rounded-xl p-3 text-sm hover:bg-[#f7f5f1]"><Store className="h-4 w-4" />Explore creators <ArrowUpRight className="ml-auto h-4 w-4" /></Link><button onClick={async () => { if (auth) await firebaseSignOut(auth); router.replace('/'); }} className="flex min-h-12 min-w-0 w-full items-center gap-2 rounded-xl bg-[#fff7f5] p-3 text-left text-xs text-red-700 hover:bg-red-50 sm:text-sm lg:bg-transparent"><LogOut className="h-4 w-4" />Sign out</button></nav></aside>
      <div className="min-w-0 space-y-4 sm:space-y-6"><div className="grid grid-cols-3 gap-2 sm:gap-4">{[{ label: 'Recent orders', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : orders?.length ?? 0, icon: ShoppingBag }, { label: 'Active · recent', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : active, icon: Clock3 }, { label: 'Completed · recent', value: buyerOrdersError ? '—' : buyerOrdersLoading ? '…' : completed, icon: PackageCheck }].map(metric => <div key={metric.label} className="min-w-0 rounded-2xl border border-[#e8e0d5] bg-white p-3 shadow-sm shadow-[#29251f]/[0.03] sm:p-5"><metric.icon className="h-5 w-5 text-[#a68a64]" /><p className="mt-3 text-2xl font-semibold tracking-tight sm:mt-5 sm:text-3xl">{metric.value}</p><p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">{metric.label}</p></div>)}</div>
      <section className="rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Your recent activity</p><h2 className="mt-1 text-lg font-medium">Recent orders</h2></div><Link href="/orders" className="text-xs font-medium text-[#846b49] underline-offset-4 hover:underline">All orders</Link></div>
        {buyerOrdersLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading recent orders…</p> : buyerOrdersError ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>{'code' in buyerOrdersError && buyerOrdersError.code === 'failed-precondition' ? 'Order history is temporarily unavailable while the database index is being prepared.' : 'We couldn’t load your recent orders. Please try again.'}</p><button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-9 rounded-full border border-amber-300 bg-white px-4 text-xs font-semibold hover:bg-amber-100">Retry orders</button></div> : !orders?.length ? <p className="mt-4 text-sm text-muted-foreground">You haven’t placed a creator order yet.</p> : <div className="mt-4 divide-y divide-[#f0ebe5]">
          {orders.slice(0, 3).map(order => <Link href="/orders" key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[#846b49]"><div className="min-w-0"><p className="truncate font-medium">{order.productName}</p><p className="mt-1 text-xs text-muted-foreground">#{order.id.slice(0,8)} · {order.status.replaceAll('-', ' ')}</p></div><div className="shrink-0 text-right"><p className="font-semibold">₹{order.subtotal.toLocaleString('en-IN')}</p><ArrowUpRight className="ml-auto mt-1 h-3.5 w-3.5 text-[#a68a64]" /></div></Link>)}
        </div>}
      </section>
      <section id="profile-details" className="scroll-mt-24 rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-8"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Account details</p><h2 className="mt-2 text-xl font-medium">Your profile</h2></div><UserRound className="h-6 w-6 text-[#a68a64]" /></div><div className="mt-7 space-y-5"><div><p className="text-xs text-muted-foreground">Display name</p>{editing ? <div className="mt-2 flex flex-wrap gap-2"><Input className="min-w-[140px] flex-1" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><Button disabled={saving || !name.trim()} onClick={saveName}>Save</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div> : <div className="mt-2 flex items-center justify-between gap-2"><p className="font-medium">{user.displayName || 'Not set'}</p><Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button></div>}</div><div className="border-t pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-4 w-4" />Email address</p><p className="mt-2 break-all font-medium">{user.email}</p></div><div className="mt-5 border-t pt-5"><Button type="button" variant="outline" onClick={async () => { if (!auth) return; try { await firebaseSignOut(auth); router.replace('/'); } catch { toast({variant:'destructive',title:'Could not sign out',description:'Please try again.'}); } }} className="h-11 rounded-full border-red-200 text-red-700"><LogOut className="mr-2 h-4 w-4"/>Sign out of TreatStory</Button></div></div></section>
      <div id="delivery-address" className="scroll-mt-24"><DefaultDeliveryAddress /></div>
      <section className="rounded-2xl border border-[#e8e0d5] bg-[#eee6da] p-5 sm:rounded-3xl sm:p-7"><p className="text-[10px] font-semibold uppercase tracking-widest text-[#846b49]">Handmade stories await</p><h2 className="mt-3 text-2xl font-medium">Discover something personal.</h2><p className="mt-2 max-w-lg text-sm text-muted-foreground">Shop thoughtful bakes, art and handmade creations from independent sellers.</p><Link href="/products" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Explore TreatStory <ArrowUpRight className="h-4 w-4" /></Link></section>
      </div>
    </div></>}
  </main></div>;
}
