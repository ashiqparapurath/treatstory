import { Header } from '@/components/header';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="section-shell py-12 sm:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <p className="eyebrow inline-flex items-center gap-2 text-[#a68a64]"><Sparkles className="h-3.5 w-3.5" /> A little about us</p>
            <h1 className="mt-5 text-5xl font-medium leading-[1.02] tracking-[-0.06em] sm:text-7xl">Every find has a <span className="font-serif italic font-normal text-[#a68a64]">story.</span></h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">TreatStory is a place for thoughtful discoveries — a growing collection of pieces for everyday life, meaningful moments and everything in between.</p>
          </div>
          <div className="relative mt-12 aspect-[4/3] sm:aspect-[16/9] overflow-hidden rounded-[26px] bg-[#e8dfd2] sm:mt-16">
            <Image src="/img/landing-hero.webp" alt="Homemade cakes, cookies and handmade gifts from independent makers" fill sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 48px), (max-width: 1439px) calc(100vw - 80px), 1360px" className="object-cover object-[35%_center] sm:object-center" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            <p className="absolute bottom-5 left-5 text-sm font-medium text-white sm:bottom-8 sm:left-8 sm:text-lg">Made for the moments that make a day.</p>
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
