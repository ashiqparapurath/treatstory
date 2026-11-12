'use client';
import {matchesProductSearch} from '@/lib/catalog-search';
import { normalizeProductSku } from '@/lib/product-sku';
import { SkuSearchResult } from '@/components/sku-search-result';
import { usePagedPublicCatalog } from '@/firebase/firestore/use-paged-public-catalog';

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
import {
  canBuySellerSize, createSellerCardCartItem, sellerCardWeightChoices,
  type SellerCardWeightOption,
} from '@/lib/seller-card-purchase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function SellerStorefrontProducts({ limitCount, searchTerm }: { limitCount?: number; searchTerm?: string }) {
  const db = useFirestore();
  const router = useRouter();
  const { addToCart, startDirectCheckout } = useCart();
  const { toast } = useToast();
  const {data,isLoading,error,retry,hasMore,loadingMore,loadMore}=usePagedPublicCatalog<MarketplaceProduct>('marketplace_products',limitCount);
  const [search, setSearch] = useState('');
  const [pendingChoice, setPendingChoice] = useState<{ product: MarketplaceProduct; intent: 'cart' | 'direct' } | null>(null);
  const [selectedWeightIndex, setSelectedWeightIndex] = useState<number | null>(null);
  const deferredSearch = useDeferredValue(searchTerm ?? search);
  const sku = limitCount || searchTerm !== undefined ? null : normalizeProductSku(deferredSearch);
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => setVisibleCount(24), [deferredSearch]);
  const visible = useMemo(() => {
    const matches = (data ?? []).filter(p => matchesProductSearch(p, deferredSearch));
    return limitCount === undefined ? matches : matches.slice(0, limitCount);
  }, [data, deferredSearch, limitCount]);
  useEffect(()=>{if(!limitCount&&!sku&&deferredSearch.trim()&&visible.length<visibleCount&&hasMore&&!loadingMore&&!error)void loadMore();},[limitCount,sku,deferredSearch,visible.length,visibleCount,hasMore,loadingMore,error,loadMore]);
  const completePurchase = (p: MarketplaceProduct, intent: 'cart' | 'direct', option?: SellerCardWeightOption): string | null => {
    if (!canBuySellerSize(p, option)) {
      toast({ variant: 'destructive', title: 'Size unavailable', description: 'Choose an available weight or contact the seller.' });
      return null;
    }
    const item = createSellerCardCartItem(p, option);
    const quantity = Math.max(1, Math.min(99, p.minimumOrderQuantity ?? 1));
    if (intent === 'direct') {
      startDirectCheckout(item, quantity);
      router.push(`/checkout?buy=direct&product=${encodeURIComponent(p.id)}`, { scroll: true });
    } else {
      addToCart(item, quantity);
      toast({ title: 'Added to your bag', description: `${p.name}${option ? ` · ${option.value} ${option.unit}` : ''}` });
    }
    return cartLineId(item);
  };
  const preparePurchase = (p: MarketplaceProduct, intent: 'cart' | 'direct'): void => {
    const choices = sellerCardWeightChoices(p);
    if (choices.length > 1) {
      setSelectedWeightIndex(null);
      setPendingChoice({ product: p, intent });
      return;
    }
    completePurchase(p, intent, choices[0]);
  };
  const choiceOptions = pendingChoice ? sellerCardWeightChoices(pendingChoice.product) : [];
  const selectedOption = selectedWeightIndex === null ? undefined : choiceOptions[selectedWeightIndex];
  const chosenAvailable = !!pendingChoice && !!selectedOption && canBuySellerSize(pendingChoice.product, selectedOption);
  const formatPrice = (price: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(price);
  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={limitCount || 8} />;
  if (!data?.length) return null;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">From independent creators</p><h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Made with a little more love</h2></div><span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Store className="h-4 w-4" />TreatStory sellers</span></div>
    {!limitCount && searchTerm === undefined && <div className="relative max-w-sm"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creator products by name or SKU…" aria-label="Search creator products" className="rounded-full bg-white pl-11" /></div>}
    {sku ? <SkuSearchResult sku={sku} /> : visible.length === 0 ? <p className="text-sm text-muted-foreground">{loadingMore||hasMore?'Searching more creations…':'No matching creator products.'}</p> : (
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
        {visible.slice(0, visibleCount).map(p => <SellerProductCard key={p.id} product={p}
          addToBag={product => preparePurchase(product, 'cart')}
          buyNow={product => preparePurchase(product, 'direct')}
        />)}
      </div>
    )}
    {!sku&&!limitCount&&(visibleCount<visible.length||hasMore)&&<button type="button" disabled={loadingMore} onClick={async()=>{if(visibleCount>=visible.length)await loadMore();setVisibleCount(n=>n+24);}} className="min-h-11 rounded-xl border px-5 text-sm">{loadingMore?'Loading creations…':'Show more creations'}</button>}
    <p className="text-xs text-muted-foreground">Buy now takes you directly to checkout. Cash on Delivery is subject to seller confirmation.</p>
    <Dialog open={!!pendingChoice} onOpenChange={open => {
      if (!open) { setPendingChoice(null); setSelectedWeightIndex(null); }
    }}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-3xl border-0 bg-[#fcfaf6] p-5 shadow-2xl sm:p-7">
        <DialogHeader>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a7d58]">Choose your size</p>
          <DialogTitle className="pr-6 text-left text-xl font-semibold leading-tight tracking-tight text-[#30271f]">
            {pendingChoice?.product.name}
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-6">
            Select a weight and see its exact price before {pendingChoice?.intent === 'direct' ? 'checkout' : 'adding to your bag'}.
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="Available weights and sizes" className="mt-1 grid max-h-[45dvh] gap-2 overflow-y-auto">
          {choiceOptions.map((option, index) => {
            const valid = !!pendingChoice && canBuySellerSize(pendingChoice.product, option);
            return (
              <button key={index} type="button" disabled={!valid}
                onClick={() => setSelectedWeightIndex(index)}
                aria-pressed={selectedWeightIndex === index}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9a805f] ${selectedWeightIndex === index ? 'border-[#31291f] bg-[#f0e9df]' : 'border-[#e4dacd] bg-white'} ${!valid ? 'cursor-not-allowed opacity-45' : 'hover:border-[#9b805d]'}`}>
                <span className="text-sm font-semibold text-[#30271f]">{option.value} {option.unit}</span>
                <span className="text-right text-sm font-semibold text-[#30271f]">
                  {formatPrice(option.price ?? pendingChoice?.product.price ?? 0)}
                  {!valid && <span className="block text-[11px] font-normal text-[#a14b43]">Unavailable</span>}
                </span>
              </button>
            );
          })}
        </div>
        {pendingChoice?.product.minimumOrderQuantity && pendingChoice.product.minimumOrderQuantity > 1 &&
          <p className="text-xs text-[#7a6b5b]">Minimum order: {pendingChoice.product.minimumOrderQuantity} units</p>}
        <Button type="button" disabled={!chosenAvailable || !pendingChoice} onClick={() => {
          if (!pendingChoice || !selectedOption) return;
          const { product, intent } = pendingChoice;
          if (completePurchase(product, intent, selectedOption)) {
            setPendingChoice(null);
            setSelectedWeightIndex(null);
          }
        }} className="min-h-12 w-full rounded-full bg-[#29251f] text-white hover:bg-[#4e4237]">
          {pendingChoice?.intent === 'direct' ? 'Continue to checkout' : 'Add selected size to bag'}
        </Button>
      </DialogContent>
    </Dialog>
  </section>;
}
