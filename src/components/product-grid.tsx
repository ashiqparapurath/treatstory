"use client";
import {matchesProductSearch} from '@/lib/catalog-search';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';

import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import type { Product } from '@/lib/products';
import { ProductCard } from '@/components/product-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface ProductGridContainerProps { products: Product[]; hasMore?: boolean; loadingMore?: boolean; loadMore?: () => Promise<void>; }
interface ProductGridProps extends ProductGridContainerProps { categories: string[]; initialCategory: string | null; }

function ProductGrid({ products, categories, initialCategory, hasMore, loadingMore, loadMore }: ProductGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'All');

  const deferredSearch = useDeferredValue(searchTerm);
  const sku = normalizeProductSku(deferredSearch);
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => setSelectedCategory(initialCategory || 'All'), [initialCategory]);
  useEffect(() => setVisibleCount(24), [deferredSearch, selectedCategory]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products
      .filter((product) => selectedCategory === 'All' || product.category === selectedCategory)
      .filter((product) => matchesProductSearch(product,deferredSearch,true));
  }, [products, selectedCategory, deferredSearch]);

  useEffect(() => {
    if (!sku && (deferredSearch || selectedCategory !== 'All') && filteredProducts.length < visibleCount && hasMore && !loadingMore) void loadMore?.();
  }, [deferredSearch, sku, selectedCategory, filteredProducts.length, visibleCount, hasMore, loadingMore, loadMore]);

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 border-b border-[#e9e2d8] pb-6 lg:mb-9 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[340px]">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by product name or SKU..."
            aria-label="Search products"
            className="h-12 rounded-full border-[#e6ded2] bg-white pl-11 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-[#b99a70]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <SlidersHorizontal className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
          {categories.map((category) => (
            <Button
              key={category}
              variant="outline"
              aria-pressed={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
              className={`h-9 shrink-0 rounded-full px-4 text-[11px] font-semibold capitalize tracking-wide transition-all ${selectedCategory === category ? 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background' : 'border-[#e6ded2] bg-transparent text-muted-foreground hover:border-foreground hover:bg-transparent hover:text-foreground'}`}
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{sku ? 'Matching product code ' + sku : <><span className="font-semibold text-foreground">{filteredProducts.length}</span> pieces to explore</>}</p>
        <p className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">Curated for everyday living</p>
      </div>

      {sku ? <SkuSearchResult sku={sku} /> : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {filteredProducts.slice(0, visibleCount).map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[#ded4c7] bg-white/60 px-5 py-20 text-center">
          <p className="eyebrow text-[#b28f62]">{loadingMore ? 'Searching more products…' : 'Nothing here just yet'}</p>
          <h2 className="mt-3 text-2xl font-medium tracking-tight">No pieces found</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try another search or choose a different category.</p>
        </div>
      )}
      {!sku && visibleCount < filteredProducts.length && <Button variant="outline" className="mx-auto mt-8 flex min-h-11" onClick={() => setVisibleCount(n => n + 24)}>Show more products</Button>}
    </div>
  );
}

export function ProductGridContainer({ products, ...paging }: ProductGridContainerProps) {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category');
  const categories = useMemo(() => {
    if (!products || products.length === 0) return ['All'];
    return ['All', ...Array.from(new Set(products.map((p) => p.category).filter((value):value is string=>typeof value==='string')))];
  }, [products]);
  return <ProductGrid products={products} categories={categories} initialCategory={initialCategory} {...paging} />;
}
