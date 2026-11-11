'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, query, where } from 'firebase/firestore';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Header } from '@/components/header';
import { ProductImage } from '@/components/product-image';
import type { Seller, MarketplaceProduct } from '@/lib/marketplace-types';
import { Store, BadgeCheck, MapPin, Package } from 'lucide-react';

const money = (price: number) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(price);

export default function SellerStorePage() {
  const { id } = useParams<{ id: string }>();
  const db = useFirestore();
  const sellerRef = useMemoFirebase(() => db && id ? doc(db, 'sellers', id) : null, [db, id]);
  const { data: seller, isLoading, error } = useDoc<Seller>(sellerRef);
  const productsRef = useMemoFirebase(() => db && id
    ? query(collection(db, 'marketplace_products'), where('sellerId','==',id), where('status','==','published'))
    : null, [db,id]);
  const { data: products, isLoading: loadingProducts } = useCollection<MarketplaceProduct>(productsRef);
  const visible = seller?.status === 'active';
  return <div className="min-h-screen bg-[#f8f6f2]"><Header /><main className="section-shell pb-24 pt-8 sm:pt-12">
    <Link href="/products" className="text-xs underline underline-offset-4">Explore all creations</Link>
    {isLoading ? <div className="mt-8 h-48 animate-pulse rounded-3xl bg-[#e7dfd4]"/> :
      error || !visible ? <div className="mt-10 rounded-3xl border bg-white p-10 text-center"><Store className="mx-auto h-9 w-9 text-[#a68a64]"/><h1 className="mt-4 text-2xl font-semibold">Store currently unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This seller's storefront isn't available at the moment.</p></div> :
    <>
      <div className="mt-7 rounded-3xl border border-[#e7ded2] bg-white p-6 sm:p-10"><p className="eyebrow text-[#a68a64]">Independent Kerala creator</p><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-4">{seller.logoUrl && <img src={seller.logoUrl} alt={seller.businessName + " logo"} className="h-16 w-16 shrink-0 rounded-2xl border border-[#ede6dd] bg-white object-contain p-1 sm:h-20 sm:w-20" />}<h1 className="min-w-0 break-words text-3xl font-semibold sm:text-5xl">{seller.businessName}</h1></div><p className="mt-3 flex items-center gap-2 text-xs text-[#71685e]"><BadgeCheck className="h-4 w-4 text-[#7a8d62]"/>Approved TreatStory seller · Marketplace approval is not third-party identity certification</p></div><span className={`rounded-full px-4 py-2 text-xs ${seller.isOpen?'bg-[#edf3e8] text-[#416836]':'bg-amber-50 text-amber-800'}`}>{seller.isOpen?'Accepting new orders':'On a break'}</span></div><p className="mt-6 max-w-2xl whitespace-pre-wrap text-sm leading-7 text-[#6f655a]">{seller.description}</p><div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="rounded-full bg-[#f7f4ef] px-4 py-2">{seller.businessCategory.replaceAll('-', ' ')}</span>{seller.deliveryPincodes?.length ? <span className="flex items-center gap-1 rounded-full bg-[#f7f4ef] px-4 py-2"><MapPin className="h-3.5 w-3.5"/>Delivery to {seller.deliveryPincodes.join(', ')}</span> : null}{seller.deliveryMethods?.includes('pickup') && <span className="rounded-full bg-[#f7f4ef] px-4 py-2">Pickup available</span>}</div></div>
      <section className="mt-12"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-medium">From this creator</h2><span className="text-xs text-muted-foreground">{products?.length ?? 0} products</span></div>
        {loadingProducts ? <div className="mt-6 h-44 animate-pulse rounded-3xl bg-[#eee8df]"/> : !products?.length ?
        <div className="mt-6 rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground"><Package className="mx-auto mb-3 h-8 w-8"/>No published products yet.</div> :
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{products.map(p=><Link key={p.id} href={`/product/seller:${encodeURIComponent(p.id)}`} className="group overflow-hidden rounded-2xl border bg-white"><div className="relative aspect-[4/5] overflow-hidden bg-[#f3eee8]"><ProductImage src={p.imageUrls?.[0]} alt={p.name}/></div><div className="p-4"><p className="line-clamp-2 text-sm font-semibold">{p.name}</p><p className="mt-1 text-xs text-muted-foreground">{p.category}</p><p className="mt-3 text-sm font-semibold">{p.showPrice?money(p.price):'Price on request'}</p></div></Link>)}</div>}
      </section>
    </>}
  </main></div>;
}
