'use client';import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePublicCatalog } from '@/firebase/firestore/use-public-catalog';

import { Header } from '@/components/header';
import { SellerStorefrontProducts } from '@/components/seller-storefront-products';
import { ProductGridContainer } from '@/components/product-grid';
import Link from 'next/link';
import {HeroImage}from'@/components/hero-image';
import{BANNER_IMAGE_SIZES}from'@/lib/image-source';
import { OptimizedImage } from '@/components/optimized-image';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import type { Product, Banner } from '@/lib/products';
import { Skeleton } from '@/components/ui/skeleton';
import { Suspense, useEffect, useState } from 'react';

function HomePageContent() {
  const firestore = useFirestore();
  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'products'), limit(8));
  }, [firestore]);
  const { data: products, isLoading, error, retry } = usePublicCatalog<Product>(productsQuery);

  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={8} />;
  if (!products?.length) return null;
  return <ProductGridContainer products={products} />;
}

function BannerCarousel() {
  const[api,setApi]=useState<CarouselApi>(),[active,setActive]=useState(0),[firstLoaded,setFirstLoaded]=useState(false),[requested,setRequested]=useState(()=>new Set([0]));
  useEffect(()=>{if(!api)return;const select=()=>setActive(api.selectedScrollSnap());select();api.on('select',select);api.on('reInit',select);return()=>{api.off('select',select);api.off('reInit',select);};},[api]);
  const firestore = useFirestore();
  const bannersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'banners'), where('isActive', '==', true));
  }, [firestore]);
  const { data: banners, isLoading } = usePublicCatalog<Banner>(bannersQuery);

  useEffect(()=>{if(!firstLoaded||!banners?.length)return;setRequested(previous=>new Set([...previous,active,(active+1)%banners.length]));},[active,firstLoaded,banners?.length]);

  if (isLoading) return <Skeleton className="h-56 w-full rounded-[24px] md:h-72" />;
  if (!banners || banners.length === 0) return null;

  return (
    <Carousel setApi={setApi} className="w-full" opts={{ align: "start", loop: true }}>
      <CarouselContent>
        {banners.map((banner,index) => (
          <CarouselItem key={banner.id}>
            <Card className="overflow-hidden rounded-[24px] border-0 shadow-none">
              <CardContent className="relative flex min-h-72 items-center justify-center p-0 sm:min-h-0 sm:h-64 md:h-72 lg:h-[340px]">
                <div className="absolute inset-0 bg-[#e8dfd2]"/>{(requested.has(index)||index===active)&&<OptimizedImage src={banner.imageUrl} alt={banner.title} fill sizes={BANNER_IMAGE_SIZES} quality={75} loading="lazy" fetchPriority={index===active?'auto':'low'} onLoad={()=>{if(index===active)setFirstLoaded(true);}} className="object-cover"/>}
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative max-w-2xl px-5 py-6 text-center text-white sm:px-10">
                  <p className="eyebrow text-white/80">The TreatStory edit</p>
                  <h2 className="mt-3 text-2xl font-medium leading-tight tracking-tight sm:text-4xl md:text-5xl">{banner.title}</h2>
                  <p className="mx-auto mt-3 max-w-xl line-clamp-3 text-xs leading-5 text-white/85 sm:text-base">{banner.subtitle}</p>
                  <Button asChild className="mt-6 rounded-full bg-white px-6 text-xs font-semibold uppercase tracking-widest text-foreground hover:bg-white/90">
                    <Link href={banner.buttonLink}>{banner.buttonText}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="absolute left-4 top-1/2 hidden -translate-y-1/2 border-white/50 bg-white/30 backdrop-blur-xl md:flex" />
      <CarouselNext className="absolute right-4 top-1/2 hidden -translate-y-1/2 border-white/50 bg-white/30 backdrop-blur-xl md:flex" />
    </Carousel>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1">
        <section className="section-shell pb-7 pt-5 sm:pb-10 sm:pt-8 lg:pb-12 lg:pt-10">
          <div className="grid items-center gap-5 md:grid-cols-[0.95fr_1.05fr] md:gap-8 lg:gap-10">
            <div className="relative z-10 order-2 max-w-xl pb-1 md:order-1 md:pb-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e6ded2] bg-white/70 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-[#b28f62]" />
                <span className="eyebrow text-[#8c7658]">Good things live here</span>
              </div>
              <h1 className="text-[clamp(2.5rem,5vw,5.2rem)] font-medium leading-[0.98] tracking-[-0.065em] text-foreground">
                Little finds.<br /><span className="font-serif italic font-normal text-[#a68a64]">Lovely stories.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
                Discover homemade bakes, handmade gifts and creative finds from independent makers across Kerala.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link href="/products" className="editorial-button">Explore the collection <ArrowRight className="ml-2 h-4 w-4" /></Link>
                <Link href="/about" className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground underline decoration-[#c7b08e] underline-offset-4 transition-colors hover:text-[#9b7d55]">Our story</Link>
              </div>
              <div className="mt-6 hidden items-center gap-4 border-t border-[#e8e0d5] pt-5 sm:flex">
                <div className="flex -space-x-2">
                  <span className="h-7 w-7 rounded-full border-2 border-background bg-[#d9c8b1]" />
                  <span className="h-7 w-7 rounded-full border-2 border-background bg-[#b5b09b]" />
                  <span className="h-7 w-7 rounded-full border-2 border-background bg-[#e7d9c8]" />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">A little more joy in<br /><span className="font-semibold text-foreground">the everyday details.</span></p>
              </div>
            </div>
            <div className="relative order-1 md:order-2">
              <div className="relative aspect-[1.3/1] overflow-hidden rounded-[22px] bg-[#e8dfd2] md:aspect-[1.18/1] lg:aspect-[1.4/1]">
                <HeroImage alt="Artisanal cakes and homemade treats alongside embroidered crafts, handmade gifts and candles"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-white/80 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#3e342b] backdrop-blur-md sm:bottom-7 sm:left-7">
                  Curated with a little extra love
                </div>
              </div>
              <div className="absolute -bottom-5 -right-2 hidden rounded-2xl border border-[#e7ded1] bg-[#faf8f3] px-5 py-4 shadow-[0_12px_40px_rgba(54,43,29,0.08)] sm:block lg:-right-5">
                <p className="brand-wordmark text-2xl">TreatStory</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Find your little something</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-shell pb-8 sm:pb-11">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="eyebrow text-[#a68a64]">A little inspiration</p><h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">The latest from TreatStory</h2></div>
            <Link href="/products" className="hidden items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] sm:flex">Shop all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <BannerCarousel />
        </section>

        <section className="bg-[#f1ede6] py-9 sm:py-12">
          <div className="section-shell">
            <div className="mb-7 flex flex-col justify-between gap-3 sm:mb-9 sm:flex-row sm:items-end">
              <div><p className="eyebrow text-[#a68a64]">Picked for you</p><h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Find your next favourite</h2><p className="mt-2 text-sm text-muted-foreground">Thoughtful finds, all in one happy place.</p></div>
              <Link href="/products" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]">View everything <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="mb-7"><SellerStorefrontProducts limitCount={8} /></div>
            <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}><HomePageContent /></Suspense>
          </div>
        </section>

        <section className="section-shell py-9 sm:py-12">
          <div className="overflow-hidden rounded-[26px] bg-[#29241f] px-6 py-8 text-center text-[#faf8f3] sm:px-10 sm:py-10">
            <p className="eyebrow text-[#cbb18b]">The joy is in the finding</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-4xl">A good find can turn an ordinary day into a lovely story.</h2>
            <Link href="/products" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#faf8f3] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#29241f] transition hover:bg-white">Find yours <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#e8e0d5] bg-[#faf8f3] py-8">
        <div className="section-shell flex flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div><Link href="/" className="brand-wordmark text-3xl">TreatStory</Link><p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Little finds. Lovely stories.</p></div>
          <div className="flex flex-wrap justify-center gap-5 text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground"><Link href="/about" className="hover:text-foreground">Our story</Link><Link href="/terms-of-service" className="hover:text-foreground">Terms</Link><Link href="/privacy-policy" className="hover:text-foreground">Privacy</Link></div>
          <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} TreatStory. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
