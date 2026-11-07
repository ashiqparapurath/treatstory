"use client";

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
  const fallbackImage = "https://placehold.co/600x600/f1eee8/756b60?text=TreatStory";
  const images = (product.imageUrls ?? []).flatMap(url => url.split(/\r?\n/)).map(url => url.trim()).filter(Boolean);
  if (!images.length) images.push(fallbackImage);
  const gallery = useProductGallery(images.length);

  const formatPrice = (price: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

  const handleAddToCart = () => {
    addToCart(product);
    toast({ title: "Added to your bag", description: `${product.name} is waiting in your TreatStory bag.` });
  };


  return (
    <Card className="group relative h-full overflow-hidden rounded-[22px] border border-white/70 bg-[#f1eee9] shadow-[0_6px_24px_rgba(35,29,23,0.09)] transition-shadow duration-300 hover:shadow-[0_16px_36px_rgba(35,29,23,0.15)]">
      <CardHeader className="relative overflow-hidden rounded-none bg-[#f1eee9] p-0">
        <div className="relative aspect-[3/4] w-full touch-pan-y overflow-hidden" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd} onClickCapture={gallery.onClickCapture}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={images[gallery.index]} alt={product.name} /></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <Link href={`/product/${encodeURIComponent(product.id)}`} aria-label={`View details for ${product.name}`} className="absolute inset-0 z-10" />
          {images.length > 1 && (
            <>
              <Button variant="ghost" size="icon" aria-label="Previous image" className="absolute left-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/85 text-foreground shadow-sm hover:bg-white sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(-1);}}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next image" className="absolute right-2 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/85 text-foreground shadow-sm hover:bg-white sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={e => {e.preventDefault();e.stopPropagation();gallery.move(1);}}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="absolute top-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {images.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === gallery.index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />)}
              </div>
            </>
          )}
          <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-20px)] truncate rounded-md bg-white/95 px-2.5 py-1 text-[10px] font-medium text-[#51463a] shadow-sm">{product.category}</span>
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col gap-2.5 text-white sm:inset-x-4 sm:bottom-4">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug drop-shadow-sm sm:text-base">{product.name}</h3>
            {product.description && <p className="hidden line-clamp-2 text-[11px] leading-snug text-white/85 sm:block sm:text-xs">{product.description}</p>}
            <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-white">{product.showPrice ? <p className="text-lg font-semibold tracking-tight sm:text-xl">{formatPrice(product.price)}</p> : <p className="text-xs font-medium">Price on request</p>}</div>
            <Button onClick={handleAddToCart} size="icon" aria-label={`Add ${product.name} to bag`} className="pointer-events-auto relative z-20 h-11 w-11 shrink-0 rounded-full bg-white text-[#29251f] shadow-sm transition-colors hover:bg-[#f4eee5]">
            <ShoppingBag className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
