'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, query, where } from 'firebase/firestore';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Header } from '@/components/header';
import { ProductImage } from '@/components/product-image';
import type { Seller, MarketplaceProduct } from '@/lib/marketplace-types';
import { Store, BadgeCheck, MapPin, Package } from 'lucide-react';
import { StoreShareButton } from '@/components/store-share-button';

const money = (price: number) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(price);

export default function SellerStoreClient({ initialSeller = null, initialProducts = null }: { initialSeller?: Seller | null; initialProducts?: MarketplaceProduct[] | null }) {
  const { id } = useParams<{ id: string }>();
  const db = useFirestore();
  const sellerRef = useMemoFirebase(() => db && id ? doc(db, 'sellers', id) : null, [db, id]);
  const { data: seller, isLoading, error } = useDoc<Seller>(sellerRef);
  const productsRef = useMemoFirebase(() => db && id
    ? query(collection(db, 'marketplace_products'), where('sellerId','==',id), where('status','==','published'))
    : null, [db,id]);
  const { data: products, isLoading: loadingProducts } = useCollection<MarketplaceProduct>(productsRef);
  const visibleSeller = seller ?? initialSeller;
  const visibleProducts = products ?? initialProducts;
  const visible = visibleSeller?.status === 'active';
  return <div className="min-h-screen bg-[#f8f6f2]"><Header /><main className="section-shell pb-24 pt-8 sm:pt-12">
    <Link href="/products" className="text-xs underline underline-offset-4">Explore all creations</Link>
    {isLoading && !initialSeller ? <div className="mt-8 h-48 animate-pulse rounded-3xl bg-[#e7dfd4]"/> :
      (error && !initialSeller) || !visible ? <div className="mt-10 rounded-3xl border bg-white p-10 text-center"><Store className="mx-auto h-9 w-9 text-[#a68a64]"/><h1 className="mt-4 text-2xl font-semibold">Store currently unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This seller's storefront isn't available at the moment.</p></div> :
    <>
      <div className="mt-7 min-w-0 rounded-3xl border border-[#e7ded2] bg-white px-4 py-6 sm:p-10">
        <p className="eyebrow text-[#a68a64]">Independent Kerala creator</p>
        {/* Full-width store identity row: badge and sharing cannot squeeze the title. */}
        <div className="mt-5 flex min-w-0 items-center gap-3 sm:gap-5">
          {visibleSeller!.logoUrl && <img src={visibleSeller!.logoUrl} alt={visibleSeller!.businessName + ' logo'} className="h-14 w-14 shrink-0 rounded-2xl border border-[#ede6dd] bg-white object-contain p-1 sm:h-20 sm:w-20" />}
          <h1 className="min-w-0 flex-1 break-words text-[clamp(1.5rem,5.7vw,3rem)] font-semibold leading-[1.16] tracking-tight">{visibleSeller!.businessName}</h1>
        </div>
        <p className="mt-4 flex min-w-0 items-start gap-2 text-xs leading-5 text-[#71685e]">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7a8d62]"/>
          <span>Approved TreatStory seller · Marketplace approval is not third-party identity certification</span>
        </p>
        <div className="mt-5 flex min-w-0 flex-wrap items-center gap-3">
          <span className={`inline-flex min-h-10 items-center rounded-full px-4 py-2 text-xs font-medium ${visibleSeller!.isOpen?'bg-[#edf3e8] text-[#416836]':'bg-amber-50 text-amber-800'}`}>{visibleSeller!.isOpen?'Accepting new orders':'On a break'}</span>
          <StoreShareButton sellerId={id} storeName={visibleSeller!.businessName}/>
        </div>
        <p className="mt-6 max-w-2xl whitespace-pre-wrap break-words text-sm leading-7 text-[#6f655a]">{visibleSeller!.description}</p>
        <div className="mt-5 flex min-w-0 flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-[#f7f4ef] px-4 py-2">{visibleSeller!.businessCategory.replaceAll('-', ' ')}</span>
          {visibleSeller!.deliveryPincodes?.length ? <span className="flex min-w-0 items-center gap-1 break-words rounded-full bg-[#f7f4ef] px-4 py-2"><MapPin className="h-3.5 w-3.5 shrink-0"/>Delivery to {visibleSeller!.deliveryPincodes.join(', ')}</span> : null}
          {visibleSeller!.deliveryMethods?.includes('pickup') && <span className="rounded-full bg-[#f7f4ef] px-4 py-2">Pickup available</span>}
        </div>
      </div>
      <section className="mt-12"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-medium">From this creator</h2><span className="text-xs text-muted-foreground">{visibleProducts?.length ?? 0} products</span></div>
        {loadingProducts && !initialProducts ? <div className="mt-6 h-44 animate-pulse rounded-3xl bg-[#eee8df]"/> : !visibleProducts?.length ?
        <div className="mt-6 rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground"><Package className="mx-auto mb-3 h-8 w-8"/>No published products yet.</div> :
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{visibleProducts.map(p=><Link key={p.id} href={`/product/seller:${encodeURIComponent(p.id)}`} className="group overflow-hidden rounded-2xl border bg-white"><div className="relative aspect-[4/5] overflow-hidden bg-[#f3eee8]"><ProductImage src={p.imageUrls?.[0]} alt={p.name}/></div><div className="p-4"><p className="line-clamp-2 text-sm font-semibold">{p.name}</p><p className="mt-1 text-xs text-muted-foreground">{p.category}</p><p className="mt-3 text-sm font-semibold">{p.showPrice?money(p.price):'Price on request'}</p></div></Link>)}</div>}
      </section>
    </>}
  </main></div>;
}
