import { Header } from '@/components/header';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="section-shell py-8 sm:py-12 lg:py-16">
          <div
            role="img"
            aria-label="The Story Behind TreatStory — a Kerala-born marketplace bringing together home bakers, crafters and handmade creators. A warm still life of cake, handmade gifts, embroidery and crafts."
            className="relative isolate overflow-hidden rounded-[22px] bg-[#f3e7db] shadow-sm sm:rounded-[30px]"
          >
            {/* The first layer is the supplied Our Story photograph; the existing
                illustration remains as a safe fallback until the asset is published. */}
            <div
              className="hidden aspect-[3/2] w-full bg-cover bg-center sm:block"
              style={{ backgroundImage: "url('/img/our-story-banner.webp'), url('/img/our-story-creators.svg')" }}
            />
            <div className="sm:hidden">
              <div
                className="aspect-[5/4] w-full bg-cover bg-[65%_center]"
                style={{ backgroundImage: "url('/img/our-story-banner.webp'), url('/img/our-story-creators.svg')" }}
              />
              <div className="space-y-4 bg-[#f7ede3] px-6 py-8 text-[#30261d]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#99734e]">Our story</p>
                <h1 className="font-serif text-[clamp(2.1rem,8vw,3.4rem)] leading-[1.05] tracking-tight">
                  The Story Behind <em>TreatStory</em>
                </h1>
                <p className="text-[15px] leading-7">
                  A Kerala-born marketplace that brings together talented home bakers, crafters, and handmade creators, giving their creations a bigger, brighter audience.
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-14 grid max-w-4xl gap-10 sm:mt-20 sm:grid-cols-2 sm:gap-16">
            <div><p className="eyebrow text-[#a68a64]">Our point of view</p><h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">Thoughtful things, without the fuss.</h2></div>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
              <p>We believe the best finds are the ones that feel just right. That could be something useful, something beautiful, something to share, or simply something that makes you smile.</p>
              <p>Our collection is designed to grow across categories and interests, bringing different kinds of good things together in one welcoming place.</p>
              <Link href="/products" className="inline-flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-[0.15em] text-foreground">Explore TreatStory <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#e8e0d5] py-7">
        <div className="section-shell flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <Link href="/" className="brand-wordmark text-2xl">TreatStory</Link>
          <div className="flex gap-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground"><Link href="/terms-of-service">Terms</Link><Link href="/privacy-policy">Privacy</Link></div>
          <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} TreatStory</p>
        </div>
      </footer>
    </div>
  );
}
