'use client';
import { matchesProductSearch, applyCatalogFilters, type CatalogFilters } from '@/lib/catalog-search';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';
import { usePagedPublicCatalog } from '@/firebase/firestore/use-paged-public-catalog';

import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { useMemo, useState, useEffect, useDeferredValue } from 'react';
import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { SellerProductCollection } from '@/components/seller-product-collection';
import { Input } from '@/components/ui/input';
import { Search, Store } from 'lucide-react';

export function SellerStorefrontProducts({ limitCount, searchTerm, filters }: { limitCount?: number; searchTerm?: string; filters?: CatalogFilters }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(searchTerm ?? search);
  const {data,isLoading,error,retry,hasMore,loadingMore,loadMore}=usePagedPublicCatalog<MarketplaceProduct>('marketplace_products',limitCount,limitCount?'':deferredSearch);
  const sku = limitCount || searchTerm !== undefined ? null : normalizeProductSku(deferredSearch);
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => setVisibleCount(24), [deferredSearch, filters?.category, filters?.price, filters?.availability, filters?.sort]);
  const visible = useMemo(() => {
    const matches = (data ?? []).filter(p => matchesProductSearch(p, deferredSearch));
    const refined = filters ? applyCatalogFilters(matches, filters) : matches;
    return limitCount === undefined ? refined : refined.slice(0, limitCount);
  }, [data, deferredSearch, limitCount, filters]);

  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={limitCount || 8} />;
  if (!data?.length) return null;
  return <section className="space-y-4 md:space-y-6">
    <div className={limitCount ? "hidden flex-wrap items-end justify-between gap-4 md:flex" : "flex flex-wrap items-end justify-between gap-4"}><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">From independent creators</p><h2 className="mt-2 text-[20px] font-semibold tracking-tight sm:text-3xl sm:font-medium">Made with a little more love</h2></div><span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Store className="h-4 w-4" />TreatStory sellers</span></div>
    {!limitCount && searchTerm === undefined && <div className="relative max-w-sm"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creator products by name or SKU…" aria-label="Search creator products" className="rounded-full bg-white pl-11" /></div>}
    {sku ? <SkuSearchResult sku={sku} /> : visible.length === 0 ? <p className="text-sm text-muted-foreground">{loadingMore?'Loading matches…':hasMore?'No matches on this page. Choose Show more creations.':'No matching creator products.'}</p> : (
      <SellerProductCollection products={visible.slice(0, visibleCount)} />
    )}
    {!sku&&!limitCount&&(visibleCount<visible.length||hasMore)&&<button type="button" disabled={loadingMore} onClick={async()=>{if(visibleCount>=visible.length)await loadMore();setVisibleCount(n=>n+24);}} className="min-h-11 rounded-xl border px-5 text-sm">{loadingMore?'Loading creations…':'Show more creations'}</button>}
    <p className="hidden text-xs text-muted-foreground md:block">Buy now takes you directly to checkout. Cash on Delivery is subject to seller confirmation.</p>
  </section>;
}
