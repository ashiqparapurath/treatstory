'use client';import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePagedPublicCatalog } from '@/firebase/firestore/use-paged-public-catalog';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SellerStorefrontProducts } from '@/components/seller-storefront-products';
import { ProductGridContainer } from '@/components/product-grid';
import Link from 'next/link';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Category } from '@/lib/products';
import { usePublicCatalog } from '@/firebase/firestore/use-public-catalog';
import { defaultCatalogFilters, type CatalogFilters } from '@/lib/catalog-search';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogMaintenanceGate } from '@/components/catalog-maintenance-gate';

function ProductsPageContent({ searchTerm, filters }: { searchTerm: string; filters: CatalogFilters }) {
  const {data:products,isLoading,error,retry,hasMore,loadingMore,loadMore}=usePagedPublicCatalog<Product>('products',undefined,searchTerm);

  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={8} />;
  return <><ProductGridContainer products={products||[]} externalSearchTerm={searchTerm} filters={filters} hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>{hasMore&&<button type="button" disabled={loadingMore} onClick={()=>void loadMore()} className="mt-6 rounded-full border px-5 py-3 text-sm">{loadingMore?'Loading…':'Show more products'}</button>}</>;
}

function ProductsSearchPage() {
  const searchParams = useSearchParams();
  const incomingQuery = searchParams.get('q') ?? '';
  const [searchTerm, setSearchTerm] = useState(incomingQuery);
  const requestedCategory = searchParams.get('category') ?? 'All';
  const [filters, setFilters] = useState<CatalogFilters>(() => ({ ...defaultCatalogFilters, category: requestedCategory }));
  const firestore = useFirestore();
  const categoriesRef = useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]);
  const { data: publicCategories } = usePublicCatalog<Category>(categoriesRef);
  const categoryOptions = useMemo(() => ['All', ...Array.from(new Set(
    ['Cakes', 'Cookies', 'Breads', 'Handmade', 'Art', 'Gifts', 'Flowers',
      ...(publicCategories ?? []).map(category => category.name).filter((name): name is string => typeof name === 'string' && !!name.trim()),
      requestedCategory,
    ].filter(name => name !== 'All' && !!name.trim())
  ))], [publicCategories, requestedCategory]);
  useEffect(() => setSearchTerm(incomingQuery), [incomingQuery]);
  useEffect(() => setFilters(current => ({ ...current, category: requestedCategory })), [requestedCategory]);
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
        {!exactSku && <div aria-label="Refine Explore products" className="mb-8 rounded-[22px] border border-[#e9dfd4] bg-[#fffdfa] p-3 shadow-[0_3px_18px_rgba(52,39,24,0.035)] sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#352b24]"><SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-[#895335]"/> Refine your search</div>
            <button type="button" onClick={() => setFilters({ ...defaultCatalogFilters })}
              className="min-h-9 rounded-full px-3 text-xs font-medium text-[#815536] hover:bg-[#f5eae0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">Clear filters</button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-[#6e5847]">
              <span className="block">Category</span>
              <span className="relative block">
                <select aria-label="Filter by category" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}
                  className="h-12 w-full appearance-none rounded-xl border border-[#e4d9cc] bg-white pl-3 pr-9 text-[13px] text-[#352b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">
                  {categoryOptions.map(category => <option key={category} value={category}>{category === 'All' ? 'All categories' : category}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-[#947960]"/>
              </span>
            </label>
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-[#6e5847]">
              <span className="block">Price</span>
              <span className="relative block">
                <select aria-label="Filter by price" value={filters.price} onChange={event => setFilters(current => ({ ...current, price: event.target.value as CatalogFilters['price'] }))}
                  className="h-12 w-full appearance-none rounded-xl border border-[#e4d9cc] bg-white pl-3 pr-9 text-[13px] text-[#352b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">
                  <option value="all">Any price</option><option value="under-500">Under ₹500</option>
                  <option value="500-1000">₹500–₹999</option><option value="1000-2500">₹1,000–₹2,499</option>
                  <option value="over-2500">₹2,500 and above</option>
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-[#947960]"/>
              </span>
            </label>
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-[#6e5847]">
              <span className="block">Availability</span>
              <span className="relative block">
                <select aria-label="Filter by availability" value={filters.availability} onChange={event => setFilters(current => ({ ...current, availability: event.target.value as CatalogFilters['availability'] }))}
                  className="h-12 w-full appearance-none rounded-xl border border-[#e4d9cc] bg-white pl-3 pr-9 text-[13px] text-[#352b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">
                  <option value="all">All items</option><option value="orderable">Available to order</option>
                  <option value="made-to-order">Made to order</option><option value="unavailable">Unavailable</option>
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-[#947960]"/>
              </span>
            </label>
            <label className="min-w-0 space-y-1.5 text-xs font-medium text-[#6e5847]">
              <span className="block">Sort by</span>
              <span className="relative block">
                <select aria-label="Sort Explore products" value={filters.sort} onChange={event => setFilters(current => ({ ...current, sort: event.target.value as CatalogFilters['sort'] }))}
                  className="h-12 w-full appearance-none rounded-xl border border-[#e4d9cc] bg-white pl-3 pr-9 text-[13px] text-[#352b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">
                  <option value="default">Default order</option><option value="price-asc">Price: Low to high</option>
                  <option value="price-desc">Price: High to low</option><option value="name-asc">Name: A to Z</option>
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-[#947960]"/>
              </span>
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#887567]">Filters apply to loaded listings in both collections. Sort is within each collection; use Show more to load additional items.</p>
        </div>}
        {exactSku ? <SkuSearchResult sku={exactSku} /> : <>
          <div className="mb-12"><SellerStorefrontProducts searchTerm={searchTerm} filters={filters} /></div>
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}><ProductsPageContent searchTerm={searchTerm} filters={filters} /></Suspense>
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
