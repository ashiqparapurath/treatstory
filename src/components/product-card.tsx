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
    <Card className="group relative h-full overflow-hidden rounded-[22px] border border-white/70 bg-[#2b211d] shadow-[0_5px_18px_rgba(35,29,23,0.065)] transition-shadow duration-300 hover:shadow-[0_12px_28px_rgba(35,29,23,0.12)] sm:rounded-[22px] sm:border sm:border-white/70 sm:bg-[#f1eee9] sm:shadow-[0_5px_18px_rgba(35,29,23,0.065)]">
      <CardHeader className="relative overflow-hidden rounded-[22px] bg-[#f1eee9] p-0 sm:rounded-none">
        <div className="relative aspect-[3/4] w-full touch-pan-y overflow-hidden rounded-[22px] bg-[#efe7dd] sm:aspect-[3/4] sm:rounded-none" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd} onClickCapture={gallery.onClickCapture}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={images[gallery.index]} alt={product.name} sizes={LEGACY_CARD_IMAGE_SIZES}/></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] rounded-b-[22px] bg-gradient-to-t from-[#16110f]/95 via-[#251c17]/55 to-transparent sm:h-3/4 sm:rounded-none sm:from-black/85 sm:via-black/20" />
          <Link href={`/product/${encodeURIComponent(product.id)}`} aria-label={`View details for ${product.name}`} className="absolute inset-0 z-10" />
          
          {images.length > 1 && (
            <>
              <Button variant="ghost" size="icon" aria-label="Previous image" className="absolute left-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-foreground shadow-sm hover:bg-white/50 sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(-1);}}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next image" className="absolute right-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full border border-white/50 bg-white/30 backdrop-blur-xl text-foreground shadow-sm hover:bg-white/50 sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(1);}}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="pointer-events-none absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 gap-1.5 sm:flex">
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
          <div className="pointer-events-none absolute inset-x-2.5 bottom-3 z-20 flex flex-col gap-1.5 text-white sm:hidden">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-[16px] tracking-[-0.025em] drop-shadow-sm">{product.name}</h3>
            <p className="truncate text-[16px] font-bold leading-[21px] tracking-tight drop-shadow-sm">{product.showPrice ? formatPrice(product.price) : 'Price on request'}</p>
            <div className="pointer-events-auto mt-1 grid grid-cols-[44px_minmax(0,1fr)] items-center gap-1.5">
              <Link href="/cart" aria-label="View shopping bag" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-[#faf8f4]/90 text-[#352a22] shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                <ShoppingBag aria-hidden="true" className="h-[17px] w-[17px]" />
              </Link>
              {product.showPrice ? <button type="button" onClick={handleAddToCart} aria-label={'Add ' + product.name + ' to cart'} className="min-h-11 min-w-0 truncate rounded-full border border-white/65 bg-white/15 px-1 text-[9px] font-semibold text-white shadow-[0_3px_12px_rgba(0,0,0,0.14)] backdrop-blur-md min-[375px]:text-[10px] transition-colors hover:bg-white/25 active:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Add to cart</button> : <Link href={'/product/' + encodeURIComponent(product.id)} className="flex min-h-11 min-w-0 items-center justify-center truncate rounded-full border border-white/65 bg-white/15 px-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md">View product</Link>}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
