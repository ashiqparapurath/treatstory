'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { ProductImage } from '@/components/product-image';
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
  const sellerListing = routeId.startsWith('seller:');
  const productId = sellerListing ? routeId.slice('seller:'.length) : routeId;
  const db = useFirestore();
  const router = useRouter();
  const { addToCart } = useCart();
  const { toast } = useToast();
  const [product, setProduct] = useState<Listing | null>(null);
  const [resolvedSellerListing, setResolvedSellerListing] = useState(false);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weightIndex, setWeightIndex] = useState(0);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
        if (!snapshot.exists()) throw new Error('This product could not be found. The listing may have been removed.');
        const listing = { ...snapshot.data(), id: snapshot.id } as Listing;
        if (foundInSeller && (listing as MarketplaceProduct).status !== 'published') throw new Error('This product is not available for public viewing.');
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
      } catch (err) { if (live) { setError(err instanceof Error ? err.message : 'Unable to load this product.'); setLoading(false); } }
    })();
    return () => { live = false; };
  }, [db, productId, sellerListing]);

  const creator = resolvedSellerListing ? product as MarketplaceProduct | null : null;
  const photos = (product?.imageUrls ?? []).flatMap(url => url.split(/\r?\n/)).map(url => url.trim()).filter(Boolean);
  const gallery = useProductGallery(photos.length);
  const weightChoices = creator?.weightOptions?.length ? creator.weightOptions :
    (creator?.weightValue && creator.weightUnit ? [{ value: creator.weightValue, unit: creator.weightUnit }] : []);
  const selectedWeight = weightChoices[Math.min(weightIndex, weightChoices.length - 1)];
  const minQty = Math.max(1, creator?.minimumOrderQuantity ?? 1);
  const available = product?.showPrice && (!creator || creator.availability !== 'unavailable');
  function customNote() {
    const fields = (creator?.customizationOptions ?? []).map(field => ({ field, value: answers[field]?.trim() || '' })).filter(item => item.value);
    return [selectedWeight ? `Selected weight / size: ${selectedWeight.value} ${selectedWeight.unit}` : '', ...fields.map(item => `${item.field}: ${item.value}`), requestNote.trim()].filter(Boolean).join('\n');
  }
  function addCurrent(): boolean {
    if (!product || !available) return false;
    const note = customNote();
    if (note.length > 950) { toast({ variant: 'destructive', title: 'Customization notes are too long', description: 'Please shorten your preferences.' }); return false; }
    const item: Product = { id: creator ? 'seller:' + product.id : product.id, sellerId: product.sellerId,
      name: product.name, description: product.description, category: product.category,
      categoryId: product.category, price: product.price, imageUrls: photos, showPrice: product.showPrice,
      customizationNote: creator ? note : undefined, minimumOrderQuantity: creator ? minQty : 1 };
    for (let n = 0; n < (creator ? minQty : 1); n++) addToCart(item);
    toast({ title: 'Added to your bag', description: creator && minQty > 1 ? `${minQty} units of ${product.name} added.` : product.name });
    return true;
  }
  function buyNow() {
    if (!product || !available || !addCurrent()) return;
    if (creator) router.push(`/checkout?product=${encodeURIComponent(product.id)}`);
    else router.push('/cart');
  }
  return <div className="min-h-screen bg-[#f8f6f2] text-[#29251f]"><Header /><main className="section-shell pb-20 pt-6 sm:pt-12">
    <Link href="/products" className="inline-flex items-center gap-2 text-sm text-[#846b49] hover:underline"><ArrowLeft className="h-4 w-4" />Back to discoveries</Link>
    {loading ? <div role="status" className="mt-8 grid gap-6 md:grid-cols-2"><div className="aspect-[4/5] animate-pulse rounded-3xl bg-[#eae4dc]" /><div className="h-72 animate-pulse rounded-3xl bg-white" /></div> :
    error || !product ? <div role="alert" className="mt-9 rounded-2xl border bg-white p-8"><h1 className="text-xl font-medium">{error ?? 'Product unavailable'}</h1><Link href="/products" className="mt-4 inline-block text-sm underline">Explore products</Link></div> :
    <div className="mt-7 grid items-start gap-8 md:grid-cols-2 lg:gap-14">
      <div className="min-w-0 space-y-3">
        <div className="group relative aspect-[4/5] touch-pan-y overflow-hidden rounded-3xl bg-[#eee8df]" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={photos[gallery.index]} alt={`${product.name} photo ${gallery.index + 1}`} /></div>
          {photos.length > 1 && <>
            <button type="button" onClick={() => gallery.move(-1)} aria-label="Previous product photo" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow sm:flex"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => gallery.move(1)} aria-label="Next product photo" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow sm:flex"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-3 right-3 rounded-full bg-[#29251f]/75 px-3 py-1 text-xs text-white">{gallery.index + 1} / {photos.length}</span>
          </>}
        </div>
        {photos.length > 1 && <div className="hidden gap-3 overflow-x-auto pb-1 sm:flex">{photos.map((url, n) => <button type="button" key={n} aria-label={`Show photo ${n + 1}`} aria-pressed={gallery.index === n} onClick={() => gallery.select(n)} className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${gallery.index === n ? 'border-[#a68a64]' : 'border-transparent'}`}><ProductImage src={url} alt={`Thumbnail ${n + 1}`} /></button>)}</div>}
        {photos.length > 1 && <p className="text-center text-xs text-muted-foreground sm:hidden">Swipe the image to see more photos</p>}
      </div>
      <div className="min-w-0 space-y-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">{product.category}</p><h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>{sellerName && <p className="mt-3 inline-flex items-center gap-2 text-xs text-[#73695f]"><Store className="h-4 w-4" />Made by {sellerName}</p>}<p className="mt-5 text-3xl font-semibold">{product.showPrice ? formatPrice(product.price) : 'Price on request'}</p></div>
      <div className="rounded-2xl border border-[#e8e0d5] bg-white p-5"><h2 className="font-medium">About this creation</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#675d53]">{product.description}</p>
        {creator && <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#6b604e]">{creator.weightValue && creator.weightUnit && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Weight / quantity: {creator.weightValue} {creator.weightUnit}</span>}{creator.preparationDays !== undefined && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Preparation: {creator.preparationDays} day(s)</span>}{minQty > 1 && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Minimum: {minQty} units</span>}{creator.availability === 'made-to-order' && <span className="rounded-full bg-[#f5f0e8] px-3 py-2">Made to order</span>}</div>}
        {creator?.careInstructions && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Care & ingredients</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[#675d53]">{creator.careInstructions}</p></div>}
      </div>
      {weightChoices.length > 0 && <section className="rounded-2xl border border-[#e8e0d5] bg-white p-5"><h2 className="text-sm font-semibold">Choose weight / size</h2><p className="mt-1 text-xs text-muted-foreground">All choices use the same listed price. Your selection is shared with the seller.</p><div role="group" aria-label="Select weight or size" className="mt-4 flex flex-wrap gap-2">{weightChoices.map((option,n) => <button type="button" key={n} onClick={() => setWeightIndex(n)} aria-pressed={weightIndex===n} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${weightIndex===n ? 'border-[#29251f] bg-[#29251f] text-white' : 'border-[#e1d7c8] bg-white text-[#6d6256]'}`}>{option.value} {option.unit}</button>)}</div></section>}
      {creator && (creator.customizationOptions?.length || 0) > 0 && <div className="space-y-4 rounded-2xl border border-[#e8e0d5] bg-white p-5"><div><h2 className="font-medium">Make it yours</h2><p className="mt-1 text-xs text-muted-foreground">Optional personalization requests. The creator will confirm feasibility; prices are not automatically changed.</p></div>{creator.customizationOptions?.map((field,i) => <label key={i} className="block space-y-1.5 text-xs font-medium">{field}<Input maxLength={120} value={answers[field] || ''} placeholder="Your preference" onChange={e => setAnswers(v => ({...v,[field]:e.target.value}))} /></label>)}</div>}
      {creator && <label className="block space-y-2 text-sm font-medium">Notes for the creator (optional)<Textarea maxLength={500} rows={3} placeholder="Special requests, colours, gifting instructions…" value={requestNote} onChange={e=>setRequestNote(e.target.value)} className="bg-white"/></label>}
      <div className="grid grid-cols-[auto_1fr] gap-3"><Button type="button" disabled={!available} onClick={() => void addCurrent()} variant="outline" className="h-12 rounded-full border-[#29251f] bg-white px-5" aria-label={`Add ${product.name} to bag`}><ShoppingBag className="mr-2 h-4 w-4" />Add to bag</Button><Button type="button" disabled={!available} onClick={buyNow} className="h-12 rounded-full bg-[#29251f] text-white hover:bg-[#51463a]">{available ? creator ? 'Buy now' : 'View bag' : 'Unavailable'}</Button></div>
      {creator && whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello! I'm interested in ${product.name} on TreatStory.${selectedWeight ? ` Preferred size: ${selectedWeight.value} ${selectedWeight.unit}.` : ''}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#17834a] bg-[#e9f8f0] px-5 text-sm font-semibold text-[#17683b] transition hover:bg-[#d8f0e5]"><MessageCircle className="h-5 w-5"/>Order via WhatsApp</a>}
      {creator && whatsappNumber && <p className="text-xs text-muted-foreground">WhatsApp requests are handled directly by the seller and won't appear in your website order history unless a website order is also placed.</p>}
      {creator && <p className="text-xs leading-5 text-muted-foreground">Your preferences are saved with this listing in your bag and sent to the seller as order notes. Delivery charges are confirmed by the seller.</p>}
    </div></div>}
  </main></div>;
}
