'use client';import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePagedPublicCatalog } from '@/firebase/firestore/use-paged-public-catalog';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SellerStorefrontProducts } from '@/components/seller-storefront-products';
import { ProductGridContainer } from '@/components/product-grid';
import Link from 'next/link';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product } from '@/lib/products';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogMaintenanceGate } from '@/components/catalog-maintenance-gate';

function ProductsPageContent({ searchTerm }: { searchTerm: string }) {
  const {data:products,isLoading,error,retry,hasMore,loadingMore,loadMore}=usePagedPublicCatalog<Product>('products',undefined,searchTerm);

  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={8} />;
  return <><ProductGridContainer products={products||[]} externalSearchTerm={searchTerm} hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>{hasMore&&<button type="button" disabled={loadingMore} onClick={()=>void loadMore()} className="mt-6 rounded-full border px-5 py-3 text-sm">{loadingMore?'Loading…':'Show more products'}</button>}</>;
}

function ProductsSearchPage() {
  const searchParams = useSearchParams();
  const incomingQuery = searchParams.get('q') ?? '';
  const [searchTerm, setSearchTerm] = useState(incomingQuery);
  useEffect(() => setSearchTerm(incomingQuery), [incomingQuery]);
  const exactSku = normalizeProductSku(searchTerm);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="section-shell flex-1 pb-16 pt-7 sm:pb-24 sm:pt-14">
        <CatalogMaintenanceGate>
        <div className="mb-7 border-b border-[#e8e0d5] pb-6 sm:mb-12 sm:pb-10">
          <p className="eyebrow text-[#a68a64]">The whole collection</p>
          <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.04em] sm:text-6xl sm:font-medium">Shop all <span className="font-serif italic font-normal text-[#a68a64]">the good things.</span></h1>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">A considered mix of little discoveries and everyday favourites. Take your time, find your thing.</p>
          </div>
        </div>
        <div className="mb-8 relative w-full sm:max-w-[390px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search products" value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search products by name or SKU..."
            className="h-12 rounded-2xl border-[#e6ded2] bg-white pl-11 text-[16px] shadow-sm placeholder:text-muted-foreground/70 focus-visible:ring-[#b99a70] sm:rounded-full sm:text-sm" />
        </div>
        {exactSku ? <SkuSearchResult sku={exactSku} /> : <>
          <div className="mb-12"><SellerStorefrontProducts searchTerm={searchTerm} /></div>
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}><ProductsPageContent searchTerm={searchTerm} /></Suspense>
        </>}
        </CatalogMaintenanceGate>
      </main>
      <footer className="border-t border-[#e8e0d5] py-7">
        <div className="section-shell flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <Link href="/" className="brand-wordmark text-2xl">TreatStory</Link>
          <div className="flex gap-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground"><Link href="/terms-of-service">Terms</Link><Link href="/privacy-policy">Privacy</Link></div>
          <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} TreatStory</p>
        </div>
      </footer>
    </div>
  );
}

export default function ProductsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-background"><Header/><main className="section-shell py-10"><div role="status" className="h-64 animate-pulse rounded-3xl bg-[#eee8df]"/></main></div>}><ProductsSearchPage/></Suspense>;
}
