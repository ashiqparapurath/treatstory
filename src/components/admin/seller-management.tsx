'use client';

import { useState } from 'react';
import { collection, doc, serverTimestamp, updateDoc, Timestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { Seller, SellerAccessType } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadError } from '@/components/loading-states';
import { useToast } from '@/hooks/use-toast';
import { CalendarClock, CheckCircle2, ShieldAlert, Store, X } from 'lucide-react';

const dateFrom = (value: unknown) => (value as { toDate?: () => Date } | null)?.toDate?.() ?? null;
const formatDate = (value: unknown) => dateFrom(value)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? 'Not set';
const inputDate = (value: unknown) => {
  const date = dateFrom(value);
  if (!date) return '';
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};

export function SellerManagement() {
  const db = useFirestore();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? collection(db, 'sellers') : null, [db]);
  const { data: sellers, isLoading, error, retry } = useCollection<Seller>(ref);
  const [working, setWorking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [accessType, setAccessType] = useState<SellerAccessType>('trial');
  const [extensionDays, setExtensionDays] = useState('30');

  const visible = (sellers ?? []).filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    [s.businessName, s.contactEmail, s.businessCategory, s.ownerUid, s.status].join(' ').toLowerCase().includes(search.toLowerCase()));
  const selected = (sellers ?? []).find(s => s.id === selectedId);

  function manage(seller: Seller) {
    setSelectedId(seller.id);
    setExpiryDate(inputDate(seller.accessEndsAt));
    setAccessType(seller.accessType);
    setExtensionDays('30');
  }

  async function update(seller: Seller, patch: Record<string, unknown>, description: string) {
    if (!db || working) return;
    if (!window.confirm(`Confirm ${description} for ${seller.businessName}?`)) return;
    setWorking(seller.id);
    try {
      await updateDoc(doc(db, 'sellers', seller.id), { ...patch, updatedAt: serverTimestamp() });
      toast({ title: 'Seller access updated', description });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Could not update seller', description: err instanceof Error ? err.message : 'Check your administrator access and try again.' });
    } finally { setWorking(null); }
  }

  function extend(seller: Seller) {
    const days = Number(extensionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) { toast({ variant: 'destructive', title: 'Enter 1–3650 days' }); return; }
    const from = Math.max(Date.now(), dateFrom(seller.accessEndsAt)?.getTime() ?? 0);
    const ends = Timestamp.fromMillis(from + days * 86400000);
    void update(seller, { accessEndsAt: ends, accessType, status: 'active' }, `extend access by ${days} days (until ${ends.toDate().toLocaleDateString()})`);
  }

  function saveExact(seller: Seller) {
    const date = new Date(`${expiryDate}T23:59:59`);
    if (!expiryDate || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || date.getTime() > Date.now() + 10 * 366 * 86400000) {
      toast({ variant: 'destructive', title: 'Choose an expiry date in the future (within 10 years)' }); return;
    }
    void update(seller, { accessEndsAt: Timestamp.fromDate(date), accessType }, `set ${accessType} access to expire ${date.toLocaleDateString()}`);
  }

  if (error) return <LoadError retry={retry} />;
  return <section className="space-y-5">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Marketplace access</p><h2 className="mt-2 text-2xl font-medium">Manage sellers</h2><p className="mt-2 text-sm text-muted-foreground">Search sellers, review access, manually adjust trial expiry dates, and suspend or reactivate storefronts. Only administrators can manage seller access.</p></div>
    <div className="flex flex-wrap gap-3"><Input className="min-w-[200px] max-w-sm flex-1 rounded-xl bg-white" aria-label="Search sellers" placeholder="Search name, email, UID…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter seller access" className="h-10 rounded-xl border bg-white px-3 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="pending">Pending</option></select></div>
    {isLoading ? <p className="text-sm text-muted-foreground">Loading seller accounts…</p> : !visible.length ? <p className="rounded-2xl border bg-white p-8 text-sm text-muted-foreground">No sellers match these filters.</p> : <div className="space-y-3">
      {visible.map(seller => {
        const end = dateFrom(seller.accessEndsAt)?.getTime() ?? 0;
        const active = seller.status === 'active' && end > Date.now();
        return <article key={seller.id} className="rounded-2xl border border-[#e8e1d6] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-1"><h3 className="text-base font-semibold">{seller.businessName}</h3><p className="break-all text-xs text-muted-foreground">{seller.contactEmail} · {seller.businessCategory}</p><p className="text-xs text-muted-foreground">Seller ID: {seller.id}</p></div><div className="text-left sm:text-right"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}{seller.status === 'active' && !active ? 'Expired' : seller.status}</span><p className="mt-2 text-xs text-muted-foreground">{seller.accessType} · Until {formatDate(seller.accessEndsAt)}</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><Button size="sm" variant="outline" disabled={working !== null} onClick={() => manage(seller)}><CalendarClock className="mr-2 h-4 w-4" />Manage access</Button>{seller.status === 'suspended' ? <Button size="sm" disabled={working !== null} onClick={() => void update(seller, { status: 'active' }, 'reactivate the store')}>Reactivate</Button> : <Button size="sm" variant="outline" disabled={working !== null} onClick={() => void update(seller, { status: 'suspended' }, 'suspend the store')} className="text-red-700">Suspend</Button>}</div>
          {selectedId === seller.id && <div className="mt-4 space-y-4 rounded-xl border border-[#e5d9c8] bg-[#faf8f3] p-4">
            <div className="flex items-center justify-between gap-2"><div><h4 className="font-semibold">Edit seller access</h4><p className="mt-1 text-xs text-muted-foreground">Existing expiry: {formatDate(seller.accessEndsAt)}. Changes are applied after confirmation.</p></div><button type="button" aria-label="Close access editor" onClick={() => setSelectedId(null)} className="rounded-full p-2 hover:bg-white"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="sellerAccessType">Access plan</Label><select id="sellerAccessType" value={accessType} onChange={e => setAccessType(e.target.value as SellerAccessType)} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="trial">Trial</option><option value="full">Full access</option></select></div><div><Label htmlFor="sellerExtension">Extend from current expiry (days)</Label><div className="mt-1 flex gap-2"><Input id="sellerExtension" min={1} max={3650} type="number" value={extensionDays} onChange={e => setExtensionDays(e.target.value)} /><Button type="button" disabled={working !== null} onClick={() => extend(seller)}>Extend</Button></div></div></div>
            <div><Label htmlFor="sellerExactExpiry">Or manually set expiry date</Label><div className="mt-1 flex flex-wrap gap-2"><Input id="sellerExactExpiry" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="max-w-xs bg-white"/><Button type="button" variant="outline" disabled={working !== null} onClick={() => saveExact(seller)}>Save expiry</Button></div></div>
            <p className="text-xs text-[#796d5c]">Admin-only access control. An expiry change does not charge the seller or modify order history.</p>
          </div>}
        </article>;
      })}
    </div>}
  </section>;
}
