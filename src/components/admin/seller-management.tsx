'use client';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { requestSellerMail } from '@/lib/account-mail';

import { useRef, useState } from 'react';
import { collection, Timestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { Seller, SellerAccessType } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';
import { useToast } from '@/hooks/use-toast';
import { CalendarClock, CheckCircle2, ShieldAlert, Store, X } from 'lucide-react';

const dateFrom = (value: unknown) => (value as { toDate?: () => Date } | null)?.toDate?.() ?? null;
const longDate = (value: unknown) => dateFrom(value)?.toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'}) ?? 'Not set';
type AccessChange = { seller: Seller; patch: Record<string,unknown>; action: 'expiry'|'extend'|'suspend'|'reactivate'; days?:number };
const formatDate = (value: unknown) => dateFrom(value)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? 'Not set';
const inputDate = (value: unknown) => {
  const date = dateFrom(value);
  if (!date) return '';
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};

export function SellerManagement() {
  const db = useFirestore();
  const {user}=useUser();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? collection(db, 'sellers') : null, [db]);
  const { data: sellers, isLoading, error, retry, hasMore, loadingMore, loadMore } = usePagedCollection<Seller>(ref);
  const requestInFlight = useRef(false);
  const [confirmation,setConfirmation] = useState<AccessChange|null>(null);
  const [confirmationError,setConfirmationError] = useState('');
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

  function update(seller: Seller, patch: Record<string,unknown>, action: AccessChange['action'], days?:number) {
    if (!db || working || requestInFlight.current) return;
    if (action === 'reactivate' && (dateFrom(seller.accessEndsAt)?.getTime() ?? 0) <= Date.now()) {
      manage(seller);
      toast({variant:'destructive',title:'Extend access before reactivating',description:`${seller.businessName}'s access has expired. Choose a future expiry or use Extend to restore access.`});
      return;
    }
    setConfirmationError('');setConfirmation({seller,patch,action,days});
  }
  async function confirmUpdate() {
    if (!db || !confirmation || requestInFlight.current) return;
    requestInFlight.current = true;
    const {seller,patch,action} = confirmation;
    setWorking(seller.id);setConfirmationError('');
    try {
      if(!user)throw new Error('Sign in again.');
      const response=await fetch('/api/admin/seller-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({sellerId:seller.id,expectedUpdatedAt:dateFrom(seller.updatedAt)?.getTime()??null,patch:{...patch,...(patch.accessEndsAt?{accessEndsAt:dateFrom(patch.accessEndsAt)?.getTime()}:{})}})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save seller access.');
      const end=longDate(patch.accessEndsAt || seller.accessEndsAt);
      toast({title:action==='suspend'?'Store suspended':action==='reactivate'?'Seller access reactivated':action==='extend'?'Seller access extended':'Seller access saved',
        description:action==='suspend'?`${seller.businessName} cannot receive new orders while suspended.`:`${seller.businessName} · ${patch.accessType || seller.accessType} access until ${end}.`});
      setConfirmation(null);
      if(user)try{await requestSellerMail(user,'access',seller.id);}catch{toast({title:'Access saved; email update delayed',description:'The seller’s access is saved. The email update could not be queued.'});}
    } catch(error) {
      const notice=errorToast(error,'seller-access');setConfirmationError(notice.description);toast(notice);
    } finally {requestInFlight.current=false;setWorking(null);}
  }

  function extend(seller: Seller) {
    const days = Number(extensionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) { toast({ variant: 'destructive', title: 'Enter 1–3650 days' }); return; }
    const from = Math.max(Date.now(), dateFrom(seller.accessEndsAt)?.getTime() ?? 0);
    const ends = Timestamp.fromMillis(from + days * 86400000);
    void update(seller, { accessEndsAt: ends, accessType, status: 'active' }, 'extend', days);
  }

  function saveExact(seller: Seller) {
    const date = new Date(`${expiryDate}T23:59:59`);
    if (!expiryDate || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || date.getTime() > Date.now() + 10 * 366 * 86400000) {
      toast({ variant: 'destructive', title: 'Choose an expiry date in the future (within 10 years)' }); return;
    }
    void update(seller, { accessEndsAt: Timestamp.fromDate(date), accessType }, 'expiry');
  }

  const pendingSeller=confirmation?.seller;
  const newExpiry=confirmation?.patch.accessEndsAt || pendingSeller?.accessEndsAt;
  const newPlan=confirmation?.patch.accessType || pendingSeller?.accessType;
  if (error) return <LoadError retry={retry} error={error} />;
  return <section className="space-y-4 sm:space-y-5">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Marketplace access</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">Manage sellers</h2><p className="mt-1 text-xs leading-5 text-[#817568]">Search sellers, review access, manually adjust trial expiry dates, and suspend or reactivate storefronts. Only administrators can manage seller access.</p></div>
    <div className="flex flex-wrap gap-3"><Input className="h-11 min-w-[200px] max-w-sm flex-1 rounded-xl border-[#e6dfd5] bg-white" aria-label="Search sellers" placeholder="Search name, email, UID…" value={search} onChange={e => setSearch(e.target.value)} /><Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger aria-label="Filter seller access" className="min-h-11 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" sideOffset={6}>
          <SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select></div>
    {isLoading ? <p className="text-sm text-muted-foreground">Loading seller accounts…</p> : !visible.length ? <p className="rounded-2xl border bg-white p-8 text-sm text-muted-foreground">No sellers match these filters.</p> : <div className="space-y-3">
      {visible.map(seller => {
        const end = dateFrom(seller.accessEndsAt)?.getTime() ?? 0;
        const active = seller.status === 'active' && end > Date.now();
        return <article key={seller.id} className="rounded-2xl border border-[#e6dfd5] bg-white p-4 transition hover:border-[#bba48a] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-1"><h3 className="text-base font-semibold">{seller.businessName}</h3><p className="break-all text-xs text-muted-foreground">{seller.contactEmail} · {seller.businessCategory}</p><p className="text-xs text-muted-foreground">Seller ID: {seller.id}</p></div><div className="text-left sm:text-right"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}{seller.status === 'active' && !active ? 'Expired' : seller.status}</span><p className="mt-2 text-xs text-muted-foreground">{seller.accessType} · Until {formatDate(seller.accessEndsAt)}</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eee8df] pt-4"><Button size="sm" variant="outline" disabled={working !== null} onClick={() => manage(seller)}><CalendarClock className="mr-2 h-4 w-4" />Manage access</Button>{seller.status === 'suspended' ? <Button size="sm" disabled={working !== null} onClick={() => void update(seller, { status: 'active' }, 'reactivate')}>Reactivate</Button> : <Button size="sm" variant="outline" disabled={working !== null} onClick={() => void update(seller, { status: 'suspended' }, 'suspend')} className="text-red-700">Suspend</Button>}</div>
          {selectedId === seller.id && <div className="mt-4 space-y-4 rounded-xl border border-[#e5d9c8] bg-[#faf8f3] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2"><div><h4 className="font-semibold">Edit seller access</h4><p className="mt-1 text-xs text-muted-foreground">Existing expiry: {formatDate(seller.accessEndsAt)}. Changes are applied after confirmation.</p></div><button type="button" aria-label="Close access editor" onClick={() => setSelectedId(null)} className="rounded-full p-2 hover:bg-white"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="sellerAccessType">Access plan</Label><Select value={accessType} onValueChange={value => setAccessType(value as SellerAccessType)} disabled={working !== null}>
                <SelectTrigger id="sellerAccessType" className="mt-1 min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" sideOffset={6}><SelectItem value="trial">Trial</SelectItem><SelectItem value="full">Full access</SelectItem></SelectContent>
              </Select></div><div><Label htmlFor="sellerExtension">Extend from current expiry (days)</Label><div className="mt-1 flex gap-2"><Input id="sellerExtension" min={1} max={3650} type="number" value={extensionDays} onChange={e => setExtensionDays(e.target.value)} /><Button type="button" disabled={working !== null} onClick={() => extend(seller)}>Extend</Button></div></div></div>
            <div><Label htmlFor="sellerExactExpiry">Or manually set expiry date</Label><div className="mt-1 flex flex-wrap gap-2"><Input id="sellerExactExpiry" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="max-w-xs bg-white"/><Button type="button" variant="outline" disabled={working !== null} onClick={() => saveExact(seller)}>Save expiry</Button></div></div>
            <p className="text-xs text-[#796d5c]">Admin-only access control. An expiry change does not charge the seller or modify order history.</p>
          </div>}
        </article>;
      })}
    </div>}
    <ConfirmActionDialog open={!!confirmation} onOpenChange={open=>{if(!open)setConfirmation(null);}} busy={!!working} error={confirmationError} onConfirm={confirmUpdate}
      title={confirmation?.action==='suspend'?'Suspend this store?':confirmation?.action==='reactivate'?'Reactivate seller access?':confirmation?.action==='extend'?'Extend seller access?':'Save seller access?'}
      description={confirmation?.action==='suspend'?'New orders will be paused for this seller. Existing orders remain in the order history.':confirmation?.action==='extend'?`Add ${confirmation.days} days of access and set the seller status to active.`:confirmation?.action==='reactivate'?'Restore the active seller status until the current expiry date. The seller controls whether their shop is open.':'Review the new plan and expiry before saving. This access change does not collect a payment.'}
      confirmLabel={confirmation?.action==='suspend'?'Suspend store':confirmation?.action==='reactivate'?'Reactivate access':'Save access'} destructive={confirmation?.action==='suspend'}>
      <dl className="space-y-3 rounded-2xl border border-[#e5dacb] bg-white p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Seller</dt><dd className="break-words text-right font-semibold">{pendingSeller?.businessName}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Access plan</dt><dd className="font-medium capitalize">{newPlan === 'trial'?'Trial':'Full access'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Current expiry</dt><dd className="text-right">{longDate(pendingSeller?.accessEndsAt)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">{confirmation?.action==='expiry'||confirmation?.action==='extend'?'New expiry':'Expiry'}</dt><dd className="text-right font-semibold">{longDate(newExpiry)}</dd></div></dl>
      {confirmation?.action==='expiry'&&pendingSeller?.status==='suspended'&&<p className="text-xs text-amber-800">This store will remain suspended. Reactivate it separately when ready.</p>}
    </ConfirmActionDialog>
  <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/></section>;
}
