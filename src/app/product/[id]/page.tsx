'use client';
import{DETAIL_IMAGE_SIZES,productPhotos}from'@/lib/image-source';
import{ProductShareButton}from'@/components/product-share-button';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCart, cartLineId } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { ActionError, getErrorNotice } from '@/lib/user-notices';
import { MobileBuyBar } from '@/components/mobile-buy-bar';
import { useScrollToTop } from '@/hooks/use-scroll-to-top';
import { ProductImage } from '@/components/product-image';
import { FavoriteToggle } from '@/components/favorite-toggle';
import { ProductReviews } from '@/components/product-reviews';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MarketplaceProduct, Seller } from '@/lib/marketplace-types';
import type { Product } from '@/lib/products';
import { ArrowLeft, ChevronLeft, ChevronRight, ShoppingBag, Store, MessageCircle } from 'lucide-react';
import { useProductGallery } from '@/hooks/use-product-gallery';

const formatPrice = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

type Listing = MarketplaceProduct | Product;

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  // Next can deliver a percent-encoded dynamic segment (especially on client navigation).
  // Decode at most twice to handle both regular and legacy encoded links.
  let routeId = params?.id || '';
  for (let n = 0; n < 2; n++) { try { const decoded = decodeURIComponent(routeId); if (decoded === routeId) break; routeId = decoded; } catch { break; } }
  useScrollToTop(routeId);
  const purchaseControls = useRef<HTMLDivElement>(null);
  const sellerListing = routeId.startsWith('seller:');
  const productId = sellerListing ? routeId.slice('seller:'.length) : routeId;
  const db = useFirestore();
  const router = useRouter();
  const { addToCart, startDirectCheckout } = useCart();
  const { toast } = useToast();
  const [product, setProduct] = useState<Listing | null>(null);
  const [resolvedSellerListing, setResolvedSellerListing] = useState(false);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weightIndex, setWeightIndex] = useState(0);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [requestNote, setRequestNote] = useState('');

  useEffect(() => {
    if (!db || !productId) return;
    let live = true;
    setProduct(null); setSellerName(null); setWhatsappNumber(''); setWeightIndex(0); setResolvedSellerListing(false); setLoading(true); setError(null); setAnswers({}); setRequestNote('');
    (async () => {
      try {
        // Older product URLs may not carry the seller prefix. Resolve both
        // collections when needed, without turning permission errors into 404s.
        let foundInSeller = sellerListing;
        let snapshot = await getDoc(doc(db, sellerListing ? 'marketplace_products' : 'products', productId));
        if (!snapshot.exists()) {
          const other = await getDoc(doc(db, sellerListing ? 'products' : 'marketplace_products', productId));
          snapshot = other;
          foundInSeller = !sellerListing;
        }
        if (!snapshot.exists()) throw new ActionError('This product could not be found. The listing may have been removed.',404);
        const listing = { ...snapshot.data(), id: snapshot.id } as Listing;
        if (foundInSeller && (listing as MarketplaceProduct).status !== 'published') throw new ActionError('This product is not available for viewing.',404);
        if (!live) return;
        setProduct(listing); setResolvedSellerListing(foundInSeller); setLoading(false);
        if (foundInSeller && listing.sellerId) {
          try {
            const store = await getDoc(doc(db, 'sellers', listing.sellerId));
            if (live && store.exists()) {
              const details = store.data() as Seller;
              setSellerName(details.businessName);
              const number = details.whatsappNumber?.replace(/[^0-9]/g, '') || '';
              setWhatsappNumber(/^\d{8,15}$/.test(number) ? number : '');
            }
          } catch { /* Seller display name is optional; the product remains visible. */ }
        }
      } catch (err) { if (live) { setError(getErrorNotice(err,'load').description); setLoading(false); } }
    })();
    return () => { live = false; };
  }, [db, productId, sellerListing]);

  const creator = resolvedSellerListing ? product as MarketplaceProduct | null : null;
  const photos = productPhotos(product?.imageUrls);
  const gallery = useProductGallery(photos.length);
  const weightChoices = creator?.weightOptions?.length ? creator.weightOptions :
    (creator?.weightValue && creator.weightUnit ? [{ value: creator.weightValue, unit: creator.weightUnit }] : []);
  const selectedWeight = weightChoices[Math.min(weightIndex, weightChoices.length - 1)];
  const selectedPrice = selectedWeight?.price ?? product?.price ?? 0;
  const minQty = Math.max(1, creator?.minimumOrderQuantity ?? 1);
  const selectedStock = selectedWeight?.stockQuantity ?? creator?.stockQuantity ?? 0;
  const hasStock = !creator || creator.availability !== 'available' || selectedStock >= minQty;
  const available = !!product?.showPrice && (!creator || creator.availability !== 'unavailable') && hasStock;
  function customNote() {
    const fields = (creator?.customizationOptions ?? []).map(field => ({ field, value: answers[field]?.trim() || '' })).filter(item => item.value);
    return [selectedWeight ? `Selected weight / size: ${selectedWeight.value} ${selectedWeight.unit}` : '', ...fields.map(item => `${item.field}: ${item.value}`), requestNote.trim()].filter(Boolean).join('\n');
  }
  function currentItem(): Product | null {
    if (!product || !available) return null;
    const note = customNote();
    if (note.length > 750) { toast({ variant: 'destructive', title: 'Customization notes are too long', description: 'Please shorten your preferences.' }); return null; }
    return { id: creator ? 'seller:' + product.id : product.id, sellerId: product.sellerId,
      name: product.name, description: product.description, category: product.category,
      categoryId: product.category, price: selectedPrice, imageUrls: photos, showPrice: product.showPrice,
      customizationNote: creator ? note : undefined, minimumOrderQuantity: creator ? minQty : 1,
      selectedWeight: creator && selectedWeight ? {value: selectedWeight.value, unit: selectedWeight.unit} : undefined };
  }
  function addCurrent(): string | null {
    const item = currentItem();
    if (!item) return null;
    addToCart(item, creator ? minQty : 1);
    toast({ title: 'Added to your bag', description: creator && minQty > 1 ? `${minQty} units of ${item.name} added.` : item.name });
    return cartLineId(item);
  }
  function buyNow() {
    const item = currentItem();
    if (!item) return;
    if (creator) {
      startDirectCheckout(item, minQty);
      router.push(`/checkout?buy=direct&product=${encodeURIComponent(creator.id)}`, {scroll:true});
    } else { addCurrent(); router.push('/cart', {scroll:true}); }
  }
  return <div className="min-h-screen bg-[#f8f6f2] text-[#29251f]"><Header /><main className="section-shell pb-20 pt-6 sm:pt-12">
    <Link href="/products" className="inline-flex items-center gap-2 text-sm text-[#846b49] hover:underline"><ArrowLeft className="h-4 w-4" />Back to discoveries</Link>
    {loading ? <div role="status" className="mt-8 grid gap-6 md:grid-cols-2"><div className="aspect-[4/5] animate-pulse rounded-3xl bg-[#eae4dc]" /><div className="h-72 animate-pulse rounded-3xl bg-white" /></div> :
    error || !product ? <div role="alert" className="mt-9 rounded-2xl border bg-white p-8"><h1 className="text-xl font-medium">{error ?? 'Product unavailable'}</h1><Link href="/products" className="mt-4 inline-block text-sm underline">Explore products</Link></div> :
    <div className="mt-7 grid items-start gap-8 md:grid-cols-2 lg:gap-14">
      <div className="min-w-0 space-y-3">
        <div className="group relative aspect-[4/5] touch-pan-y overflow-hidden rounded-3xl bg-[#eee8df]" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={photos[gallery.index]} alt={`${product.name} photo ${gallery.index + 1}`} sizes={DETAIL_IMAGE_SIZES} priority={gallery.index === 0} loading="eager" /></div>
          <div className="absolute right-3 top-3 z-10 flex flex-col items-center gap-2 sm:hidden" onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
            <ProductShareButton productRoute={creator?'seller:'+product.id:product.id} title={product.name} iconOnly/>
            <FavoriteToggle compact productId={creator ? 'seller:' + product.id : product.id} title={product.name} imageUrl={photos[0]}/>
          </div>
          {photos.length > 1 && <>
            <button type="button" onClick={() => gallery.move(-1)} aria-label="Previous product photo" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl shadow sm:flex"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => gallery.move(1)} aria-label="Next product photo" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl shadow sm:flex"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-3 right-3 rounded-full bg-[#29251f]/75 px-3 py-1 text-xs text-white">{gallery.index + 1} / {photos.length}</span>
          </>}
        </div>
        {photos.length > 1 && <div className="hidden gap-3 overflow-x-auto pb-1 sm:flex">{photos.map((url, n) => <button type="button" key={n} aria-label={`Show photo ${n + 1}`} aria-pressed={gallery.index === n} onClick={() => gallery.select(n)} className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${gallery.index === n ? 'border-[#a68a64]' : 'border-transparent'}`}><ProductImage src={url} alt={`Thumbnail ${n + 1}`} sizes="64px" /></button>)}</div>}
        {photos.length > 1 && <p className="text-center text-xs text-muted-foreground sm:hidden">Swipe the image to see more photos</p>}
      </div>
      <div className="min-w-0 space-y-5"><div><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">{product.category}</p><div className="hidden sm:block"><ProductShareButton productRoute={creator?'seller:'+product.id:product.id} title={product.name}/></div></div><h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>{sellerName && <p className="mt-3 inline-flex items-center gap-2 text-xs text-[#73695f]"><Store className="h-4 w-4" /><Link href={`/shop/${encodeURIComponent(product.sellerId || '')}`} className="underline underline-offset-4">Made by {sellerName} · View creator shop</Link></p>}<p className="mt-5 text-3xl font-semibold">{product.showPrice ? formatPrice(selectedPrice) : 'Price on request'}</p></div>
      <div className="rounded-2xl border border-[#e8e0d5] bg-white p-5"><h2 className="font-medium">About this creation</h2><p className={`mt-3 whitespace-pre-wrap text-sm leading-6 text-[#675d53] ${descriptionOpen ? '' : 'line-clamp-2'}`}>{product.description}</p><button type="button" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen(v => !v)} className="mt-2 min-h-9 text-xs font-semibold underline">{descriptionOpen ? 'Show less' : 'Read full description'}</button>
        {creator && <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#6b604e]">{creator.weightValue && creator.weightUnit && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Weight / quantity: {creator.weightValue} {creator.weightUnit}</span>}{creator.preparationDays !== undefined && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Preparation: {creator.preparationDays} day(s)</span>}{minQty > 1 && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Minimum: {minQty} units</span>}{creator.availability === 'made-to-order' && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Made to order</span>}</div>}
        {creator && (creator.ingredients || creator.allergens?.length || creator.dietaryTags?.length || creator.shelfLifeDays != null || creator.storageInstructions) && <section className="mt-5 space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">Ingredients & food information</h3><p className="text-[11px] text-amber-800">Information is provided by the seller. If you have allergies, confirm ingredients and cross-contact precautions directly with the creator before ordering.</p>{creator.ingredients && <p className="whitespace-pre-wrap text-sm"><strong>Ingredients:</strong> {creator.ingredients}</p>}{!!creator.allergens?.length && <p className="text-sm"><strong>Declared allergens:</strong> {creator.allergens.join(', ')}</p>}{!!creator.dietaryTags?.length && <p className="text-sm"><strong>Seller dietary labels:</strong> {creator.dietaryTags.join(', ')}</p>}{creator.shelfLifeDays != null && <p className="text-sm"><strong>Stated shelf life:</strong> {creator.shelfLifeDays} day(s)</p>}{creator.storageInstructions && <p className="whitespace-pre-wrap text-sm"><strong>Storage:</strong> {creator.storageInstructions}</p>}</section>}
        {creator?.careInstructions && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Care & ingredients</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[#675d53]">{creator.careInstructions}</p></div>}
      </div>
      {creator && weightChoices.length > 1 && <p className="text-xs text-[#846b49]">Choose a size to see its exact price. Prices and stock may differ between weights.</p>}
      {weightChoices.length > 0 && <section className="rounded-2xl border border-[#e8e0d5] bg-white p-5"><h2 className="text-sm font-semibold">Choose weight / size</h2><p className="mt-1 text-xs text-muted-foreground">Different sizes may have different prices and available stock.</p><div role="group" aria-label="Select weight or size" className="mt-4 flex flex-wrap gap-2">{weightChoices.map((option,n) => <button type="button" key={n} onClick={() => setWeightIndex(n)} aria-pressed={weightIndex===n} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${weightIndex===n ? 'border-[#29251f] bg-[#29251f] text-white' : 'border-[#e1d7c8] bg-white text-[#6d6256]'}`}>{option.value} {option.unit}{option.stockQuantity === 0 ? ' · Sold out' : ''}</button>)}</div></section>}
      {creator?.availability === 'available' && !hasStock && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This size does not have enough stock for the minimum order quantity ({minQty}). Choose another size or contact the seller.</p>}
      {creator && (creator.customizationOptions?.length || 0) > 0 && <div className="space-y-4 rounded-2xl border border-[#e8e0d5] bg-white p-5"><div><h2 className="font-medium">Make it yours</h2><p className="mt-1 text-xs text-muted-foreground">Optional personalization requests. The creator will confirm feasibility; prices are not automatically changed.</p></div>{creator.customizationOptions?.map((field,i) => <label key={i} className="block space-y-1.5 text-xs font-medium">{field}<Input maxLength={120} value={answers[field] || ''} placeholder="Your preference" onChange={e => setAnswers(v => ({...v,[field]:e.target.value}))} /></label>)}</div>}
      {creator && <label className="block space-y-2 text-sm font-medium">Notes for the creator (optional)<Textarea maxLength={500} rows={3} placeholder="Special requests, colours, gifting instructions…" value={requestNote} onChange={e=>setRequestNote(e.target.value)} className="bg-white"/></label>}
      <div ref={purchaseControls} id="purchase-actions" className="grid scroll-mt-24 grid-cols-[auto_1fr] gap-3"><Button type="button" disabled={!available} onClick={() => void addCurrent()} variant="outline" className="h-12 rounded-full border-[#29251f] bg-white px-5" aria-label={`Add ${product.name} to bag`}><ShoppingBag className="mr-2 h-4 w-4" />Add to bag</Button><Button type="button" disabled={!available} onClick={buyNow} className="h-12 rounded-full bg-[#29251f] text-white hover:bg-[#51463a]">{available ? creator ? 'Buy now' : 'View bag' : 'Unavailable'}</Button></div>
      <div className="hidden justify-start sm:flex"><FavoriteToggle productId={creator ? 'seller:' + product.id : product.id} title={product.name} imageUrl={photos[0]}/></div>
      {creator && <Link href={`/custom-orders?seller=${encodeURIComponent(creator.sellerId)}&product=${encodeURIComponent(creator.id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#a68a64] bg-[#fffaf3] px-5 text-sm font-semibold text-[#6d5539] transition hover:bg-[#f6eddf]">Request a custom quote for this creation</Link>}
      {creator && whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello! I'm interested in ${product.name} on TreatStory.${selectedWeight ? ` Preferred size: ${selectedWeight.value} ${selectedWeight.unit}.` : ''}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#17834a] bg-[#e9f8f0] px-5 text-sm font-semibold text-[#17683b] transition hover:bg-[#d8f0e5]"><MessageCircle className="h-5 w-5"/>Order via WhatsApp</a>}
      {creator && whatsappNumber && <p className="text-xs text-muted-foreground">WhatsApp requests are handled directly by the seller and won't appear in your website order history unless a website order is also placed.</p>}
      {creator && <p className="text-xs leading-5 text-muted-foreground">Your preferences are kept with your selected size and shared with the seller. Delivery and booking details are checked before confirming your order.</p>}
    </div>{creator && <div className="md:col-span-2"><ProductReviews productId={creator.id} /></div>}</div>}
  </main><MobileBuyBar target={purchaseControls} enabled={!!creator && available} resetKey={productId}><div className="min-w-0"><p className="truncate text-xs font-medium">{product?.name}</p><p className="mt-1 text-sm font-semibold">{selectedWeight ? `${selectedWeight.value} ${selectedWeight.unit} · ` : ''}{formatPrice(selectedPrice)}</p></div><Button type="button" disabled={!available} onClick={buyNow} className="h-12 shrink-0 rounded-full bg-[#29251f] px-6 text-white">Buy now</Button></MobileBuyBar></div>;
}
