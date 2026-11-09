'use client';

import { SectionSkeleton } from '@/components/loading-states';
import Link from 'next/link';
import { Header } from '@/components/header';
import { useCart } from '@/context/cart-context';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EnquirySettings } from '@/lib/products';
import { ArrowLeft, Minus, Plus, Trash2, ShoppingBag, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const money = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
export default function CartPage() {
  const { hydrated, cartItems, removeFromCart, updateQuantity, clearCart, cartCount } = useCart();
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'enquiry') : null, [db]);
  const { data: settings } = useDoc<EnquirySettings>(settingsRef);
  const sellerItems = cartItems.filter(p => p.id.startsWith('seller:'));
  const legacyItems = cartItems.filter(p => !p.id.startsWith('seller:'));
  const subtotal = cartItems.filter(p => p.showPrice).reduce((sum, p) => sum + p.price * p.quantity, 0);
  const sendLegacyEnquiry = () => {
    if (!settings?.whatsappNumber || legacyItems.length === 0) return;
    const lines = legacyItems.map(p => `${p.name} × ${p.quantity}${p.showPrice ? ' — ' + money(p.price * p.quantity) : ' (price on request)'}`).join('\n');
    const total = legacyItems.filter(p => p.showPrice).reduce((sum, p) => sum + p.price * p.quantity, 0);
    const template = settings.prefilledText || 'Hello TreatStory, I would like to enquire about:\n{{items}}\nTotal: {{total}}';
    const message = template.replace('{{items}}', lines).replace('{{total}}', money(total));
    window.open(`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell py-10 sm:py-16">
    <Link href="/products" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Continue exploring</Link>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b pb-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Your TreatStory edit</p><h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Shopping bag <span className="text-[#a68a64]">({cartCount})</span></h1></div>{cartItems.length > 0 && <Button variant="outline" onClick={clearCart} className="rounded-full">Clear bag</Button>}</div>
    {!hydrated ? <SectionSkeleton /> : !cartItems.length ? <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center"><ShoppingBag className="h-12 w-12 text-[#a68a64]" /><h2 className="mt-6 text-2xl font-medium">Your bag is waiting for a story.</h2><p className="mt-3 text-sm text-muted-foreground">Explore handmade finds and add something you love.</p><Link href="/products" className="editorial-button mt-7">Explore products</Link></div> :
    <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">{cartItems.map(item => <article key={item.lineId} className="flex gap-4 rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:gap-6 sm:p-6">
        <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-[#eee9e0] sm:h-36 sm:w-28">{item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />}</div>
        <div className="flex min-w-0 flex-1 flex-col"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-[#a68a64]">{item.id.startsWith('seller:') ? 'Independent creator' : 'TreatStory collection'}</p><h2 className="mt-2 text-base font-medium sm:text-lg">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{item.category}</p>{item.minimumOrderQuantity && item.minimumOrderQuantity > 1 && <p className="mt-1 text-xs text-[#846b49]">Minimum {item.minimumOrderQuantity} units</p>}{item.customizationNote && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#f7f5f1] p-2 text-xs text-[#6e6050]">Personalization: {item.customizationNote}</p>}</div><button aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.lineId)} className="rounded-full p-2 text-muted-foreground hover:bg-[#f7f5f1] hover:text-foreground"><Trash2 className="h-4 w-4" /></button></div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5"><div className="inline-flex items-center rounded-full border"><button aria-label={`Decrease ${item.name}`} onClick={() => updateQuantity(item.lineId, item.quantity - 1)} className="p-2"><Minus className="h-4 w-4" /></button><span className="w-8 text-center text-sm">{item.quantity}</span><button aria-label={`Increase ${item.name}`} onClick={() => updateQuantity(item.lineId, Math.min(99, item.quantity + 1))} className="p-2"><Plus className="h-4 w-4" /></button></div><p className="font-semibold">{item.showPrice ? money(item.price * item.quantity) : 'Price on request'}</p></div></div>
      </article>)}</div>
      <aside className="h-fit rounded-3xl border border-[#e8e0d5] bg-white p-7 lg:sticky lg:top-28"><h2 className="text-xl font-medium">Bag summary</h2><div className="mt-6 flex justify-between text-sm"><span className="text-muted-foreground">Items</span><span>{cartCount}</span></div><div className="mt-4 flex justify-between border-t pt-4 text-lg font-semibold"><span>Displayed subtotal</span><span>{money(subtotal)}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Prices on request, delivery and other charges are not included.</p>
      {legacyItems.length > 0 && <Button onClick={sendLegacyEnquiry} disabled={!settings?.whatsappNumber} className="mt-7 w-full rounded-full"><Send className="mr-2 h-4 w-4" />Enquire about TreatStory items</Button>}
      {sellerItems.length > 0 && <div className="mt-6 space-y-3 border-t pt-6"><Link href="/checkout" className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#29251f] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#51463a]">Proceed to checkout</Link><p className="text-center text-xs leading-5 text-muted-foreground">Cash on Delivery · Seller-confirmed delivery · No online payment</p></div>}
      </aside>
    </div>}
  </main></div>;
}
