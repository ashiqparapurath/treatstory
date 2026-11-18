'use client';import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePagedPublicCatalog } from '@/firebase/firestore/use-paged-public-catalog';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

type ExploreOption = { value: string; label: string };
function ExploreFilterControl({ id, label, ariaLabel, value, options, onValueChange, compact = false }: {
  id: string; label: string; ariaLabel: string; value: string; compact?: boolean;
  options: ExploreOption[]; onValueChange: (value: string) => void;
}) {
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className={compact ? 'sr-only' : 'block text-xs font-medium text-[#6e5847]'}>{label}</label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="h-12 w-full min-w-0 rounded-xl border-[#e4d9cc] bg-white px-3 text-[13px] text-[#352b24] focus-visible:ring-[#895335]">
        <SelectValue/>
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6} className="max-w-[calc(100vw-2rem)]">
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

const priceOptions: ExploreOption[] = [
  {value:'all',label:'Any price'}, {value:'under-500',label:'Under ₹500'},
  {value:'500-1000',label:'₹500–₹999'}, {value:'1000-2500',label:'₹1,000–₹2,499'},
  {value:'over-2500',label:'₹2,500 and above'},
];
const availabilityOptions: ExploreOption[] = [
  {value:'all',label:'All items'}, {value:'orderable',label:'Available to order'},
  {value:'made-to-order',label:'Made to order'}, {value:'unavailable',label:'Unavailable'},
];
const sortOptions: ExploreOption[] = [
  {value:'default',label:'Default order'}, {value:'price-asc',label:'Price: Low to high'},
  {value:'price-desc',label:'Price: High to low'}, {value:'name-asc',label:'Name: A to Z'},
];

/** Keep mobile filtering one tap away, without occupying the top of the product listing. */
function MobileExploreFilters({ filters, categories, onUpdate, onClear }: {
  filters: CatalogFilters;
  categories: string[];
  onUpdate: (change: Partial<CatalogFilters>) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeChips = [
    ...(filters.category !== 'All' ? [{key:'category' as const,label:filters.category}] : []),
    ...(filters.price !== 'all' ? [{key:'price' as const,label:priceOptions.find(option=>option.value===filters.price)?.label ?? 'Price'}] : []),
    ...(filters.availability !== 'all' ? [{key:'availability' as const,label:availabilityOptions.find(option=>option.value===filters.availability)?.label ?? 'Availability'}] : []),
  ];
  const activeCount = activeChips.length;
  const clearOne = (key: 'category' | 'price' | 'availability') => {
    if(key === 'category') onUpdate({category:'All'});
    if(key === 'price') onUpdate({price:'all'});
    if(key === 'availability') onUpdate({availability:'all'});
  };
  return <section aria-label="Mobile Explore filters" className="mb-7 md:hidden">
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" aria-controls="explore-mobile-filter-panel" aria-expanded={expanded}
        onClick={()=>setExpanded(value=>!value)}
        className="inline-flex h-12 min-w-[126px] shrink-0 items-center justify-center gap-2 rounded-full bg-[#754328] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#653820] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#754328]">
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4"/>
        Filters {activeCount > 0 && <span aria-label={`${activeCount} active filters`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[11px]">{activeCount}</span>}
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
      </button>
      <div className="min-w-0 flex-1">
        <ExploreFilterControl id="explore-sort-mobile" label="Sort by" compact ariaLabel="Sort Explore products"
          value={filters.sort} onValueChange={value=>onUpdate({sort:value as CatalogFilters['sort']})}
          options={sortOptions}/>
      </div>
    </div>
    <div id="explore-mobile-filter-panel" className={expanded ? 'mt-3 rounded-[20px] border border-[#e9dfd4] bg-[#fffdfa] p-4 shadow-[0_6px_22px_rgba(52,39,24,0.05)]' : 'hidden'}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#352b24]">Refine results</h2>
        {activeCount > 0 && <button type="button" onClick={onClear} className="min-h-10 px-2 text-xs font-medium text-[#815536] underline underline-offset-4">Clear filters</button>}
      </div>
      <div className="grid gap-4">
        <ExploreFilterControl id="explore-category-mobile" label="Category" ariaLabel="Filter by category"
          value={filters.category} onValueChange={value=>onUpdate({category:value})}
          options={categories.map(category=>({value:category,label:category==='All'?'All categories':category}))}/>
        <ExploreFilterControl id="explore-price-mobile" label="Price" ariaLabel="Filter by price"
          value={filters.price} onValueChange={value=>onUpdate({price:value as CatalogFilters['price']})}
          options={priceOptions}/>
        <ExploreFilterControl id="explore-availability-mobile" label="Availability" ariaLabel="Filter by availability"
          value={filters.availability} onValueChange={value=>onUpdate({availability:value as CatalogFilters['availability']})}
          options={availabilityOptions}/>
      </div>
      <button type="button" onClick={()=>setExpanded(false)}
        className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-[#754328] px-5 text-sm font-semibold text-white hover:bg-[#653820] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#754328]">
        Show results
      </button>
    </div>
    {activeCount > 0 && <div aria-label="Active filters" className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
      {activeChips.map(chip=><button key={chip.key} type="button" aria-label={`Remove ${chip.label} filter`} onClick={()=>clearOne(chip.key)}
        className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-[#e5d8cb] bg-[#fffaf4] px-3 text-[11px] font-medium text-[#6d513c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#754328]">
        <span className="truncate">{chip.label}</span><X aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>
      </button>)}
      <button type="button" onClick={onClear} className="min-h-9 px-2 text-[11px] font-medium text-[#8d6245] underline underline-offset-4">Clear all</button>
    </div>}
  </section>;
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
        {!exactSku && <MobileExploreFilters filters={filters} categories={categoryOptions}
          onUpdate={change=>setFilters(current=>({...current,...change}))}
          onClear={()=>setFilters({ ...defaultCatalogFilters })}/>}
        {!exactSku && <div aria-label="Refine Explore products" className="mb-8 hidden rounded-[22px] border border-[#e9dfd4] bg-[#fffdfa] p-3 shadow-[0_3px_18px_rgba(52,39,24,0.035)] md:block md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#352b24]"><SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-[#895335]"/> Refine your search</div>
            <button type="button" onClick={() => setFilters({ ...defaultCatalogFilters })}
              className="min-h-9 rounded-full px-3 text-xs font-medium text-[#815536] hover:bg-[#f5eae0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#895335]">Clear filters</button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ExploreFilterControl id="explore-category" label="Category" ariaLabel="Filter by category"
              value={filters.category} onValueChange={value => setFilters(current => ({ ...current, category: value }))}
              options={categoryOptions.map(category => ({ value: category, label: category === 'All' ? 'All categories' : category }))}/>
            <ExploreFilterControl id="explore-price" label="Price" ariaLabel="Filter by price"
              value={filters.price} onValueChange={value => setFilters(current => ({ ...current, price: value as CatalogFilters['price'] }))}
              options={priceOptions}/>
            <ExploreFilterControl id="explore-availability" label="Availability" ariaLabel="Filter by availability"
              value={filters.availability} onValueChange={value => setFilters(current => ({ ...current, availability: value as CatalogFilters['availability'] }))}
              options={availabilityOptions}/>
            <ExploreFilterControl id="explore-sort" label="Sort by" ariaLabel="Sort Explore products"
              value={filters.sort} onValueChange={value => setFilters(current => ({ ...current, sort: value as CatalogFilters['sort'] }))}
              options={sortOptions}/>
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
