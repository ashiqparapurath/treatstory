'use client';
import { orderFeedback } from '@/lib/order-feedback';
import { getErrorNotice, errorToast } from '@/lib/user-notices';
import { SectionSkeleton } from '@/components/loading-states';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where, orderBy, limit, startAfter, onSnapshot, getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { useAccountData, useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { sendOrderAction, type OrderAction } from '@/lib/order-api';
import { Textarea } from '@/components/ui/textarea';
import { Package, Search, Clock3, CheckCircle2, Banknote, Phone, MapPin, ClipboardCopy, ArrowRight, ShoppingBag, X, AlertTriangle, CalendarDays, ListFilter, TrendingUp, ChevronRight } from 'lucide-react';

export type OrderRecord = {
  id: string; orderReference?:string; buyerUid: string; sellerId: string; productId: string; productName: string;
  quantity: number; unitPrice: number; subtotal: number; paymentMethod?: 'cod' | 'seller-arranged-advance'; advancePaymentRequired?: boolean;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'out-for-delivery' | 'completed' | 'rejected' | 'cancelled';
  customerName: string; customerPhone: string; deliveryAddress: string; customerNote: string;
  deliveryMode?: 'delivery' | 'pickup'; deliveryFee?: number; requestedDate?: string; requestedSlot?: string;
  giftRecipient?: string; giftMessage?: string; paymentStatus?: 'pending' | 'collected';
  acceptanceDeadline?: { toDate?: () => Date }; selectedWeight?: { value: number; unit: string } | null;
  cancellationRequest?: { reason: string; requestedAt?: { toDate?: () => Date } } | null;
  inventoryReleaseReview?: boolean;
  history?: Array<{ at?: { toDate?: () => Date }; by: string; action: string; note?: string }>;
  createdAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
};
type Status = OrderRecord['status'];
const steps: Status[] = ['pending','accepted','preparing','ready','out-for-delivery','completed'];
const next: Record<Status, Status[]> = { pending: ['accepted','rejected'], accepted: ['preparing','cancelled'], preparing: ['ready','cancelled'], ready: ['out-for-delivery','completed'], 'out-for-delivery': ['completed'], completed: [], rejected: [], cancelled: [] };
const labels: Record<Status,string> = { pending: 'New order', accepted: 'Accepted', preparing: 'In preparation', ready: 'Ready for fulfillment', 'out-for-delivery': 'Out for delivery', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' };
const primary: Partial<Record<Status,string>> = { pending: 'Accept order', accepted: 'Start preparing', preparing: 'Mark as ready', ready: 'Send out for delivery', 'out-for-delivery': 'Mark as delivered' };
const money = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const date = (v?: { toDate?: () => Date }) => v?.toDate?.()?.toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' }) ?? 'Just now';
const age = (v?: { toDate?: () => Date }) => { const d = v?.toDate?.(); if (!d) return ''; const h = Math.max(0, Math.floor((Date.now() - d.getTime()) / 3600000)); return h < 1 ? 'Less than 1 hour ago' : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`; };
const badge: Record<Status,string> = { pending: 'bg-amber-50 text-amber-800 border-amber-200', accepted: 'bg-blue-50 text-blue-800 border-blue-200', preparing: 'bg-violet-50 text-violet-800 border-violet-200', ready: 'bg-emerald-50 text-emerald-800 border-emerald-200', 'out-for-delivery': 'bg-sky-50 text-sky-800 border-sky-200', completed: 'bg-stone-100 text-stone-700 border-stone-200', rejected: 'bg-red-50 text-red-700 border-red-200', cancelled: 'bg-red-50 text-red-700 border-red-200' };
const copy = async (value: string) => { if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(value); };

export function OrderManagement({ mode }: { mode: 'seller' | 'admin' | 'customer' }) {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const account = useAccountData();
  const [recent, setRecent] = useState<OrderRecord[] | null>(null);
  const [recentCursor, setRecentCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [older, setOlder] = useState<OrderRecord[]>([]);
  const [olderCursor, setOlderCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasOlderPages, setHasOlderPages] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [feedError, setFeedError] = useState<Error | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const uid = user?.uid ?? null;
  // Admin/seller have a single live first page. Buyer reuses the session-wide feed.
  useEffect(() => {
    setRecent(null); setRecentCursor(null); setOlder([]); setOlderCursor(null); setHasOlderPages(null); setFeedError(null); setUsingFallback(false);
    if (!db || !uid || mode === 'customer') return;
    let live = true;
    const started = performance.now();
    const base = collection(db, 'seller_orders');
    const scoped = mode === 'admin' ? base : query(base, where('sellerId', '==', uid));
    let stopFallback: (() => void) | null = null;
    const stop = onSnapshot(query(scoped, orderBy('createdAt', 'desc'), limit(20)), snapshot => {
      if (!live) return;
      setRecent(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as OrderRecord)));
      setRecentCursor(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setFeedError(null); setUsingFallback(false);
      if (performance.getEntriesByName('TreatStory orders first page').length === 0) performance.measure('TreatStory orders first page', { start: started, end: performance.now() });
    }, error => {
      if (!live) return;
      // Seller-only fallback on missing composite index: bounded, owner-scoped,
      // ordered by document ID until required indexes become Enabled.
      if (mode === 'seller' && error.code === 'failed-precondition') {
        setUsingFallback(true);
        stopFallback = onSnapshot(query(scoped, limit(20)), snapshot => {
          if (!live) return;
          setRecent(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as OrderRecord)));
          setRecentCursor(snapshot.docs[snapshot.docs.length - 1] ?? null);
          setFeedError(null);
        }, fallbackError => { if (live) { setFeedError(fallbackError); setRecent([]); } });
      } else { setFeedError(error); setRecent([]); }
    });
    return () => { live = false; stop(); stopFallback?.(); };
  }, [db, uid, mode, attempt]);
  const firstPage = mode === 'customer' ? account.buyerOrders : recent;
  const firstCursor = mode === 'customer' ? account.buyerOrdersCursor : recentCursor;
  const isLoading = mode === 'customer' ? account.buyerOrdersLoading : recent === null && !feedError;
  const error = mode === 'customer' ? account.buyerOrdersError : feedError;
  const retry = () => { if (mode === 'customer') window.location.reload(); else setAttempt(n => n + 1); };
  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...(firstPage ?? []), ...older].filter(order => {
      if (seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    });
  }, [firstPage, older]);
  const canLoadMore = hasOlderPages ?? (firstPage?.length === 20);
  async function loadOlder() {
    if (!db || !uid || !canLoadMore || loadingOlder) return;
    const cursor = olderCursor ?? firstCursor;
    if (!cursor) return;
    setLoadingOlder(true);
    try {
      const base = collection(db, 'seller_orders');
      const scoped = mode === 'admin' ? base : query(base, where(mode === 'seller' ? 'sellerId' : 'buyerUid', '==', uid));
      const page = await getDocs(usingFallback && mode === 'seller'
        ? query(scoped, startAfter(cursor), limit(20))
        : query(scoped, orderBy('createdAt', 'desc'), startAfter(cursor), limit(20)));
      setOlder(prev => [...prev, ...page.docs.map(d => ({ ...d.data(), id: d.id } as OrderRecord))]);
      if (page.docs.length) setOlderCursor(page.docs[page.docs.length - 1]);
      setHasOlderPages(page.docs.length === 20);
    } catch (err) {
      toast(errorToast(err, 'update-order'));
    } finally { setLoadingOlder(false); }
  }
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [linkedOrder,setLinkedOrder] = useState<OrderRecord|null>(null);
  useEffect(()=>{
    if(!db||!uid)return;
    const id=new URLSearchParams(window.location.search).get('order');
    if(!id||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))return;
    let live=true,opened=false;
    const stop=onSnapshot(doc(db,'seller_orders',id),snapshot=>{
      if(!live||!snapshot.exists())return;
      const data={...snapshot.data(),id:snapshot.id} as OrderRecord;
      if(mode==='customer'?data.buyerUid!==uid:mode==='seller'?data.sellerId!==uid:false)return;
      setLinkedOrder(data);if(!opened){opened=true;setSelected(id);}
    },()=>{if(live)toast({variant:'destructive',title:'Could not open this order',description:'Sign in to the account that placed or received this order, then try again.'});});
    return()=>{live=false;stop();setLinkedOrder(null);};
  },[db,uid,mode,toast]);
  const [confirm, setConfirm] = useState<{ id: string; status: Status } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [sort, setSort] = useState<'newest'|'oldest'|'value'>('newest');
  const [period, setPeriod] = useState<'all'|'today'|'week'|'month'>('all');
  const orders = useMemo(() => all.filter(o => (filter === 'all' || (filter === 'active' ? !['completed','rejected','cancelled'].includes(o.status) : o.status === filter)) && (period === 'all' || (() => { const stamp = o.createdAt?.toDate?.()?.getTime() ?? 0; const now = Date.now(); const start = period === 'today' ? new Date().setHours(0, 0, 0, 0) : now - (period === 'week' ? 7 : 30) * 86400000; return stamp >= start; })()) && [o.productName,o.id,o.orderReference,o.customerName,o.customerPhone].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => sort === 'value' ? b.subtotal-a.subtotal : sort === 'oldest' ? (a.createdAt?.toDate?.()?.getTime() ?? 0)-(b.createdAt?.toDate?.()?.getTime() ?? 0) : (b.createdAt?.toDate?.()?.getTime() ?? 0)-(a.createdAt?.toDate?.()?.getTime() ?? 0)), [all,filter,search,sort,period]);
  const detail = all.find(o => o.id === selected)||(linkedOrder?.id===selected?linkedOrder:undefined);
  const count = (s: Status) => all.filter(o => o.status === s).length;
  const pending = count('pending');
  const active = all.filter(o => ['pending','accepted','preparing','ready','out-for-delivery'].includes(o.status)).length;
  const total = all.reduce((sum,o) => sum + o.subtotal, 0);
  const completed = all.filter(o => o.status === 'completed').reduce((sum,o) => sum + o.subtotal, 0);
  async function transition(order: OrderRecord, status: Status) {
    if (!db || working || !next[order.status]?.includes(status)) return;
    if (['rejected','cancelled'].includes(status)) { setCancelReason(''); setConfirm({ id:order.id,status }); return; }
    await apply(order,status);
  }
  async function apply(order: OrderRecord, status: Status, reason = '') {
    if (!user || working || !next[order.status]?.includes(status)) return;
    setWorking(order.id); setConfirm(null);
    try {
      await sendOrderAction(user, order.id, status as OrderAction, reason);
      toast(orderFeedback(status,order.productName,order.deliveryMode,mode==='customer'?'buyer':'seller'));
    } catch (err) {
      toast(errorToast(err, 'update-order'));
    } finally { setWorking(null); }
  }
  async function extraAction(order: OrderRecord, action: OrderAction, reason = '') {
    if (!user || working) return;
    setWorking(order.id);
    try {
      await sendOrderAction(user, order.id, action, reason);
      if (action === 'request-cancellation') setRequestReason('');
      toast(orderFeedback(action,order.productName,order.deliveryMode,mode==='customer'?'buyer':'seller'));
    } catch (error) {
      toast(errorToast(error, 'update-order'));
    } finally { setWorking(null); }
  }

  function exportVisible() {
    const safe = (value: string | number) => {
      const input = String(value ?? '');
      const valueSafe = /^[=+@\-\t\r]/.test(input) ? "'" + input : input;
      return '"' + valueSafe.replace(/"/g, '""') + '"';
    };
    const header = ['Order ID', 'Placed', 'Status', 'Product', 'Quantity', 'Amount INR', 'Customer', 'Phone'];
    const rows = orders.map(o => [o.id, date(o.createdAt), o.status, o.productName, o.quantity, o.subtotal, o.customerName, o.customerPhone].map(safe).join(','));
    const csv = [header.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `treatstory-${mode}-loaded-orders.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const filters = [{key:'all',label:'All orders',n:all.length},{key:'pending',label:'New',n:pending},{key:'active',label:'In progress',n:active},{key:'ready',label:'Ready',n:count('ready')},{key:'out-for-delivery',label:'Out for delivery',n:count('out-for-delivery')},{key:'completed',label:'Completed',n:count('completed')},{key:'cancelled',label:'Cancelled',n:count('cancelled')},{key:'rejected',label:'Rejected',n:count('rejected')}];
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Fulfillment workspace</p><h2 className="mt-2 text-2xl font-medium tracking-tight">Order processing</h2><p className="mt-2 text-sm text-muted-foreground">Review requests, manage preparation and keep orders moving.</p></div><span className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Recent orders · Live</span></div>
    <div className={`grid grid-cols-2 gap-3 ${mode === 'seller' ? 'sm:grid-cols-3' : 'xl:grid-cols-4'}`}>{[
      {label:'Needs attention',value:String(pending),icon:Clock3,sub:'Awaiting a decision'},
      {label:'In progress',value:String(active),icon:Package,sub:'Active orders'},
      {label:'Completed',value:String(count('completed')),icon:CheckCircle2,sub:'Fulfilled orders'},
      ...(mode === 'seller' ? [] : [{label:'Completed order value',value:money(completed),icon:TrendingUp,sub:'Loaded orders · Not verified revenue'}])
    ].map(m => <div key={m.label} className="rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{m.label}</span><m.icon className="h-4 w-4 shrink-0 text-[#a68a64]" /></div><p className="mt-4 break-words text-2xl font-semibold sm:text-3xl">{m.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{m.sub}</p></div>)}</div>
    {mode !== 'customer' && pending > 0 && <button type="button" onClick={() => setFilter('pending')} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left text-sm text-amber-950 sm:px-5"><span className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><span><strong className="block">{pending} new {pending === 1 ? 'order needs' : 'orders need'} your attention</strong><span className="mt-1 block text-xs">Review and accept or reject incoming requests.</span></span></span><ChevronRight className="h-5 w-5 shrink-0" /></button>}
    <div className="rounded-2xl border border-[#e8e0d5] bg-white p-3 sm:p-4"><div className="flex gap-2 overflow-x-auto pb-3">{filters.map(f => <button key={f.key} onClick={() => setFilter(f.key)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition ${filter===f.key?'bg-[#29251f] text-white':'bg-[#f7f5f1] text-[#71685e] hover:bg-[#eee8df]'}`}>{f.label} <span className="ml-1 opacity-70">{f.n}</span></button>)}</div><div className="grid gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search loaded orders…" className="h-10 bg-[#faf9f7] pl-9" /></div><select aria-label="Sort orders" value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="h-10 rounded-lg border bg-white px-3 text-xs"><option value="newest">Newest loaded first</option><option value="oldest">Oldest first</option><option value="value">Highest value</option></select><select aria-label="Filter loaded orders by date" value={period} onChange={e => setPeriod(e.target.value as typeof period)} className="h-10 rounded-lg border bg-white px-3 text-xs"><option value="all">All dates</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option></select></div></div>
    {mode !== 'customer' && <div className="flex justify-end"><Button variant="outline" size="sm" disabled={!orders.length} onClick={exportVisible}>Export visible CSV</Button></div>}
    {usingFallback && !error && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Showing a limited order history while the full history is temporarily unavailable. Please try again later.</p>}
    {error && <div role="alert" className="rounded-2xl border border-amber-200 bg-white p-5"><p className="font-semibold">Orders could not be loaded</p><p className="mt-2 text-sm text-muted-foreground">{(error as {code?: string}).code === 'permission-denied' ? 'Your account cannot access these orders. Check that you are signed in to the correct account.' : (error as {code?: string}).code === 'failed-precondition' ? 'Your order history is temporarily unavailable. Please try again later or contact support.' : getErrorNotice(error,'load').description}</p><Button type="button" variant="outline" className="mt-4" onClick={retry}>Try again</Button></div>}
    {error ? null : isLoading ? <SectionSkeleton /> : !orders.length ? <div className="rounded-2xl border bg-white p-12 text-center"><Package className="mx-auto h-9 w-9 text-[#a68a64]" /><h3 className="mt-4 font-medium">No matching orders</h3><p className="mt-2 text-sm text-muted-foreground">Try another status or search term.</p></div> : <div className="space-y-3">{orders.map(o => <article key={o.id} className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white transition hover:border-[#cbbba7]"><div className="p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">#{o.orderReference||o.id.slice(0,10).toUpperCase()}</span><span className="text-xs text-muted-foreground">{date(o.createdAt)}</span></div><h3 className="mt-3 text-base font-semibold sm:text-lg">{o.productName}</h3><p className="mt-1 text-sm text-muted-foreground">{o.quantity} × {money(o.unitPrice)} <span className="mx-1">·</span> {o.customerName}</p></div><div className="text-right"><span className={`inline-flex rounded-full border px-3 py-1.5 text-[11px] font-semibold ${badge[o.status]}`}>{labels[o.status]}</span><p className="mt-3 text-lg font-semibold">{money(o.subtotal)}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#f0ece6] pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" />{o.advancePaymentRequired ? 'Advance payment required' : o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Offline payment'}</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{age(o.createdAt)}</span><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{o.deliveryAddress.slice(0,45)}{o.deliveryAddress.length>45?'…':''}</span></div>
      <div className="mt-4 flex flex-wrap items-center gap-2">{mode !== 'customer' && next[o.status]?.filter(s => !['rejected','cancelled'].includes(s)).map(s => <Button key={s} size="sm" disabled={working !== null} onClick={() => transition(o,s)} className="h-10 rounded-full bg-[#29251f] px-5 text-xs hover:bg-[#51463a]">{s==='completed'?'Mark as delivered':primary[o.status] || labels[s]} <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button>)}<Button size="sm" variant="outline" onClick={() => setSelected(o.id)} className="h-10 rounded-full px-4 text-xs">View details <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>{mode !== 'customer' && next[o.status]?.filter(s => ['rejected','cancelled'].includes(s)).map(s => <Button key={s} size="sm" variant="ghost" disabled={working !== null} onClick={() => transition(o,s)} className="h-10 rounded-full text-xs text-red-700">{s === 'rejected'?'Reject order':'Cancel order'}</Button>)}</div></div></article>)}</div>}
    {canLoadMore && !error && <div className="flex justify-center"><Button variant="outline" className="min-h-11 rounded-full px-6" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading older orders…' : 'Load older orders'}</Button></div>}
    <p className="text-xs leading-5 text-muted-foreground">Counts, filters and search apply to loaded orders only. Load older pages to see more history.</p>
    {mode !== 'seller' && <p className="text-xs leading-5 text-muted-foreground">Order values are not proof of payment. COD collection and delivery confirmation are managed offline. Total requested value: {money(total)}.</p>}
    {detail && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-5" onMouseDown={e => { if(e.target===e.currentTarget) setSelected(null); }}><div role="dialog" aria-modal="true" aria-label="Order details" className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#faf8f4] shadow-2xl sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-5 sm:px-7"><div><p className="text-[10px] uppercase tracking-widest text-[#a68a64]">Order details</p><h2 className="mt-1 text-xl font-semibold">#{detail.orderReference||detail.id.slice(0,10).toUpperCase()}</h2></div><button aria-label="Close order details" onClick={() => setSelected(null)} className="rounded-full border p-2"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-5 sm:p-7">
      <div className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Fulfillment progress</h3><span className={`rounded-full border px-3 py-1 text-[11px] font-medium ${badge[detail.status]}`}>{labels[detail.status]}</span></div>{steps.includes(detail.status) ? <div className="mt-6 grid grid-cols-6 gap-1">{steps.map((s,i) => <div key={s}><div className={`h-1.5 rounded-full ${i<=steps.indexOf(detail.status)?'bg-[#9a7c56]':'bg-[#eee8df]'}`} /><p className={`mt-2 text-[9px] leading-3 sm:text-[10px] ${i<=steps.indexOf(detail.status)?'font-semibold text-[#6d5336]':'text-muted-foreground'}`}>{s==='pending'?'New':s==='preparing'?'Preparing':s==='ready'?'Ready':s==='out-for-delivery'?'On its way':labels[s]}</p></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">This order is closed and no longer in the active fulfillment workflow.</p>}<p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />Placed {date(detail.createdAt)} · Last update {date(detail.updatedAt)}</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h3 className="text-xs font-semibold uppercase tracking-widest text-[#a68a64]">Customer</h3><p className="mt-4 font-semibold">{detail.customerName}</p><p className="mt-1 break-all text-sm">{detail.customerPhone}</p><div className="mt-4 flex flex-wrap gap-2"><a href={`tel:${detail.customerPhone.replace(/[^+\d]/g,'')}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs"><Phone className="h-3.5 w-3.5" />Call</a><button onClick={() => void copy(detail.customerPhone).then(() => toast({title:'Phone copied'})).catch(() => toast({variant:'destructive',title:'Unable to copy'}))} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs"><ClipboardCopy className="h-3.5 w-3.5" />Copy phone</button></div></div><div className="rounded-2xl border bg-white p-5"><h3 className="text-xs font-semibold uppercase tracking-widest text-[#a68a64]">Delivery address</h3><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{detail.deliveryAddress}</p><button onClick={() => void copy(detail.deliveryAddress).then(() => toast({title:'Address copied'})).catch(() => toast({variant:'destructive',title:'Unable to copy'}))} className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs"><ClipboardCopy className="h-3.5 w-3.5" />Copy address</button></div></div>
      <div className="rounded-2xl border bg-white p-5"><h3 className="text-xs font-semibold uppercase tracking-widest text-[#a68a64]">Order items & payment</h3><div className="mt-4 flex justify-between gap-3 text-sm"><span>{detail.productName} × {detail.quantity}</span><span className="shrink-0 font-semibold">{money(detail.subtotal)}</span></div><div className="mt-4 flex justify-between border-t pt-4 text-sm"><span>Payment method</span><span className="font-medium">{detail.advancePaymentRequired ? 'Seller-arranged advance required' : detail.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Offline payment'}</span></div><p className="mt-3 text-xs text-muted-foreground">Payment has not been verified by TreatStory.</p>{detail.customerNote && <div className="mt-5 rounded-xl bg-[#f7f5f1] p-4"><p className="text-xs font-semibold">Customer instructions</p><p className="mt-2 whitespace-pre-wrap text-sm">{detail.customerNote}</p></div>}{mode==='admin' && <p className="mt-4 break-all text-xs text-muted-foreground">Seller UID: {detail.sellerId}</p>}</div>
      {(detail.requestedDate || detail.deliveryMode) && <div className="rounded-2xl border bg-white p-5 text-sm"><h3 className="font-semibold">Delivery & booking</h3><p className="mt-2">{detail.deliveryMode === 'pickup' ? 'Pickup from creator' : 'Seller delivery'}{detail.requestedDate ? ` · ${detail.requestedDate}` : ''}{detail.requestedSlot ? ` · ${detail.requestedSlot}` : ''}</p><p className="mt-2">Shipping fee: {money(detail.deliveryFee || 0)} · Total: {money(detail.subtotal + (detail.deliveryFee || 0))}</p>{detail.selectedWeight && <p className="mt-2">Selected size: {detail.selectedWeight.value} {detail.selectedWeight.unit}</p>}{detail.giftRecipient && <p className="mt-2">Gift recipient: {detail.giftRecipient}</p>}{detail.giftMessage && <p className="mt-2 whitespace-pre-wrap">Gift note: {detail.giftMessage}</p>}{detail.acceptanceDeadline && detail.status === 'pending' && <p className="mt-2 text-amber-800">Awaiting acceptance · seller reply expected by {date(detail.acceptanceDeadline)}</p>}</div>}
      {mode === 'customer' && ['pending','accepted','preparing','ready'].includes(detail.status) && <div className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Request cancellation</h3>{detail.cancellationRequest ? <p className="mt-2 text-sm text-amber-800">Your cancellation request is awaiting the seller's decision.</p> : <div className="mt-3 space-y-3"><Textarea maxLength={300} value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Tell the seller why you need to cancel (at least 5 characters)." rows={2}/><Button variant="outline" disabled={working!==null || requestReason.trim().length<5} onClick={() => void extraAction(detail,'request-cancellation',requestReason.trim())}>Send cancellation request</Button></div>}</div>}
      {mode !== 'customer' && detail.cancellationRequest && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold">Cancellation requested</h3><p className="mt-2 whitespace-pre-wrap text-sm">{detail.cancellationRequest.reason}</p><div className="mt-3 flex flex-wrap gap-2"><Button disabled={working!==null} onClick={() => void extraAction(detail,'cancelled',detail.cancellationRequest!.reason)}>Approve and cancel</Button><Button variant="outline" disabled={working!==null} onClick={() => void extraAction(detail,'decline-cancellation')}>Decline request</Button></div></div>}
      {mode==='customer' && detail.status==='completed' && <a href={`/review?order=${encodeURIComponent(detail.id)}`} className="inline-flex min-h-11 items-center rounded-full border border-[#a68a64] bg-[#fffaf3] px-5 text-sm font-semibold">Leave a verified purchase review</a>}
      {detail.status==='completed' && <div className="rounded-2xl border bg-white p-5 text-sm"><h3 className="font-semibold">{detail.advancePaymentRequired ? 'Payment collection' : 'Cash-on-delivery collection'}</h3><p className="mt-2">Payment: {detail.paymentStatus==='collected' ? 'Recorded as collected' : 'Not yet recorded as collected'}</p>{mode!=='customer' && detail.paymentStatus!=='collected' && <Button className="mt-3" disabled={working!==null} onClick={() => void extraAction(detail,'cod-collected')}>{detail.advancePaymentRequired ? 'Record full payment collected' : 'Record COD collected'}</Button>}</div>}
      {!!detail.history?.length && <div className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Order activity</h3><ol className="mt-3 space-y-2">{detail.history.slice().reverse().map((item,i)=><li key={i} className="border-l-2 border-[#c5b093] pl-3 text-xs"><span className="font-semibold capitalize">{item.action.replaceAll('-', ' ')}</span> · {date(item.at)}{item.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.note}</p>}</li>)}</ol></div>}
      {detail.inventoryReleaseReview && mode!=='customer' && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inventory could not be fully restored automatically after the variant changed. Please reconcile stock manually.</p>}
      {mode !== 'customer' && next[detail.status].length>0 && <div className="flex flex-wrap gap-2">{next[detail.status].map(s => <Button key={s} disabled={working!==null} onClick={() => transition(detail,s)} variant={['rejected','cancelled'].includes(s)?'outline':'default'} className="h-11 rounded-full capitalize">{['rejected','cancelled'].includes(s)?s:(primary[detail.status]||labels[s])}</Button>)}</div>}
    </div></div></div>}
    {confirm && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><AlertTriangle className="h-6 w-6 text-red-600" /><h3 className="mt-4 text-xl font-semibold">{confirm.status === 'rejected' ? 'Reject this order?' : 'Cancel this order?'}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">This will change the order status and notify other dashboards through the live order feed. This action cannot be reversed by the seller.</p><Textarea className="mt-3" maxLength={300} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Reason for rejection or cancellation (required for cancellation)" rows={2}/><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>Keep order</Button><Button disabled={working!==null} onClick={() => { const o=all.find(v=>v.id===confirm.id); if(o) void apply(o,confirm.status,cancelReason.trim()); }} className="bg-red-700 hover:bg-red-800">{working?'Updating…':'Confirm'}</Button></div></div></div>}
  </section>;
}
