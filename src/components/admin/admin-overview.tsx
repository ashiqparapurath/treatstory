'use client';

import { useEffect, useState } from 'react';
import { collection, getCountFromServer, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { SellerApplication } from '@/lib/marketplace-types';
import { Store, Package, ClipboardList, ShieldAlert, ArrowUpRight, CheckCircle2, Layers3, RefreshCw, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const businessCategories = ['home-bakery', 'art', 'handmade', 'other'] as const;
type Counts = {
  active: number | null; restricted: number | null; pending: number | null;
  catalog: number | null; published: number | null; delayed: number | null;
  unavailable: number | null; categories: Record<string, number> | null;
};
const blank: Counts = { active: null, restricted: null, pending: null, catalog: null, published: null, delayed: null, unavailable: null, categories: null };

function Metric({ label, value, icon: Icon, caption }: { label: string; value: number | null; icon: typeof Store; caption: string }) {
  return <article className="rounded-2xl border border-[#e8e1d6] bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-[#a68a64]" /></div>
    <p className="mt-4 text-3xl font-semibold tracking-tight text-[#2c261f]">{value ?? '…'}</p>
    <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
  </article>;
}

export function AdminOverview({ navigate }: { navigate?: (tab: string) => void }) {
  const db = useFirestore();
  const [counts, setCounts] = useState<Counts>(blank);
  const [errors, setErrors] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);

  // Only the five newest pending applications are streamed. Other figures are
  // server-side aggregations, not document downloads or approximate revenue.
  const queueQuery = useMemoFirebase(() => db ? query(collection(db, 'seller_applications'), where('status', '==', 'pending'), limit(20)) : null, [db]);
  const { data: queue, isLoading: queueLoading, error: queueError, retry: retryQueue } = useCollection<SellerApplication>(queueQuery);
  // A single-field status index is automatic; sort the small bounded queue client-side.
  const recentQueue = [...(queue ?? [])].sort((a,b) => {
    const value = (v: unknown) => (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
    return value(b.submittedAt) - value(a.submittedAt);
  }).slice(0,5);

  useEffect(() => {
    if (!db) return;
    let live = true;
    setCounts(blank); setErrors([]);
    const sellers = collection(db, 'sellers');
    const apps = collection(db, 'seller_applications');
    const listings = collection(db, 'marketplace_products');
    const orders = collection(db, 'seller_orders');

    async function count(name: string, request: ReturnType<typeof query> | ReturnType<typeof collection>) {
      try { return (await getCountFromServer(request)).data().count; }
      catch { if (live) setErrors(v => [...v, name]); return null; }
    }
    const patch = (value: Partial<Counts>) => { if (live) setCounts(v => ({ ...v, ...value })); };
    // Groups run independently: a slow or unavailable statistic doesn't block the others.
    void Promise.all([
      count('total sellers', sellers),
      count('active sellers', query(sellers, where('status', '==', 'active'), where('accessEndsAt', '>', Timestamp.now()))),
    ]).then(([total, active]) => patch({ active, restricted: total !== null && active !== null ? total - active : null }));
    void count('pending applications', query(apps, where('status', '==', 'pending'))).then(pending => patch({ pending }));
    void Promise.all([
      count('seller catalog', listings),
      count('legacy catalog', collection(db, 'products')),
      count('published products', query(listings, where('status', '==', 'published'))),
    ]).then(([sellerTotal, legacyTotal, published]) => patch({ catalog: sellerTotal !== null && legacyTotal !== null ? sellerTotal + legacyTotal : null, published }));
    void count('delayed orders', query(orders, where('status', '==', 'pending'), where('createdAt', '<=', Timestamp.fromMillis(Date.now() - 86400000)))).then(delayed => patch({ delayed }));
    void count('unavailable listings', query(listings, where('status', '==', 'published'), where('availability', '==', 'unavailable'))).then(unavailable => patch({ unavailable }));
    void Promise.all(businessCategories.map(category => count(category, query(sellers, where('businessCategory', '==', category)))))
      .then(values => patch({ categories: values.every(v => v !== null) ? Object.fromEntries(businessCategories.map((v, i) => [v, values[i] as number])) : null }));
    return () => { live = false; };
  }, [db, refresh]);

  const metrics = [
    { label: 'Active seller access', value: counts.active, icon: Store, caption: 'Approved with unexpired access' },
    { label: 'Pending applications', value: counts.pending, icon: ClipboardList, caption: 'Awaiting review' },
    { label: 'Catalog listings', value: counts.catalog, icon: Package, caption: counts.published === null ? 'Loading published count' : `${counts.published} published creator listings` },
    { label: 'Restricted sellers', value: counts.restricted, icon: ShieldAlert, caption: 'Suspended, inactive or expired' },
  ];
  const categories = counts.categories ?? {};
  const max = Math.max(1, ...Object.values(categories));
  return <section className="space-y-5 sm:space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Operations overview</p><h2 className="mt-1 text-xl font-medium sm:text-2xl">Marketplace at a glance</h2><p className="mt-1 text-xs text-muted-foreground">Lightweight database counts · Refresh to update</p></div><Button variant="outline" size="sm" className="rounded-full" onClick={() => setRefresh(v => v + 1)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">{metrics.map(m => <Metric key={m.label} {...m} />)}</div>
    {errors.length > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Some counts are unavailable. Check Firestore composite indexes and permissions. Refresh after deploying indexes.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <button onClick={() => navigate?.('orders')} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e8e1d6] bg-white p-4 text-left sm:p-5"><span><span className="block text-xs text-muted-foreground">Pending over 24 hours</span><strong className="mt-2 block text-2xl">{counts.delayed ?? '…'}</strong><span className="mt-1 block text-xs text-[#8c734f]">Review delayed orders</span></span><Clock3 className="h-5 w-5 text-[#a68a64]" /></button>
      <button onClick={() => navigate?.('catalog')} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e8e1d6] bg-white p-4 text-left sm:p-5"><span><span className="block text-xs text-muted-foreground">Published but unavailable</span><strong className="mt-2 block text-2xl">{counts.unavailable ?? '…'}</strong><span className="mt-1 block text-xs text-[#8c734f]">Review product availability</span></span><Package className="h-5 w-5 text-[#a68a64]" /></button>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <div className="rounded-2xl border border-[#e8e1d6] bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-[#a68a64]">Seller onboarding</p><h3 className="mt-1 text-xl font-medium">Applications queue</h3></div><ClipboardList className="h-5 w-5 text-[#a68a64]" /></div>
        <div className="mt-5 space-y-3">{queueError ? <button className="text-xs underline" onClick={retryQueue}>Application queue unavailable ({(queueError as { code?: string }).code || 'unknown'}) · Retry</button> : queueLoading ? <p className="text-sm text-muted-foreground">Loading recent applications…</p> : !queue?.length ? <p className="rounded-xl bg-[#f7f5f1] p-4 text-sm text-muted-foreground">No applications awaiting review.</p> : recentQueue.map(a => <div key={a.id} className="flex items-center justify-between gap-3 border-b pb-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.businessName}</p><p className="mt-1 text-xs text-muted-foreground">{a.businessCategory} · {a.contactEmail}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">Pending</span></div>)}</div>
        <button onClick={() => navigate?.('applications')} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#856b48] hover:underline">Review all applications <ArrowUpRight className="h-4 w-4" /></button>
      </div>
      <div className="rounded-2xl border border-[#e8e1d6] bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-[#a68a64]">Business mix</p><h3 className="mt-1 text-xl font-medium">Seller categories</h3></div><Layers3 className="h-5 w-5 text-[#a68a64]" /></div>
        <div className="mt-6 space-y-4">{counts.categories === null ? <p className="text-sm text-muted-foreground">Loading category counts…</p> : Object.values(categories).every(n => n === 0) ? <p className="text-sm text-muted-foreground">No sellers yet.</p> : Object.entries(categories).filter(([, value]) => value > 0).sort((a,b) => b[1]-a[1]).map(([name, count]) => <div key={name}><div className="mb-2 flex justify-between text-xs"><span className="capitalize">{name.replaceAll('-', ' ')}</span><span className="font-semibold">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eee9e1]"><div className="h-full rounded-full bg-[#aa8d67]" style={{ width: `${count/max*100}%` }} /></div></div>)}</div>
      </div>
    </div>
    <div className="flex items-start gap-3 rounded-2xl border border-[#e8e1d6] bg-[#f2ede4] p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#967b58]" /><p className="text-xs leading-5 text-[#5b5145]">Order value is not confirmed revenue. Payment and settlement analytics will require protected backend tracking.</p></div>
  </section>;
}
