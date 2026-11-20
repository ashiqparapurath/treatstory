'use client';import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePublicCatalog } from '@/firebase/firestore/use-public-catalog';

import { Header } from '@/components/header';
import { SellerStorefrontProducts } from '@/components/seller-storefront-products';
import { ProductGridContainer } from '@/components/product-grid';
import { CatalogMaintenanceGate } from '@/components/catalog-maintenance-gate';
import Link from 'next/link';
import {HeroImage}from'@/components/hero-image';
import{BANNER_IMAGE_SIZES}from'@/lib/image-source';
import { OptimizedImage } from '@/components/optimized-image';
import { ImageOnlyBannerSlide } from '@/components/banner-image-slide';
import { BannerPlacedImage } from '@/components/banner-placed-image';
import { ArrowRight, Sparkles } from 'lucide-react';
import { FooterInstagramLink } from '@/components/footer-instagram-link';
import { MobileCategoryRail } from '@/components/mobile-category-rail';
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
  return <ProductGridContainer products={products} mobileCompact />;
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

  if (isLoading) return <Skeleton className="h-[clamp(200px,54vw,236px)] w-full rounded-[24px] sm:h-64 md:h-72" />;
  if (!banners || banners.length === 0) return <div className="relative flex min-h-[166px] items-center overflow-hidden rounded-[22px] bg-[#f2e5d7] px-5 md:hidden">
    <div className="absolute inset-y-0 right-0 w-[55%] opacity-70"><HeroImage alt="Homemade bakes and handmade creations"/></div>
    <div className="absolute inset-0 bg-gradient-to-r from-[#f2e5d7] via-[#f2e5d7]/95 to-transparent"/>
    <div className="relative z-10 max-w-[67%]"><p className="text-[10px] font-semibold text-[#95643f]">Made with care</p><h2 className="mt-2 text-[19px] font-semibold leading-6 text-[#34251b]">A little something lovely.</h2><Link href="/products" className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#874a28] px-3.5 text-[11px] font-semibold text-white">Explore collection<ArrowRight className="h-3.5 w-3.5"/></Link></div>
  </div>;

  return (
    <Carousel setApi={setApi} className="w-full" opts={{ align: "start", loop: true }}>
      <CarouselContent>
        {banners.map((banner,index) => (
          <CarouselItem key={banner.id}>
            <Card className="overflow-hidden rounded-[22px] border-0 bg-[#f7f0e8] shadow-none">
              {banner.displayMode === 'image-only' ? <ImageOnlyBannerSlide banner={banner}
                shouldLoad={requested.has(index) || index === active} active={index === active}
                onLoad={() => { if (index === active) setFirstLoaded(true); }} /> : <>
              <CardContent className="relative isolate min-h-[210px] overflow-hidden bg-[#f9f3eb] p-0 md:hidden">
                <div className="absolute inset-y-0 right-0 w-[56%] bg-[#e9d9c6]">{banner.mobilePlacement
                  ? <BannerPlacedImage src={banner.imageUrl} alt={banner.title}
                    ratio={banner.imageAspectRatio || 16 / 9} placement={banner.mobilePlacement}
                    shouldLoad={requested.has(index)||index===active} sizes="(max-width: 767px) 60vw, 0px"
                    onLoad={()=>{if(index===active)setFirstLoaded(true);}} />
                  : (requested.has(index)||index===active)&&<OptimizedImage src={banner.imageUrl} alt={banner.title} fill sizes="(max-width: 767px) 60vw, 0px" quality={75} loading="lazy" onLoad={()=>{if(index===active)setFirstLoaded(true);}} className="object-cover object-center"/>}</div>
                <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#f9f3eb_0%,#f9f3eb_45%,rgba(249,243,235,0.98)_65%,rgba(249,243,235,0.58)_83%,rgba(249,243,235,0.06)_100%)]"/>
                <div className="relative z-10 flex min-h-[210px] flex-col items-start justify-start gap-3 px-4 py-4 text-left">
                  <div className="w-[71%] min-w-0">
                    <span className="inline-flex rounded-full border border-[#e9d8ca] bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-[#78502f]">Made for you</span>
                    <h2 className="mt-2 line-clamp-4 text-[16px] font-semibold leading-[1.26] tracking-[-0.025em] text-[#33251c]">{banner.title}</h2>
                    <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-[1.45] text-[#685548]">{banner.subtitle}</p>
                  </div>
                  <Link href={banner.buttonLink} className="mt-1 inline-flex min-h-11 max-w-[76%] items-center justify-center gap-1.5 rounded-full bg-[#754328] px-3.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5c351f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]"><span className="min-w-0 truncate">{banner.buttonText}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/></Link>
                </div>
              </CardContent>
              <CardContent className="relative hidden h-[clamp(200px,54vw,236px)] items-center justify-center p-0 md:flex sm:h-64 md:h-72 lg:h-[340px]">
                <div className="absolute inset-0 bg-[#e8dfd2]"/>{banner.desktopPlacement
                  ? <BannerPlacedImage src={banner.imageUrl} alt={banner.title}
                    ratio={banner.imageAspectRatio || 16 / 9} placement={banner.desktopPlacement}
                    shouldLoad={requested.has(index)||index===active} sizes={BANNER_IMAGE_SIZES}
                    active={index===active} onLoad={()=>{if(index===active)setFirstLoaded(true);}} />
                  : (requested.has(index)||index===active)&&<OptimizedImage src={banner.imageUrl} alt={banner.title} fill sizes={BANNER_IMAGE_SIZES} quality={75} loading="lazy" fetchPriority={index===active?'auto':'low'} onLoad={()=>{if(index===active)setFirstLoaded(true);}} className="object-cover"/>}
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative max-w-2xl px-5 py-3 text-center text-white sm:px-10 sm:py-6">
                  <p className="eyebrow hidden text-white/80 sm:block">The TreatStory edit</p>
                  <h2 className="line-clamp-2 text-xl font-medium leading-tight tracking-tight sm:mt-3 sm:text-4xl md:text-5xl">{banner.title}</h2>
                  <p className="mx-auto mt-2 max-w-xl line-clamp-2 text-[11px] leading-4 text-white/85 sm:mt-3 sm:line-clamp-3 sm:text-base sm:leading-6">{banner.subtitle}</p>
                  <Button asChild className="mt-3 h-9 rounded-full bg-white px-4 text-[10px] font-semibold uppercase tracking-widest text-foreground hover:bg-white/90 sm:mt-6 sm:h-10 sm:px-6 sm:text-xs">
                    <Link href={banner.buttonLink}>{banner.buttonText}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </CardContent>
              </>}
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="absolute left-4 top-1/2 hidden -translate-y-1/2 border-white/50 bg-white/30 backdrop-blur-xl md:flex" />
      <CarouselNext className="absolute right-4 top-1/2 hidden -translate-y-1/2 border-white/50 bg-white/30 backdrop-blur-xl md:flex" />
      <div className="mt-3 flex items-center justify-center gap-1.5 md:hidden" aria-label={`Banner ${active + 1} of ${banners.length}`}>{banners.map((banner,n)=><span key={banner.id} className={`h-1.5 rounded-full ${n===active?'w-5 bg-[#874a28]':'w-1.5 bg-[#e4ddd6]'}`} />)}</div>
    </Carousel>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1"><h1 className="sr-only md:hidden">TreatStory — discover home bakes and handmade creations across India</h1>
        <section className="section-shell hidden pb-10 pt-9 md:block sm:pb-10 sm:pt-8 lg:pb-12 lg:pt-10">
          <div className="grid items-center gap-7 md:grid-cols-[0.95fr_1.05fr] md:gap-8 lg:gap-10">
            <div className="relative z-10 order-1 min-w-0 max-w-xl pb-0 md:pb-0">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e6ded2] bg-white/70 px-3 py-2 sm:mb-3">
                <Sparkles className="h-3.5 w-3.5 text-[#b28f62]" />
                <span className="eyebrow text-[#8c7658]">Good things live here</span>
              </div>
              <h1 className="max-w-[18ch] text-[clamp(2.65rem,10.5vw,3.75rem)] font-medium leading-[1.08] tracking-[-0.055em] text-foreground sm:max-w-none sm:text-[clamp(2.5rem,5vw,5.2rem)] sm:leading-[0.98] sm:tracking-[-0.065em]">
                Little finds.<br /><span className="font-serif italic font-normal text-[#a68a64]">Lovely stories.</span>
              </h1>
              <p className="mt-5 max-w-[34ch] text-[15px] leading-7 text-muted-foreground sm:mt-4 sm:max-w-md sm:text-base">
                Discover homemade bakes, handmade gifts and creative finds from independent makers across India.
              </p>
              <div className="hero-cta-container mt-7 w-full sm:mt-5">
                <div className="flex flex-nowrap items-center gap-2 sm:gap-3">
                  <Link href="/products" aria-label="Explore collection" className="editorial-button min-h-12 shrink-0 whitespace-nowrap px-4 text-center sm:px-5">
                    <span className="hero-cta-short" aria-hidden="true">Explore</span>
                    <span className="hero-cta-full" aria-hidden="true">Explore collection</span>
                    <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                  </Link>
                  <Link href="/about" className="inline-flex min-h-12 shrink-0 items-center justify-center whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-foreground underline decoration-[#c7b08e] underline-offset-4 transition-colors hover:text-[#9b7d55]">Our story</Link>
                </div>
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
            <div className="relative order-1 hidden md:order-2 md:block">
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

        <section className="section-shell pb-7 pt-6 md:pb-11 md:pt-0">
          <div className="mb-4 flex items-center justify-between gap-4 md:mb-5 md:items-end">
            <div><p className="eyebrow hidden text-[#a68a64] md:block">A little inspiration</p><h2 className="text-[19px] font-semibold tracking-tight text-[#30251c] md:mt-2 md:text-3xl md:font-medium"> <span className="md:hidden">Special offers</span><span className="hidden md:inline">The latest from TreatStory</span></h2></div><Link href="/products" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-[#874a28] md:hidden">See all <ArrowRight className="h-3.5 w-3.5"/></Link>
            <Link href="/products" className="hidden items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] sm:flex">Shop all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <BannerCarousel />
        </section>

        <section className="bg-[#fffcf8] py-6 md:bg-[#f1ede6] md:py-12">
          <div className="section-shell">
            <CatalogMaintenanceGate>
            <div className="mb-9 border-b border-[#eee5dd] pb-7 md:hidden"><MobileCategoryRail /></div>
            <div className="mb-5 flex items-center justify-between gap-3 sm:mb-9 sm:items-end">
              <div><p className="eyebrow hidden text-[#a68a64] md:block">Picked for you</p><h2 className="text-[19px] font-semibold tracking-tight text-[#30251c] md:mt-2 md:text-4xl md:font-medium"><span className="md:hidden">Featured products</span><span className="hidden md:inline">Find your next favourite</span></h2><p className="mt-2 hidden text-sm text-muted-foreground md:block">Thoughtful finds, all in one happy place.</p></div>
              <Link href="/products" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]">View everything <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="mb-7"><SellerStorefrontProducts limitCount={8} /></div>
            <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}><HomePageContent /></Suspense>
            </CatalogMaintenanceGate>
          </div>
        </section>

        <section className="section-shell hidden py-9 md:block sm:py-12">
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
          <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground sm:gap-5"><Link href="/about" className="hover:text-foreground">Our story</Link><Link href="/terms-of-service" className="hover:text-foreground">Terms</Link><Link href="/privacy-policy" className="hover:text-foreground">Privacy</Link><FooterInstagramLink /></div>
          <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} TreatStory. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
