'use client';

import { instagramProfileUrl } from '@/lib/seller-profile-details';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { collection, doc, query, where } from 'firebase/firestore';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Header } from '@/components/header';
import { SellerProductCollection } from '@/components/seller-product-collection';
import type { Seller, MarketplaceProduct } from '@/lib/marketplace-types';
import { BadgeCheck, Instagram, MapPin, Package, Store, Truck } from 'lucide-react';
import { StoreShareButton } from '@/components/store-share-button';
import { sellerCoverageLabel } from '@/lib/delivery-coverage';

const categoryLabels: Record<Seller['businessCategory'], string> = {
  'home-bakery': 'Home bakery',
  art: 'Art & design',
  handmade: 'Handmade goods',
  other: 'Independent creator',
};

export default function SellerStoreClient({ initialSeller = null, initialProducts = null }: {
  initialSeller?: Seller | null;
  initialProducts?: MarketplaceProduct[] | null;
}) {
  const params = useParams<{ id: string }>();
  const id = initialSeller?.id || params.id;
  const db = useFirestore();
  const sellerRef = useMemoFirebase(() => db && id ? doc(db, 'sellers', id) : null, [db, id]);
  const { data: seller, isLoading, error } = useDoc<Seller>(sellerRef);
  const productsRef = useMemoFirebase(() => db && id
    ? query(collection(db, 'marketplace_products'), where('sellerId', '==', id), where('status', '==', 'published'))
    : null, [db, id]);
  const { data: products, isLoading: loadingProducts } = useCollection<MarketplaceProduct>(productsRef);
  const visibleSeller = seller ?? initialSeller;
  const visibleProducts = products ?? initialProducts;
  const instagramUrl = instagramProfileUrl(visibleSeller?.instagramUrl || '');
  const fssaiNumber = visibleSeller?.fssaiNumber ?? visibleSeller?.foodLicenseNumber;
  const visible = visibleSeller?.status === 'active';

  return (
    <div className="min-h-screen bg-[#f8f6f2]">
      <Header />
      <main className="section-shell pb-24 pt-6 sm:pt-10">
        <Link href="/products" className="inline-flex min-h-10 items-center text-xs font-medium text-[#7e6d5b] underline-offset-4 hover:underline">
          Explore all creations
        </Link>
        {isLoading && !initialSeller ? (
          <div className="mt-5 h-48 animate-pulse rounded-[28px] bg-[#e7dfd4]" />
        ) : (error && !initialSeller) || !visible ? (
          <div className="mt-6 rounded-3xl border bg-white p-10 text-center">
            <Store className="mx-auto h-9 w-9 text-[#a68a64]" />
            <h1 className="mt-4 text-2xl font-semibold">Store currently unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">This seller&apos;s storefront isn&apos;t available at the moment.</p>
          </div>
        ) : (
          <>
            <section aria-labelledby="seller-store-name" className="mt-4 min-w-0 overflow-hidden rounded-[28px] border border-[#e9dfd2] bg-white shadow-[0_10px_32px_rgba(54,37,22,0.045)] sm:mt-6">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#eee7de] bg-gradient-to-r from-[#faf5ed] to-[#fffdfb] px-5 py-3.5 sm:px-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#9b7953]">Independent TreatStory creator</p>
                <span className="hidden shrink-0 text-[10px] font-medium tracking-wide text-[#998a79] sm:inline">THE MAKERS EDIT</span>
              </div>
              <div className="px-5 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-7">
                <div className="flex min-w-0 items-start gap-3.5 sm:gap-5">
                  {visibleSeller!.logoUrl ? (
                    <img src={visibleSeller!.logoUrl} alt={visibleSeller!.businessName + ' logo'}
                      className="h-16 w-16 shrink-0 rounded-[18px] border border-[#eee7de] bg-[#faf8f4] object-contain p-1.5 shadow-sm sm:h-20 sm:w-20" />
                  ) : (
                    <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-[#eee7de] bg-[#f8f2e9] text-[#8d7357] sm:h-20 sm:w-20">
                      <Store className="h-7 w-7" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="mb-1 text-[11px] font-medium text-[#99836a]">{categoryLabels[visibleSeller!.businessCategory]}</p>
                    <h1 id="seller-store-name" className="min-w-0 break-words text-[clamp(1.45rem,5.3vw,2.6rem)] font-semibold leading-[1.17] tracking-[-0.035em] text-[#2e251f] [overflow-wrap:anywhere]">
                      {visibleSeller!.businessName}
                    </h1>
                    <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[#f1f5ed] px-3 py-1 text-[11px] font-medium text-[#536b43]">
                        <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                        TreatStory approved
                      </span>
                      <span className={'inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ' +
                        (visibleSeller!.isOpen ? 'bg-[#eaf3e9] text-[#416836]' : 'bg-[#faf1e6] text-[#956b36]')}>
                        <span aria-hidden="true" className={'h-1.5 w-1.5 rounded-full ' + (visibleSeller!.isOpen ? 'bg-[#69915b]' : 'bg-[#b4864d]')} />
                        {visibleSeller!.isOpen ? 'Accepting new orders' : 'On a break'}
                      </span>
                    </div>
                  </div>
                </div>
                {visibleSeller!.description && (
                  <p className="mt-5 max-w-3xl whitespace-pre-wrap break-words text-[13px] leading-6 text-[#695f55] sm:text-sm">
                    {visibleSeller!.description}
                  </p>
                )}
                <div className="mt-5 flex min-w-0 flex-wrap items-center gap-2">
                  {instagramUrl && (
                    <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e7ddd0] bg-white px-4 text-xs font-semibold text-[#4e4030] transition hover:bg-[#f7f2ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9b805f]">
                      <Instagram aria-hidden="true" className="h-4 w-4" />
                      Instagram
                    </a>
                  )}
                  <StoreShareButton sellerId={visibleSeller!.slug || id} storeName={visibleSeller!.businessName} />
                </div>
                {(visibleSeller!.businessCity || visibleSeller!.businessState ||
                  visibleSeller!.deliveryMethods?.includes('delivery') ||
                  visibleSeller!.deliveryMethods?.includes('pickup')) && (
                  <div className="mt-5 flex min-w-0 flex-wrap gap-2 border-t border-[#f0e9df] pt-4">
                    {(visibleSeller!.businessCity || visibleSeller!.businessState) && (
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#f7f4ef] px-3 py-2 text-[11px] leading-4 text-[#756b60]">
                        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-words">Based in {[visibleSeller!.businessCity, visibleSeller!.businessState].filter(Boolean).join(', ')}</span>
                      </span>
                    )}
                    {visibleSeller!.deliveryMethods?.includes('delivery') && (
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#f7f4ef] px-3 py-2 text-[11px] leading-4 text-[#756b60]">
                        <Truck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-words">{sellerCoverageLabel(visibleSeller!)}</span>
                      </span>
                    )}
                    {visibleSeller!.deliveryMethods?.includes('pickup') && (
                      <span className="inline-flex items-center rounded-full bg-[#f7f4ef] px-3 py-2 text-[11px] text-[#756b60]">Pickup available</span>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-1.5 text-[11px] leading-5 text-[#8c8176] sm:flex-row sm:flex-wrap sm:gap-x-4">
                  <p>Marketplace approval is not third-party identity verification.</p>
                  {fssaiNumber && (
                    <p className="min-w-0 break-words [overflow-wrap:anywhere]">
                      FSSAI number (seller supplied): <span className="font-medium text-[#6e6155]">{fssaiNumber}</span>
                    </p>
                  )}
                </div>
              </div>
            </section>
            <section className="mt-9 sm:mt-12" aria-labelledby="seller-products-title">
              <div className="mb-5 flex min-w-0 items-end justify-between gap-3 sm:mb-6">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b7953]">The collection</p>
                  <h2 id="seller-products-title" className="mt-1 text-xl font-semibold tracking-tight text-[#2e251f] sm:text-2xl">Made by {visibleSeller!.businessName}</h2>
                </div>
                <span className="shrink-0 text-xs text-[#8d8275]">{visibleProducts?.length ?? 0} products</span>
              </div>
              {loadingProducts && !initialProducts ? (
                <div className="h-44 animate-pulse rounded-3xl bg-[#eee8df]" />
              ) : !visibleProducts?.length ? (
                <div className="rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground">
                  <Package className="mx-auto mb-3 h-8 w-8" />
                  No published products yet.
                </div>
              ) : (
                <SellerProductCollection products={visibleProducts} />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
