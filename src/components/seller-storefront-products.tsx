'use client';
import { usePublicCatalog } from '@/firebase/firestore/use-public-catalog';

import { collection, query, where, limit } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { useMemo, useState, useEffect, useDeferredValue } from 'react';
import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { SellerProductCard } from '@/components/seller-product-card';
import { Input } from '@/components/ui/input';
import { Search, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart, cartLineId } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';

export function SellerStorefrontProducts({ limitCount }: { limitCount?: number }) {
  const db = useFirestore();
  const router = useRouter();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? query(collection(db, 'marketplace_products'), where('status', '==', 'published'), ...(limitCount ? [limit(limitCount)] : [])) : null, [db, limitCount]);
  const { data, isLoading, error, retry } = usePublicCatalog<MarketplaceProduct>(ref);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => setVisibleCount(24), [deferredSearch]);
  const visible = useMemo(() => (data ?? []).filter(p => p.name.toLowerCase().includes(deferredSearch.toLowerCase()) || p.category.toLowerCase().includes(deferredSearch.toLowerCase())).slice(0, limitCount), [data, deferredSearch, limitCount]);
  const addProduct = (p: MarketplaceProduct): string | null => {
    if (p.weightOptions?.length) {
      router.push(`/product/seller:${encodeURIComponent(p.id)}`);
      toast({ title: 'Choose your size', description: 'Select a weight or size, then add it to your bag.' });
      return null;
    }
    if (p.availability === 'unavailable' || (p.availability === 'available' && (p.stockQuantity ?? 0) <= 0)) {
      toast({ variant: 'destructive', title: 'Out of stock', description: 'Please explore other creations.' });
      return null;
    }
    const item = { id: `seller:${p.id}`, sellerId: p.sellerId, name: p.name, description: p.description,
      category: p.category, categoryId: p.category, price: p.price, imageUrls: p.imageUrls,
      showPrice: p.showPrice, minimumOrderQuantity: p.minimumOrderQuantity };
    addToCart(item, Math.max(1, Math.min(99, p.minimumOrderQuantity ?? 1)));
    return cartLineId(item);
  };
  if (error) return <LoadError retry={retry} />;
  if (isLoading) return <ProductGridSkeleton count={limitCount || 8} />;
  if (!data?.length) return null;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">From independent creators</p><h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Made with a little more love</h2></div><span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Store className="h-4 w-4" />TreatStory sellers</span></div>
    {!limitCount && <div className="relative max-w-sm"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creator products…" aria-label="Search creator products" className="rounded-full bg-white pl-11" /></div>}
    {visible.length === 0 ? <p className="text-sm text-muted-foreground">No matching creator products.</p> : (
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
        {visible.slice(0, visibleCount).map(p => <SellerProductCard key={p.id} product={p}
          addToBag={product => { if (addProduct(product)) toast({ title: 'Added to your bag', description: product.name }); }}
          buyNow={product => { const line = addProduct(product); if (line) router.push(`/checkout?product=${encodeURIComponent(product.id)}&line=${encodeURIComponent(line)}`); }}
        />)}
      </div>
    )}
    {visibleCount < visible.length && <button type="button" onClick={() => setVisibleCount(n => n + 24)} className="min-h-11 rounded-xl border px-5 text-sm">Show more creations</button>}
    <p className="text-xs text-muted-foreground">Buy now takes you directly to checkout. Cash on Delivery is subject to seller confirmation.</p>
  </section>;
}
