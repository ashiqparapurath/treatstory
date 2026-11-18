'use client';
import{productPhotos}from'@/lib/image-source';

import { FavoriteToggle } from '@/components/favorite-toggle';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import { ProductImage } from '@/components/product-image';
import { useProductGallery } from '@/hooks/use-product-gallery';
import type { MarketplaceProduct } from '@/lib/marketplace-types';

const money = (price: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

export function SellerProductCard({ product: p, addToBag, buyNow }: {
  product: MarketplaceProduct;
  addToBag: (product: MarketplaceProduct) => void;
  buyNow: (product: MarketplaceProduct) => void;
}) {
  const photos = productPhotos(p.imageUrls);
  const gallery = useProductGallery(photos.length);
  const sizeOptions = p.weightOptions ?? [];
  const priceChoices = sizeOptions.length
    ? sizeOptions.map(option => option.price ?? p.price)
    : [p.price];
  const lowestPrice = Math.min(...priceChoices);
  const hasDifferentPrices = priceChoices.some(price => price !== lowestPrice);
  const minOrder = Math.max(1, p.minimumOrderQuantity || 1);
  const enoughStock = sizeOptions.length
    ? sizeOptions.some(option => (option.stockQuantity ?? p.stockQuantity ?? 0) >= minOrder)
    : (p.stockQuantity ?? 0) >= minOrder;
  const available = p.availability !== 'unavailable' && p.showPrice &&
    (p.availability === 'made-to-order' || enoughStock);
  return <article className="group relative min-w-0 overflow-hidden rounded-[26px] border border-white/35 bg-[#2b211d] shadow-[0_12px_24px_rgba(35,29,23,0.17)] transition-shadow duration-300 hover:shadow-[0_12px_28px_rgba(35,29,23,0.12)] sm:rounded-[22px] sm:border sm:border-white/70 sm:bg-[#f1eee9] sm:shadow-[0_5px_18px_rgba(35,29,23,0.065)]">
    <div className="relative aspect-[3/4] touch-pan-y overflow-hidden rounded-[26px] bg-[#efe7dd] sm:aspect-[3/4] sm:rounded-none" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd} onClickCapture={gallery.onClickCapture}>
      <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}>
        <ProductImage src={photos[gallery.index]} alt={`${p.name} — photo ${gallery.index + 1}`} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] rounded-b-[26px] bg-gradient-to-t from-[#16110f]/95 via-[#251c17]/55 to-transparent sm:h-3/4 sm:rounded-none sm:from-black/85 sm:via-black/20"/>
      <Link href={`/product/seller:${encodeURIComponent(p.id)}`} aria-label={`View details and photos for ${p.name}`} className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#c9ae85]"/>
      
      <div className="absolute right-2 top-2 z-20 drop-shadow-sm"><FavoriteToggle compact productId={'seller:' + p.id} title={p.name} imageUrl={photos[0]} /></div>
      {photos.length > 1 && <>
        <button type="button" onClick={() => gallery.move(-1)} aria-label={`Previous photo of ${p.name}`} className="absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-[#29251f] shadow transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><ChevronLeft className="h-4 w-4"/></button>
        <button type="button" onClick={() => gallery.move(1)} aria-label={`Next photo of ${p.name}`} className="absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-[#29251f] shadow transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><ChevronRight className="h-4 w-4"/></button>
        <div aria-label={`Photo ${gallery.index + 1} of ${photos.length}`} className="pointer-events-none absolute left-1/2 top-11 z-20 hidden -translate-x-1/2 gap-1 sm:flex">{photos.slice(0,10).map((_,n) => <span key={n} className={`h-1.5 rounded-full bg-white ${gallery.index === n ? 'w-3' : 'w-1.5 opacity-60'}`} />)}</div>
      </>}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 hidden flex-col gap-2 text-white sm:inset-x-4 sm:bottom-4 sm:flex">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug drop-shadow-sm sm:text-base">{p.name}</h3>
        {p.description && <p className="hidden text-[11px] leading-snug text-white/85 sm:line-clamp-2 sm:text-xs">{p.description}</p>}
        <p className="text-lg font-semibold tracking-tight sm:text-xl">{p.showPrice ? `${hasDifferentPrices ? 'From ' : ''}${money(lowestPrice)}` : 'Price on request'}</p>
        <div className="pointer-events-auto relative z-20 flex gap-2">
          <button type="button" disabled={!available} onClick={() => addToBag(p)} aria-label={`Add ${p.name} to bag`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#29251f] transition hover:bg-[#f4eee5] disabled:opacity-60 sm:h-10 sm:w-auto sm:flex-1 sm:gap-2 sm:px-3"><ShoppingBag className="h-4 w-4"/><span className="hidden text-[11px] font-semibold sm:inline">Add to bag</span></button>
          <button type="button" disabled={!available} onClick={() => buyNow(p)} className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-full border border-white/70 bg-white/15 px-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25 disabled:opacity-60">{available ? 'Buy now' : 'Unavailable'}</button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-2.5 bottom-3 z-20 flex flex-col gap-1.5 text-white sm:hidden">
        <h3 className="line-clamp-2 text-[12px] font-semibold leading-[16px] tracking-[-0.025em] drop-shadow-sm">{p.name}</h3>
        <p className="truncate text-[16px] font-bold leading-[21px] tracking-tight drop-shadow-sm">{p.showPrice ? (hasDifferentPrices ? 'From ' : '') + money(lowestPrice) : 'Price on request'}</p>
        <div className="pointer-events-auto mt-1 grid grid-cols-[44px_minmax(0,1fr)] items-center gap-1.5">
          <button type="button" disabled={!available} onClick={() => addToBag(p)} aria-label={'Add ' + p.name + ' to bag'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-[#faf8f4]/90 text-[#352a22] shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-75">
            <ShoppingBag aria-hidden="true" className="h-[17px] w-[17px]" />
          </button>
          <button type="button" disabled={!available} onClick={() => buyNow(p)} aria-label={available ? 'Buy ' + p.name + ' now' : p.name + ' unavailable'} className="min-h-11 min-w-0 truncate rounded-full border border-white/65 bg-white/15 px-1 text-[9px] font-semibold text-white shadow-[0_3px_12px_rgba(0,0,0,0.14)] backdrop-blur-md min-[375px]:text-[10px] transition-colors enabled:hover:bg-white/25 enabled:active:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:text-white/70">{available ? 'Buy now' : 'Unavailable'}</button>
        </div>
      </div>
    </div>
  </article>;
}
