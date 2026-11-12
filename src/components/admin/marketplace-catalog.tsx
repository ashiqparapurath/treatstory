'use client';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PackageSearch, Search, ImageIcon } from 'lucide-react';

export function MarketplaceCatalog() {
  const db = useFirestore();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? collection(db, 'marketplace_products') : null, [db]);
  const { data: products, isLoading, error: loadError, retry: retryLoad, hasMore, loadingMore, loadMore } = usePagedCollection<MarketplaceProduct>(ref);
  const [search, setSearch] = useState('');
  const [visibility, setVisibilityFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [working, setWorking] = useState<string | null>(null);
  const visible = (products ?? []).filter(p => (visibility === 'all' || (p.status ?? 'draft') === visibility) && (p.name + ' ' + p.sellerId + ' ' + p.category + ' ' + (p.sku || '')).toLowerCase().includes(search.trim().toLowerCase()));
  async function setVisibility(product: MarketplaceProduct) {
    if (!db || working) return;
    setWorking(product.id);
    try {
      await updateDoc(doc(db, 'marketplace_products', product.id), { status: product.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() });
      toast({ title: 'Listing visibility updated' });
    } catch { toast({ variant: 'destructive', title: 'Could not update listing' }); }
    finally { setWorking(null); }
  }
  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return <section className="space-y-4">
    <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white">{[
      {label:'Loaded listings', value:(products ?? []).length},
      {label:'Published', value:(products ?? []).filter(p => p.status === 'published').length},
      {label:'Drafts', value:(products ?? []).filter(p => p.status !== 'published').length}
    ].map((item,i) => <div key={item.label} className={`px-4 py-4 sm:px-6 sm:py-5 ${i ? 'border-l border-[#eee8df]' : ''}`}><p className="text-xl font-semibold tabular-nums sm:text-2xl">{isLoading ? '…' : item.value}</p><p className="mt-1 text-[11px] text-[#85786a] sm:text-xs">{item.label}</p></div>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-md"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8b7a]" /><Input className="h-11 rounded-xl border-[#e6dfd5] bg-white pl-10" aria-label="Search seller listings" placeholder="Search products, SKU or seller…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div role="group" aria-label="Filter listing visibility" className="flex items-center gap-1 rounded-xl border border-[#e6dfd5] bg-white p-1">{(['all','published','draft'] as const).map(item => <button key={item} type="button" aria-pressed={visibility === item} onClick={() => setVisibilityFilter(item)} className={`min-h-9 rounded-lg px-3 text-xs font-medium capitalize ${visibility === item ? 'bg-[#29251f] text-white' : 'text-[#756a5d] hover:bg-[#f5f0e9]'}`}>{item}</button>)}</div>
    </div>
    {isLoading ? <p className="rounded-2xl border border-[#e6dfd5] bg-white p-6 text-sm text-muted-foreground">Loading listings…</p> : !visible.length ? <div className="rounded-2xl border border-[#e6dfd5] bg-white p-10 text-center"><PackageSearch className="mx-auto h-8 w-8 text-[#a68a64]" /><p className="mt-4 text-sm text-muted-foreground">No matching seller listings.</p></div> :
      <div className="overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(110px,1fr)_100px_110px_110px] gap-4 border-b border-[#eee8df] bg-[#faf8f5] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#897a69] lg:grid"><span>Listing</span><span>Seller ID</span><span>Price</span><span>Visibility</span><span className="text-right">Moderation</span></div>
        <div className="divide-y divide-[#eee8df]">{visible.map(p => <article key={p.id} className="grid gap-3 px-4 py-4 transition hover:bg-[#fcfaf7] sm:px-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(110px,1fr)_100px_110px_110px] lg:items-center lg:gap-4">
          <div className="flex min-w-0 items-start gap-3"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#eee8df] bg-[#f4f0e9]">{p.imageUrls?.[0] ? <img src={p.imageUrls[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-[#b4a696]" />}</div><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[#29251f]">{p.name}</h3><p className="mt-1 text-xs text-[#87786a]">{p.category}</p>{p.sku && <p className="mt-1 break-all font-mono text-[11px] text-[#806b4f]">SKU: {p.sku}</p>}</div></div>
          <div className="flex items-center justify-between gap-3 lg:block"><span className="text-xs text-[#928677] lg:hidden">Seller</span><span title={p.sellerId} className="max-w-full truncate font-mono text-[11px]">{p.sellerId.slice(0,12)}…</span></div>
          <div className="flex items-center justify-between gap-3 lg:block"><span className="text-xs text-[#928677] lg:hidden">Price</span><span className="text-sm font-semibold tabular-nums">₹{p.price.toLocaleString('en-IN')}</span></div>
          <div className="flex items-center justify-between gap-3 lg:block"><span className="text-xs text-[#928677] lg:hidden">Visibility</span><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${p.status === 'published' ? 'bg-[#eaf3ed] text-[#35644b]' : 'bg-[#f3eee5] text-[#816441]'}`}>{p.status ?? 'draft'}</span></div>
          <div className="flex justify-end"><Button size="sm" variant="outline" className="h-9 rounded-lg border-[#e5ddd3] bg-white" disabled={working !== null} onClick={() => setVisibility(p)}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</Button></div>
        </article>)}</div>
      </div>}
    <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>
  </section>;
}
