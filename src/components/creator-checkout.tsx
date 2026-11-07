'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { SectionSkeleton } from '@/components/loading-states';
import { addressText } from '@/components/default-delivery-address';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useAccountData, useFirestore, useUser } from '@/firebase';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import type { MarketplaceProduct, Seller } from '@/lib/marketplace-types';
import { Banknote, CreditCard, MapPin, ShieldCheck, Truck, CheckCircle2, ClipboardCopy } from 'lucide-react';

export function CreatorCheckout({ variant = 'card', onlyProductId, initialNote = '', onComplete }: { variant?: 'card' | 'page'; onlyProductId?: string; initialNote?: string; onComplete?: () => void }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { address: savedAddress } = useAccountData();
  const { cartItems, removeFromCart } = useCart();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState(initialNote);
  useEffect(() => { if (initialNote) setNote(v => v || initialNote); }, [initialNote]);
  const [busy, setBusy] = useState(false);
  const paymentMethod = 'cod' as const;
  const [result, setResult] = useState<string[]>([]);
  const items = cartItems.filter(i => i.id.startsWith('seller:') && (!onlyProductId || i.id === 'seller:' + onlyProductId));
  useEffect(() => { if (!savedAddress) return; setName(v=>v||savedAddress.recipient||'');setPhone(v=>v||savedAddress.phone||'');setAddress(v=>v||addressText(savedAddress)); }, [savedAddress]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!db || !user || busy || !items.length) return;
    setBusy(true);
    const placed: string[] = [];
    let stage = 'checking the product';
    try {
      // Orders are deliberately submitted per listing so rules can verify
      // each product, seller, price and quantity independently.
      for (const item of items) {
        const productId = item.id.slice('seller:'.length);
        stage = 'reading product details';
        const snapshot = await getDoc(doc(db, 'marketplace_products', productId));
        if (!snapshot.exists()) throw new Error('A product is no longer available.');
        const product = snapshot.data() as MarketplaceProduct;
        if (product.status !== 'published' || product.availability === 'unavailable' || !product.showPrice) throw new Error(`${product.name} cannot be ordered.`);
        stage = 'reading seller eligibility';
        const sellerSnapshot = await getDoc(doc(db, 'sellers', product.sellerId));
        if (!sellerSnapshot.exists()) throw new Error(`The seller for ${product.name} is no longer available.`);
        const seller = sellerSnapshot.data() as Seller;
        if (seller.status !== 'active') throw new Error(`${seller.businessName || 'This seller'} is not currently active.`);
        if (!seller.isOpen) throw new Error(`${seller.businessName || 'This seller'} is not accepting orders right now.`);
        const expiry = seller.accessEndsAt as { toMillis?: () => number } | undefined;
        if (!expiry?.toMillis || expiry.toMillis() <= Date.now()) throw new Error(`${seller.businessName || 'This seller'}'s marketplace access has expired.`);
        if (!Number.isInteger(item.quantity) || item.quantity < Math.max(1, product.minimumOrderQuantity ?? 1) || item.quantity > 99) throw new Error(`Please order at least ${product.minimumOrderQuantity || 1} unit(s) of ${product.name} (maximum 99).`);
        const itemNote = [item.customizationNote ? `Personalization for ${product.name}: ${item.customizationNote}` : '', note.trim()].filter(Boolean).join('\n\n');
        if (itemNote.length > 1000) throw new Error('Please shorten your customization and delivery notes.');
        if (name.trim().length < 2 || phone.trim().length < 5 || address.trim().length < 10) throw new Error('Please complete your contact and delivery details.');
        stage = 'creating the order';
        const order = await addDoc(collection(db, 'seller_orders'), {
          buyerUid: user.uid, sellerId: product.sellerId, productId,
          productName: product.name, quantity: item.quantity,
          unitPrice: product.price, subtotal: product.price * item.quantity,
          status: 'pending', paymentMethod, customerName: name.trim(), customerPhone: phone.trim(),
          deliveryAddress: address.trim(), customerNote: itemNote,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        placed.push(order.id);
        removeFromCart(item.id);
      }
      setResult(placed);
      if (placed.length > 0) onComplete?.();
      toast({ title: 'Orders submitted', description: `${placed.length} creator order(s) placed.` });
    } catch (err) {
      if (placed.length) { setResult(placed); onComplete?.(); }
      const message = err instanceof Error ? err.message : 'Please retry remaining items.';
      const helpful = message.toLowerCase().includes('permission') ? 'We couldn’t confirm this order. Please refresh and check availability, or contact the seller.' : message;
      console.error('TreatStory checkout failed', { stage, code: (err as { code?: string })?.code, message });
      toast({ variant: 'destructive', title: 'Could not finish checkout', description: `${placed.length} order(s) succeeded. ${helpful}` });
    } finally { setBusy(false); }
  }
  if (!items.length && !result.length) return null;
  return <section className={variant === 'page' ? 'space-y-7 rounded-3xl border border-[#e8e0d5] bg-white p-5 shadow-[0_14px_45px_rgba(51,39,24,0.04)] sm:p-8 lg:p-10' : 'mt-7 space-y-6 rounded-3xl border border-[#e8e0d5] bg-[#faf8f4] p-5 sm:p-7'}>
    <div className="border-b border-[#e8e0d5] pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Step 02 · Secure checkout</p><h3 className="mt-2 text-2xl font-medium tracking-tight">Delivery & payment</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Order handmade favourites from independent creators. Your seller confirms the order before fulfillment.</p></div>
    {result.length > 0 && <div role="status" aria-live="polite" className="rounded-3xl border border-[#e1d7c8] bg-[#f8f5ee] p-6 text-center sm:p-9"><CheckCircle2 className="mx-auto h-12 w-12 text-[#668657]"/><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a68a64]">Order received</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Thank you for ordering!</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71685e]">We've received your TreatStory order request. Your seller will review and confirm preparation and delivery details. No payment was collected online.</p><div className="mx-auto mt-5 max-w-lg space-y-2 rounded-2xl border bg-white p-4 text-left"><p className="mb-2 text-xs font-semibold text-[#796b58]">Your order {result.length === 1 ? 'ID' : 'IDs'}</p>{result.map(id => <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f5f1] px-3 py-2"><code className="min-w-0 break-all text-xs font-semibold text-[#29251f]">{id}</code><button type="button" aria-label={`Copy order ID ${id}`} className="shrink-0 rounded-full border p-2" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(id); }}><ClipboardCopy className="h-4 w-4"/></button></div>)}</div><Link href="/orders" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#29251f] px-6 text-sm font-semibold text-white">Track your orders</Link></div>}
    {isUserLoading ? <SectionSkeleton /> : !user ? <div className="rounded-2xl bg-white p-5"><p className="text-sm">Sign in to continue to checkout.</p><Link href={`/login?next=${encodeURIComponent(onlyProductId ? `/checkout?product=${encodeURIComponent(onlyProductId)}` : "/checkout")}`} className="editorial-button mt-4">Sign in</Link></div> : items.length > 0 && <form onSubmit={submit} className="space-y-6">
      <div className="space-y-4"><p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#a68a64]" />Contact & delivery details</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5 text-xs font-medium">Full name<Input required minLength={2} maxLength={120} autoComplete="name" placeholder="Name for your order" value={name} onChange={e => setName(e.target.value)} className="mt-1 bg-white" /></label>
      <label className="block space-y-1.5 text-xs font-medium">Mobile number<Input required minLength={5} maxLength={40} autoComplete="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 bg-white" /></label></div>
      <label className="block space-y-1.5 text-xs font-medium">Delivery address<Textarea required minLength={10} maxLength={1000} autoComplete="street-address" placeholder="House / building, street, locality, city, PIN code" value={address} onChange={e => setAddress(e.target.value)} className="mt-1 min-h-24 bg-white" /></label>
      <label className="block space-y-1.5 text-xs font-medium">Notes for the creator (optional)<Textarea maxLength={1000} placeholder="Customisation, delivery instructions…" value={note} onChange={e => setNote(e.target.value)} className="mt-1 bg-white" /></label></div>
      <div className="space-y-3 border-t border-[#e8e0d5] pt-5"><p className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4 text-[#a68a64]" />Payment method</p>
      <div className="flex items-start gap-3 rounded-2xl border-2 border-[#bda17b] bg-[#fcfaf6] p-4 sm:p-5"><span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[5px] border-[#846b49] bg-white" aria-hidden="true" /><Banknote className="mt-0.5 h-5 w-5 text-[#846b49]" /><span><span className="block text-sm font-semibold">Cash on Delivery (COD)</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Pay when your order arrives. Availability and delivery charges are confirmed by the seller.</span></span></div>
      <div className="flex items-start gap-3 rounded-2xl border border-dashed p-4 text-muted-foreground"><CreditCard className="h-5 w-5 shrink-0" /><span className="text-xs leading-5"><strong className="block text-foreground">UPI / Cards / Net banking</strong>Coming soon. Online payments are not available yet, and no money will be collected now.</span></div></div>
      <div className="space-y-3 border-t border-[#e8e0d5] pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-4 w-4" />Shipping charges and COD availability are subject to seller confirmation.</p><Button type="submit" disabled={busy || !db} className="h-14 w-full rounded-full bg-[#29251f] text-sm font-semibold transition hover:bg-[#51463a]">{busy ? 'Placing your order…' : `Place ${items.length} COD order${items.length === 1 ? '' : 's'}`}</Button><p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4" />No online payment required</p></div>
    </form>}
  </section>;
}
