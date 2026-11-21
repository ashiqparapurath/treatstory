'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { SellerProductCard } from '@/components/seller-product-card';
import {
  canBuySellerSize, createSellerCardCartItem, sellerCardWeightChoices,
  type SellerCardWeightOption,
} from '@/lib/seller-card-purchase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const formatPrice = (price: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(price);

/**
 * One set of seller product cards and purchase actions for Explore, home
 * collections, and individual storefronts.
 */
export function SellerProductCollection({ products }: { products: MarketplaceProduct[] }) {
  const router = useRouter();
  const { addToCart, startDirectCheckout } = useCart();
  const { toast } = useToast();
  const [pendingChoice, setPendingChoice] = useState<{
    product: MarketplaceProduct;
    intent: 'cart' | 'direct';
  } | null>(null);
  const [selectedWeightIndex, setSelectedWeightIndex] = useState<number | null>(null);

  const completePurchase = (
    product: MarketplaceProduct,
    intent: 'cart' | 'direct',
    option?: SellerCardWeightOption,
  ): boolean => {
    if (!canBuySellerSize(product, option)) {
      toast({
        variant: 'destructive',
        title: 'Size unavailable',
        description: 'Choose an available weight or contact the seller.',
      });
      return false;
    }
    const item = createSellerCardCartItem(product, option);
    const quantity = Math.max(1, Math.min(99, product.minimumOrderQuantity ?? 1));
    if (intent === 'direct') {
      startDirectCheckout(item, quantity);
      router.push('/checkout?buy=direct&product=' + encodeURIComponent(product.id), { scroll: true });
    } else {
      addToCart(item, quantity);
      toast({
        title: 'Added to your bag',
        description: product.name + (option ? ' · ' + option.value + ' ' + option.unit : ''),
      });
    }
    return true;
  };

  const preparePurchase = (product: MarketplaceProduct, intent: 'cart' | 'direct') => {
    if (!product.showPrice) {
      router.push('/custom-orders?seller=' + encodeURIComponent(product.sellerId) + '&product=' + encodeURIComponent(product.id));
      return;
    }
    const choices = sellerCardWeightChoices(product);
    if (choices.length > 1) {
      setSelectedWeightIndex(null);
      setPendingChoice({ product, intent });
      return;
    }
    completePurchase(product, intent, choices[0]);
  };

  const choiceOptions = pendingChoice ? sellerCardWeightChoices(pendingChoice.product) : [];
  const selectedOption = selectedWeightIndex === null ? undefined : choiceOptions[selectedWeightIndex];
  const chosenAvailable = !!pendingChoice && !!selectedOption &&
    canBuySellerSize(pendingChoice.product, selectedOption);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
        {products.map(product => (
          <SellerProductCard
            key={product.id}
            product={product}
            addToBag={item => preparePurchase(item, 'cart')}
            buyNow={item => preparePurchase(item, 'direct')}
          />
        ))}
      </div>
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
                  className={'flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9a805f] ' +
                    (selectedWeightIndex === index ? 'border-[#31291f] bg-[#f0e9df]' : 'border-[#e4dacd] bg-white') +
                    (!valid ? ' cursor-not-allowed opacity-45' : ' hover:border-[#9b805d]')}>
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
    </>
  );
}
