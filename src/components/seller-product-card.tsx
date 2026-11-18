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
  return <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-[#eee5dc] bg-white shadow-[0_5px_18px_rgba(35,29,23,0.055)] transition-shadow duration-300 hover:shadow-[0_12px_28px_rgba(35,29,23,0.12)] sm:rounded-[22px] sm:border-white/70 sm:bg-[#f1eee9]">
    <div className="relative aspect-[4/4.3] touch-pan-y overflow-hidden bg-[#efe7dd] sm:aspect-[3/4]" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd} onClickCapture={gallery.onClickCapture}>
      <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}>
        <ProductImage src={photos[gallery.index]} alt={`${p.name} — photo ${gallery.index + 1}`} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3/4 bg-gradient-to-t from-black/85 via-black/20 to-transparent sm:block"/>
      {p.availability === 'made-to-order' && <span className="pointer-events-none absolute bottom-2 left-2 z-20 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#754328] shadow-sm backdrop-blur-sm sm:hidden">Made to order</span>}
      <Link href={`/product/seller:${encodeURIComponent(p.id)}`} aria-label={`View details and photos for ${p.name}`} className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#c9ae85]"/>
      <div className="absolute right-2 top-2 z-20 drop-shadow-sm"><FavoriteToggle compact productId={'seller:' + p.id} title={p.name} imageUrl={photos[0]} /></div>
      {photos.length > 1 && <>
        <button type="button" onClick={() => gallery.move(-1)} aria-label={`Previous photo of ${p.name}`} className="absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-[#29251f] shadow transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><ChevronLeft className="h-4 w-4"/></button>
        <button type="button" onClick={() => gallery.move(1)} aria-label={`Next photo of ${p.name}`} className="absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-[#29251f] shadow transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><ChevronRight className="h-4 w-4"/></button>
        <div aria-label={`Photo ${gallery.index + 1} of ${photos.length}`} className="pointer-events-none absolute left-1/2 top-11 z-10 flex -translate-x-1/2 gap-1">{photos.slice(0,10).map((_,n) => <span key={n} className={`h-1.5 rounded-full bg-white ${gallery.index === n ? 'w-3' : 'w-1.5 opacity-60'}`} />)}</div>
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
    </div>
    <div className="flex min-h-[124px] flex-col justify-between gap-2.5 px-3.5 pb-3.5 pt-3 sm:hidden">
      <div className="space-y-1"><p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[#9d826c]">{p.category}</p><h3 className="line-clamp-2 text-[13px] font-semibold leading-[19px] text-[#30251c]">{p.name}</h3></div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-[#754328]">{p.showPrice ? `${hasDifferentPrices ? 'From ' : ''}${money(lowestPrice)}` : 'Price on request'}</span>
        <button type="button" disabled={!available} onClick={() => addToBag(p)} aria-label={`Add ${p.name} to bag`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#754328] text-white shadow-[0_3px_10px_rgba(69,37,21,0.16)] transition-colors active:bg-[#57331f] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]"><ShoppingBag className="h-4 w-4"/></button>
      </div>
    </div>
  </article>;
}
