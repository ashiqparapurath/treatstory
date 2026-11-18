"use client";
import{IMAGE_FALLBACK,LEGACY_CARD_IMAGE_SIZES,productPhotos}from'@/lib/image-source';

import { FavoriteToggle } from '@/components/favorite-toggle';

import type { Product } from '@/lib/products';
import { Card, CardHeader } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { useProductGallery } from '@/hooks/use-product-gallery';
import { ProductImage } from '@/components/product-image';

interface ProductCardProps { product: Product; }

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const { toast } = useToast();
  const fallbackImage = IMAGE_FALLBACK;
  const images = productPhotos(product.imageUrls);
  if (!images.length) images.push(fallbackImage);
  const gallery = useProductGallery(images.length);

  const formatPrice = (price: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

  const handleAddToCart = () => {
    addToCart(product);
    toast({ title: "Added to your bag", description: `${product.name} is waiting in your TreatStory bag.` });
  };


  return (
    <Card className="group relative h-full overflow-hidden rounded-[20px] border border-[#eee6de] bg-white shadow-[0_5px_18px_rgba(35,29,23,0.065)] transition-shadow duration-300 hover:shadow-[0_12px_28px_rgba(35,29,23,0.12)] sm:rounded-[22px] sm:border-white/70 sm:bg-[#f1eee9]">
      <CardHeader className="relative overflow-hidden rounded-none bg-[#f1eee9] p-0">
        <div className="relative aspect-[1/1.06] w-full touch-pan-y overflow-hidden bg-[#efe7dd] sm:aspect-[3/4]" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd} onClickCapture={gallery.onClickCapture}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={images[gallery.index]} alt={product.name} sizes={LEGACY_CARD_IMAGE_SIZES}/></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3/4 bg-gradient-to-t from-black/85 via-black/20 to-transparent sm:block" />
          <Link href={`/product/${encodeURIComponent(product.id)}`} aria-label={`View details for ${product.name}`} className="absolute inset-0 z-10" />
          <span className={`pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-4.5rem)] truncate rounded-full border border-white/80 bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-[#754328] shadow-sm backdrop-blur-sm sm:hidden ${product.category.length > 10 ? 'max-[389px]:hidden' : ''}`}>{product.category}</span>
          {images.length > 1 && (
            <>
              <Button variant="ghost" size="icon" aria-label="Previous image" className="absolute left-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-foreground shadow-sm hover:bg-white/50 sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(-1);}}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next image" className="absolute right-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-foreground shadow-sm hover:bg-white/50 sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(1);}}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 sm:bottom-auto sm:top-3">
                {images.map((_, index) => <span key={index} className={`h-1.5 rounded-full shadow-sm transition-all ${index === gallery.index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />)}
              </div>
            </>
          )}
      <div className="absolute right-2 top-2 z-20 drop-shadow-sm"><FavoriteToggle compact productId={product.id} title={product.name} imageUrl={images[0]} /></div>
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 hidden flex-col gap-2.5 text-white sm:inset-x-4 sm:bottom-4 sm:flex">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug drop-shadow-sm sm:text-base">{product.name}</h3>
            {product.description && <p className="hidden text-[11px] leading-snug text-white/85 sm:line-clamp-2 sm:text-xs">{product.description}</p>}
            <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-white">{product.showPrice ? <p className="text-lg font-semibold tracking-tight sm:text-xl">{formatPrice(product.price)}</p> : <p className="text-xs font-medium">Price on request</p>}</div>
            <Button onClick={handleAddToCart} size="icon" aria-label={`Add ${product.name} to bag`} className="pointer-events-auto relative z-20 h-11 w-11 shrink-0 rounded-full bg-white text-[#29251f] shadow-sm transition-colors hover:bg-[#f4eee5]">
            <ShoppingBag className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <div className="flex min-h-[124px] flex-col justify-between gap-2.5 px-3 pb-3.5 pt-3 sm:hidden">
        <div className="space-y-1"><p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[#9d826c]">{product.category}</p><Link href={`/product/${encodeURIComponent(product.id)}`} className="line-clamp-2 text-[13px] font-semibold leading-[19px] text-[#30251c]">{product.name}</Link></div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-[#754328]">{product.showPrice ? formatPrice(product.price) : 'Price on request'}</span>
          <button type="button" disabled={!product.showPrice} onClick={handleAddToCart} aria-label={`Add ${product.name} to bag`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#754328] text-white shadow-[0_3px_10px_rgba(69,37,21,0.16)] transition-colors active:bg-[#57331f] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]"><ShoppingBag className="h-4 w-4"/></button>
        </div>
      </div>
    </Card>
  );
}
