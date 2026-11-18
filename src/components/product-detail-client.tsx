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
import { ProductRatingBadge, ProductReviews } from '@/components/product-reviews';
import { ProductSkuCopy } from '@/components/product-sku-copy';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MarketplaceProduct, Seller } from '@/lib/marketplace-types';
import type { Product } from '@/lib/products';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ShoppingBag, Store, MessageCircle } from 'lucide-react';
import { useProductGallery } from '@/hooks/use-product-gallery';

const formatPrice = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

type Listing = MarketplaceProduct | Product;

export default function ProductDetailClient({ initialProduct = null, initialSellerListing = false }: { initialProduct?: Listing | null; initialSellerListing?: boolean }) {
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
  const [product, setProduct] = useState<Listing | null>(initialProduct);
  const [resolvedSellerListing, setResolvedSellerListing] = useState(initialSellerListing);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [sellerLogoUrl, setSellerLogoUrl] = useState('');
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState<string | null>(null);
  const [weightIndex, setWeightIndex] = useState(0);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [requestNote, setRequestNote] = useState('');

  useEffect(() => {
    if (!db || !productId) return;
    let live = true;
    setProduct(initialProduct?.id === productId ? initialProduct : null); setSellerName(null); setSellerLogoUrl(''); setWhatsappNumber(''); setWeightIndex(0); setResolvedSellerListing(initialSellerListing); setLoading(!(initialProduct?.id === productId)); setError(null); setAnswers({}); setRequestNote('');
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
              setSellerLogoUrl(typeof details.logoUrl === 'string' ? details.logoUrl : '');
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
  return <div className="min-h-screen bg-white text-[#29251f] md:bg-[#f8f6f2]"><Header /><main className="section-shell px-0 pb-48 pt-0 md:px-6 md:pb-24 md:pt-12 lg:px-10">
    <Link href="/products" className="hidden items-center gap-2 text-sm text-[#846b49] hover:underline md:inline-flex"><ArrowLeft className="h-4 w-4" />Back to discoveries</Link>
    {loading ? <div role="status" className="mt-8 grid gap-6 md:grid-cols-2"><div className="aspect-[4/5] animate-pulse rounded-3xl bg-[#eae4dc]" /><div className="h-72 animate-pulse rounded-3xl bg-white" /></div> :
    error || !product ? <div role="alert" className="mt-9 rounded-2xl border bg-white p-8"><h1 className="text-xl font-medium">{error ?? 'Product unavailable'}</h1><Link href="/products" className="mt-4 inline-block text-sm underline">Explore products</Link></div> :
    <div className="mt-0 grid items-start gap-0 md:mt-7 md:grid-cols-2 md:gap-8 lg:gap-14">
      <div className="min-w-0 space-y-3">
        <div className="group relative aspect-[1/1.08] touch-pan-y overflow-hidden bg-[#eee8df] md:aspect-[4/5] md:rounded-3xl" onTouchStart={gallery.onTouchStart} onTouchEnd={gallery.onTouchEnd}>
          <div key={gallery.index} className={`absolute inset-0 ${gallery.direction === 'next' ? 'treatstory-photo-next' : 'treatstory-photo-previous'}`}><ProductImage src={photos[gallery.index]} alt={`${product.name} photo ${gallery.index + 1}`} sizes={DETAIL_IMAGE_SIZES} priority={gallery.index === 0} loading="eager" /></div>
          <div className="absolute inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 flex items-start justify-between gap-2 md:hidden" onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
            <Link href="/products" aria-label="Back to products" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#35281d] shadow-sm"><ArrowLeft className="h-5 w-5"/></Link>
            <div className="flex items-center gap-2">
              <FavoriteToggle compact productId={creator ? 'seller:' + product.id : product.id} title={product.name} imageUrl={photos[0]}/>
              <ProductShareButton productRoute={creator?'seller:'+product.id:product.id} title={product.name} iconOnly/>
            </div>
          </div>
          {photos.length > 1 && <>
            <button type="button" onClick={() => gallery.move(-1)} aria-label="Previous product photo" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl shadow md:flex"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => gallery.move(1)} aria-label="Next product photo" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 backdrop-blur-xl shadow md:flex"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-3 right-3 hidden rounded-full bg-[#29251f]/75 px-3 py-1 text-xs text-white md:block">{gallery.index + 1} / {photos.length}</span>
          </>}
          {photos.length > 1 && <div className="absolute inset-x-3 bottom-3 z-20 flex justify-center gap-1.5 overflow-x-auto pb-1 md:hidden" role="group" aria-label="Product gallery photos" onTouchStart={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()}>
            {photos.slice(0, 8).map((url,n) => <button type="button" key={n} aria-label={'Show photo ' + (n + 1)} aria-pressed={gallery.index === n} onClick={() => gallery.select(n)} className={gallery.index === n ? 'relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 border-white shadow-md ring-2 ring-[#754328] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white' : 'relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 border-white/80 opacity-85 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'}>
              <ProductImage src={url} alt={'Thumbnail ' + (n + 1)} sizes="48px" />
            </button>)}
          </div>}
        </div>
        {photos.length > 1 && <div className="hidden gap-3 overflow-x-auto pb-1 md:flex">{photos.map((url, n) => <button type="button" key={n} aria-label={`Show photo ${n + 1}`} aria-pressed={gallery.index === n} onClick={() => gallery.select(n)} className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${gallery.index === n ? 'border-[#a68a64]' : 'border-transparent'}`}><ProductImage src={url} alt={`Thumbnail ${n + 1}`} sizes="64px" /></button>)}</div>}
        
      </div>
      <div className="min-w-0 space-y-0 bg-white px-4 pt-4 md:space-y-5 md:bg-transparent md:px-0 md:pt-0">
        <div className="border-b border-[#eee9e4] pb-4 md:border-b-0 md:pb-0">
          <div className="flex min-h-5 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[12px] font-medium text-[#a49a91] md:text-[10px] md:font-semibold md:uppercase md:tracking-[0.2em] md:text-[#a68a64]">{product.category}</p>
            <div className="flex shrink-0 items-center gap-2">
              {creator && <ProductRatingBadge productId={creator.id} />}
              <div className="hidden md:block"><ProductShareButton productRoute={creator ? 'seller:' + product.id : product.id} title={product.name}/></div>
            </div>
          </div>
          <h1 className="mt-2 text-[21px] font-semibold leading-[1.24] tracking-[-0.03em] text-[#30251c] md:text-4xl">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
            <span className="text-[20px] font-semibold tracking-[-0.03em] text-[#754328]">{product.showPrice ? formatPrice(selectedPrice) : 'Price on request'}</span>
            {creator?.availability === 'made-to-order' && <span className="rounded-full bg-[#f6e8dd] px-2.5 py-1 text-[10px] font-medium text-[#995b35]">Made to order</span>}
          </div>
          {creator?.sku && <div className="mt-3 hidden md:block"><ProductSkuCopy sku={creator.sku} /></div>}
          {sellerName && <>
            <div className="mt-5 md:hidden">
              <p className="text-[12px] font-semibold text-[#3b3029]">Seller</p>
              <div className="mt-2 flex min-w-0 items-center gap-2.5">
                <Link href={'/shop/' + encodeURIComponent(product.sellerId || '')} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f1e3d5] text-[#754328]">
                    {sellerLogoUrl ? <ProductImage src={sellerLogoUrl} alt={sellerName + ' shop logo'} sizes="44px" /> : <Store aria-hidden="true" className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[#352b23]">{sellerName}</span>
                    <span className="mt-0.5 block text-[11px] text-[#a49a91]">Creator · View shop</span>
                  </span>
                </Link>
                {whatsappNumber && <>
                  <a href={'https://wa.me/' + whatsappNumber + '?text=' + encodeURIComponent('Hello! I am interested in ' + product.name + ' on TreatStory.')} target="_blank" rel="noopener noreferrer" aria-label={'Message ' + sellerName + ' on WhatsApp'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f7f1eb] text-[#8d5130] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]"><MessageCircle aria-hidden="true" className="h-5 w-5"/></a>
                </>}
              </div>
            </div>
            <p className="mt-4 hidden min-h-14 w-full items-center gap-3 rounded-xl bg-[#f7efe6] px-3 py-2.5 text-xs text-[#6b5342] md:inline-flex md:min-h-0 md:w-auto md:bg-transparent md:px-0 md:py-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8d3c0] text-[#874a28]"><Store className="h-4 w-4" /></span>
              <Link href={'/shop/' + encodeURIComponent(product.sellerId || '')} className="underline underline-offset-4">Made by {sellerName} · View creator shop</Link>
            </p>
          </>}
          <p className="mt-5 hidden text-3xl font-semibold md:block">{product.showPrice ? formatPrice(selectedPrice) : 'Price on request'}</p>
        </div>
        <section className="border-b border-[#eee9e4] py-4 md:rounded-2xl md:border md:border-[#e8e0d5] md:bg-white md:p-5" aria-labelledby="product-description-title">
          <h2 id="product-description-title" className="text-[13px] font-semibold text-[#342c26] md:text-[14px]">Description</h2>
          <p className={'mt-2 whitespace-pre-wrap text-[12px] leading-[1.55] text-[#857a70] md:text-sm md:leading-6 ' + (descriptionOpen ? '' : 'line-clamp-3')}>{product.description}</p>
          {typeof product.description === 'string' && product.description.length > 135 && <button type="button" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen(v => !v)} className="mt-1 min-h-10 text-[12px] font-medium text-[#915331] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]">{descriptionOpen ? 'Show less' : 'Read more'}</button>}
        </section>
        {weightChoices.length > 0 && <section aria-labelledby="product-weights-title" className="border-b border-[#eee9e4] py-4 md:rounded-2xl md:border md:border-[#e8e0d5] md:bg-white md:p-5">
          <h2 id="product-weights-title" className="text-[13px] font-semibold text-[#342c26] md:text-[14px]">Select Weight / Size</h2>
          {creator && weightChoices.length > 1 && <p className="mt-1 hidden text-xs text-muted-foreground md:block">Prices and availability may differ by size.</p>}
          <div role="group" aria-label="Select weight or size" className="mt-3 -mx-1 flex snap-x flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {weightChoices.map((option,n) => <button type="button" key={n} onClick={() => setWeightIndex(n)} aria-pressed={weightIndex === n}
              className={'min-h-11 shrink-0 snap-start whitespace-nowrap rounded-lg border px-3 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328] md:rounded-xl md:px-3.5 md:text-xs ' + (weightIndex === n ? 'border-[#754328] bg-[#754328] text-white shadow-sm' : 'border-[#ece5df] bg-white text-[#5e544d]')}>
              {option.value} {option.unit}{option.stockQuantity === 0 ? ' · Sold out' : ''}
            </button>)}
          </div>
        </section>}
        <div className="space-y-6 pb-7 pt-6 md:space-y-4 md:py-0">
          {creator && <div className="flex flex-wrap gap-2 pb-0.5 text-[11px] text-[#6b604e] md:mt-5 md:text-xs">
            {creator.weightValue && creator.weightUnit && <span className="hidden rounded-full bg-[#f5f0e8] px-3 py-2 md:inline-flex">Weight / quantity: {creator.weightValue} {creator.weightUnit}</span>}
            {creator.preparationDays !== undefined && <span className={`rounded-full bg-[#f5f0e8] px-3 py-2 ${creator.preparationDays === 0 ? 'hidden md:inline-flex' : 'inline-flex'}`}>Preparation: {creator.preparationDays} day(s)</span>}
            {minQty > 1 && <span className="inline-flex rounded-full bg-[#f5f0e8] px-3 py-2">Minimum: {minQty} units</span>}
            {creator.availability === 'made-to-order' && <span className="hidden rounded-full bg-[#f5f0e8] px-3 py-2 md:inline-flex">Made to order</span>}
          </div>}
        {creator && (creator.ingredients || creator.allergens?.length || creator.dietaryTags?.length || creator.shelfLifeDays != null || creator.storageInstructions) && <section className="mt-5 space-y-3 border-t pt-5"><h3 className="text-sm font-semibold">Ingredients & food information</h3><p className="text-[11px] text-amber-800">Information is provided by the seller. If you have allergies, confirm ingredients and cross-contact precautions directly with the creator before ordering.</p>{creator.ingredients && <p className="whitespace-pre-wrap text-sm"><strong>Ingredients:</strong> {creator.ingredients}</p>}{!!creator.allergens?.length && <p className="text-sm"><strong>Declared allergens:</strong> {creator.allergens.join(', ')}</p>}{!!creator.dietaryTags?.length && <p className="text-sm"><strong>Seller dietary labels:</strong> {creator.dietaryTags.join(', ')}</p>}{creator.shelfLifeDays != null && <p className="text-sm"><strong>Stated shelf life:</strong> {creator.shelfLifeDays} day(s)</p>}{creator.storageInstructions && <p className="whitespace-pre-wrap text-sm"><strong>Storage:</strong> {creator.storageInstructions}</p>}</section>}
        {creator?.careInstructions && <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Care & ingredients</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[#675d53]">{creator.careInstructions}</p></div>}
        </div>
      {creator?.availability === 'available' && !hasStock && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This size does not have enough stock for the minimum order quantity ({minQty}). Choose another size or contact the seller.</p>}
      {creator && (creator.customizationOptions?.length || 0) > 0 && <div className="space-y-4 rounded-2xl border border-[#e8e0d5] bg-white p-5"><div><h2 className="font-medium">Make it yours</h2><p className="mt-1 text-xs text-muted-foreground">Optional personalization requests. The creator will confirm feasibility; prices are not automatically changed.</p></div>{creator.customizationOptions?.map((field,i) => <label key={i} className="block space-y-1.5 text-xs font-medium">{field}<Input maxLength={120} value={answers[field] || ''} placeholder="Your preference" onChange={e => setAnswers(v => ({...v,[field]:e.target.value}))} /></label>)}</div>}
      {creator && <>
        <details className="group rounded-[18px] border border-[#ece3d9] bg-[#fbf8f4] px-4 py-3 md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-[#49382c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328] [&::-webkit-details-marker]:hidden">
            <span>Add a note <span className="font-normal text-[#938273]">(optional)</span></span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#866b58] transition-transform group-open:rotate-180"/>
          </summary>
          <label className="block pb-2 pt-3 text-[12px] font-medium text-[#564537]">Instructions for the creator
            <Textarea maxLength={500} rows={3} placeholder="Colours, gifting instructions, special requests…" value={requestNote} onChange={e=>setRequestNote(e.target.value)} className="mt-2.5 min-h-[96px] rounded-xl border-[#e6dbd0] bg-white text-[16px]"/>
          </label>
        </details>
        <label className="hidden space-y-2 text-sm font-medium md:block">Notes for the creator (optional)<Textarea maxLength={500} rows={3} placeholder="Special requests, colours, gifting instructions…" value={requestNote} onChange={e=>setRequestNote(e.target.value)} className="bg-white"/></label>
      </>}
      <div ref={purchaseControls} id="purchase-actions" className="grid scroll-mt-48 grid-cols-2 gap-3 py-1 md:grid-cols-[auto_1fr] md:gap-3 md:py-0">
        <Button type="button" disabled={!available} onClick={() => void addCurrent()} variant="outline" className="h-12 min-w-0 rounded-full border-[#d9c9bc] bg-white px-2 text-[12px] font-medium text-[#49382c] md:border-[#29251f] md:px-5 md:text-sm" aria-label={`Add ${product.name} to bag`}><ShoppingBag className="mr-1.5 h-4 w-4 shrink-0 md:mr-2" />Add to bag</Button>
        <Button type="button" disabled={!available} onClick={buyNow} className="h-12 min-w-0 rounded-full bg-[#754328] px-2 text-[12px] font-semibold text-white hover:bg-[#653820] md:bg-[#29251f] md:text-sm md:hover:bg-[#51463a]">{available ? creator ? 'Buy now' : 'View bag' : 'Unavailable'}</Button>
      </div>
      <div className="hidden justify-start sm:flex"><FavoriteToggle productId={creator ? 'seller:' + product.id : product.id} title={product.name} imageUrl={photos[0]}/></div>
      {creator && <div aria-label="Additional ordering options" className="space-y-4 md:hidden">
        {creator && <Link href={`/custom-orders?seller=${encodeURIComponent(creator.sellerId)}&product=${encodeURIComponent(creator.id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#a68a64] bg-[#fffaf3] px-3 text-[12px] font-semibold text-[#6d5539] transition hover:bg-[#f6eddf]">Request a custom quote for this creation</Link>}
        {creator && whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello! I'm interested in ${product.name} on TreatStory.${selectedWeight ? ` Preferred size: ${selectedWeight.value} ${selectedWeight.unit}.` : ''}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#17834a] bg-[#e9f8f0] px-3 text-[12px] font-semibold text-[#17683b] transition hover:bg-[#d8f0e5]"><MessageCircle className="h-5 w-5"/>Order via WhatsApp</a>}
        {whatsappNumber && <p className="px-1 text-[11px] leading-[1.5] text-[#86766b]">WhatsApp orders are arranged directly with the seller and may not appear in your TreatStory order history.</p>}
      </div>}
      {creator && <Link href={`/custom-orders?seller=${encodeURIComponent(creator.sellerId)}&product=${encodeURIComponent(creator.id)}`} className="hidden min-h-12 md:flex items-center justify-center gap-2 rounded-full border border-[#a68a64] bg-[#fffaf3] px-5 text-sm font-semibold text-[#6d5539] transition hover:bg-[#f6eddf]">Request a custom quote for this creation</Link>}
      {creator && whatsappNumber && <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hello! I'm interested in ${product.name} on TreatStory.${selectedWeight ? ` Preferred size: ${selectedWeight.value} ${selectedWeight.unit}.` : ''}`)}`} target="_blank" rel="noopener noreferrer" className="hidden min-h-12 md:flex items-center justify-center gap-2 rounded-full border border-[#17834a] bg-[#e9f8f0] px-5 text-sm font-semibold text-[#17683b] transition hover:bg-[#d8f0e5]"><MessageCircle className="h-5 w-5"/>Order via WhatsApp</a>}
      {creator && whatsappNumber && <p className="hidden text-xs text-muted-foreground md:block">WhatsApp requests are handled directly by the seller and won't appear in your website order history unless a website order is also placed.</p>}
      {creator && <p className="hidden text-xs leading-5 text-muted-foreground md:block">Your preferences are kept with your selected size and shared with the seller. Delivery and booking details are checked before confirming your order.</p>}
    </div>{creator && <div className="px-4 pt-2 md:col-span-2 md:px-0 md:pt-0"><ProductReviews productId={creator.id} /></div>}</div>}
  </main><MobileBuyBar target={purchaseControls} enabled={!!product && !loading && !error} resetKey={productId}>
    <div className="min-w-0"><p className="text-[10px] font-medium text-[#9b8b7e]">Total price{minQty > 1 ? ' · ' + minQty + ' units' : ''}</p><p className="mt-0.5 truncate text-[17px] font-bold text-[#31251c]">{product?.showPrice ? formatPrice(selectedPrice * minQty) : 'Price on request'}</p></div>
    <Button type="button" disabled={!available} onClick={() => void addCurrent()} className="h-12 min-w-[144px] shrink-0 rounded-full bg-[#754328] px-5 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(70,38,22,0.16)] hover:bg-[#663b23] disabled:opacity-50"><ShoppingBag className="mr-2 h-[18px] w-[18px]"/>{available ? 'Add to cart' : 'Unavailable'}</Button>
  </MobileBuyBar></div>;
}
