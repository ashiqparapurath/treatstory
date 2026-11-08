'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionSkeleton } from '@/components/loading-states';
import { Header } from '@/components/header';
import { CreatorCheckout } from '@/components/creator-checkout';
import { useCart } from '@/context/cart-context';
import { ArrowLeft, LockKeyhole, ShoppingBag, Truck, ShieldCheck, PackageCheck } from 'lucide-react';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

function CheckoutContent() {
  const { cartItems, hydrated } = useCart();
  const params = useSearchParams();
  const directId = params.get('product');
  const directLineId = params.get('line');
  const customization = directId ? (params.get('customization') || '').slice(0, 950) : '';
  const [completed, setCompleted] = useState(false);
  const items = cartItems.filter(item => item.id.startsWith('seller:') && (!directId || item.id === 'seller:' + directId) && (!directLineId || item.lineId === directLineId));
  const total = items.reduce((sum, item) => sum + (item.showPrice ? item.price * item.quantity : 0), 0);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const legacyCount = cartItems.length - items.length;

  return <div className="min-h-screen bg-[#f8f6f2] text-[#29251f]"><Header />
    <main className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-7 sm:px-8 sm:pt-12 lg:px-10">
      <nav className="flex items-center gap-2 text-xs text-[#8d8378]" aria-label="Checkout progress">
        <Link href="/cart" className="transition hover:text-[#29251f]">Shopping bag</Link><span>/</span><span className="font-semibold text-[#29251f]">Checkout</span><span>/</span><span>Confirmation</span>
      </nav>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-b border-[#e6dfd4] pb-8 sm:mt-10">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a08360]">A thoughtful way to shop</p><h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Almost yours.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#756d64]">A few details, and your handmade finds are on their way to being yours.</p></div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e6dfd4] bg-white px-4 py-2 text-xs text-[#62594f]"><LockKeyhole className="h-4 w-4 text-[#a08360]" /> No online payment required</div>
      </div>
      {!hydrated ? <SectionSkeleton /> : items.length === 0 && !completed ? <div className="mx-auto max-w-lg py-24 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-[#a08360]" /><h2 className="mt-5 text-2xl font-medium">Your checkout is empty</h2><p className="mt-3 text-sm text-[#756d64]">Add a creation to your bag to continue.</p><Link href="/products" className="mt-7 inline-flex rounded-full bg-[#29251f] px-7 py-3 text-sm text-white">Explore creations</Link></div> :
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:gap-12">
        <div className="min-w-0 space-y-6">
          <CreatorCheckout variant="page" onlyProductId={directId ?? undefined} onlyLineId={directLineId ?? undefined} initialNote={customization} onComplete={() => setCompleted(true)} />
          <div className="grid gap-3 rounded-3xl border border-[#e6dfd4] bg-white p-5 text-xs leading-5 text-[#756d64] sm:grid-cols-2 sm:p-6">
            <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-[#a08360]" /><span><strong className="block text-[#29251f]">Your details stay protected</strong>Contact and delivery details are shared for order fulfillment.</span></div>
            <div className="flex gap-3"><Truck className="h-5 w-5 shrink-0 text-[#a08360]" /><span><strong className="block text-[#29251f]">Made with care</strong>Creators confirm fulfillment and delivery arrangements.</span></div>
          </div>
        </div>
        <aside className="min-w-0 lg:sticky lg:top-28">
          <div className="overflow-hidden rounded-3xl border border-[#e6dfd4] bg-white shadow-[0_14px_45px_rgba(51,39,24,0.04)]">
            <div className="flex items-center justify-between border-b border-[#eee8df] px-5 py-5 sm:px-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a08360]">Your selection</p><h2 className="mt-1 text-xl font-medium">Order summary</h2></div><span className="rounded-full bg-[#f3efe8] px-3 py-1.5 text-xs">{units} {units === 1 ? 'item' : 'items'}</span></div>
            <div className="max-h-[360px] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">{items.map(item => <div key={item.lineId} className="flex gap-4"><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#eee8df]">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : <PackageCheck className="m-auto mt-7 h-6 w-6 text-[#a08360]" />}<span className="absolute bottom-1 right-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow">×{item.quantity}</span></div><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-[#8d8378]">{item.category}</p>{item.customizationNote && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[#806b50]">Personalization: {item.customizationNote}</p>}<p className="mt-2 text-sm font-semibold">{item.showPrice ? money(item.price * item.quantity) : 'Price on request'}</p></div></div>)}</div>
            <div className="space-y-4 border-t border-[#eee8df] bg-[#fdfcf9] px-5 py-6 sm:px-7"><div className="flex justify-between text-sm text-[#756d64]"><span>Items subtotal</span><span className="font-medium text-[#29251f]">{money(total)}</span></div><div className="flex justify-between text-sm text-[#756d64]"><span>Delivery</span><span>To be confirmed</span></div><div className="flex justify-between border-t border-[#e6dfd4] pt-4 text-lg font-semibold"><span>Displayed subtotal</span><span>{money(total)}</span></div><p className="text-xs leading-5 text-[#8d8378]">Final amount and Cash on Delivery availability are confirmed by the seller. No payment is collected on this page.</p><Link href="/cart" className="inline-flex items-center gap-2 text-xs font-medium text-[#846b49] underline underline-offset-4"><ArrowLeft className="h-3.5 w-3.5" />Edit shopping bag</Link></div>
          </div>
          {legacyCount > 0 && <p className="mt-4 rounded-2xl border border-[#e6dfd4] bg-white p-4 text-xs leading-5 text-[#756d64]">{legacyCount} other bag item(s) are not included here. You can enquire about those separately from your shopping bag.</p>}
        </aside>
      </div>}
    </main>
  </div>;
}

export default function CheckoutPage() { return <Suspense fallback={<SectionSkeleton />}><CheckoutContent /></Suspense>; }
