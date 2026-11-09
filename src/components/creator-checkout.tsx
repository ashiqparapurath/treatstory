'use client';
import { errorToast, ActionError } from '@/lib/user-notices';

import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { SectionSkeleton } from '@/components/loading-states';
import { CheckoutAddressDialog } from '@/components/checkout-address-dialog';
import { savedAddressOptions } from '@/lib/addresses';
import { addressText } from '@/components/default-delivery-address';
import { useAccountData, useFirestore, useUser } from '@/firebase';
import { useCart } from '@/context/cart-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { Banknote, CreditCard, MapPin, ShieldCheck, Truck, CheckCircle2, ClipboardCopy } from 'lucide-react';

export function CreatorCheckout({ variant = 'card', onlyProductId, onlyLineId, initialNote = '', direct = false, onComplete }: { variant?: 'card' | 'page'; onlyProductId?: string; onlyLineId?: string; initialNote?: string; direct?: boolean; onComplete?: () => void }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { address: savedAddress, addressBook, addressBookLoading } = useAccountData();
  const [addressChoice,setAddressChoice] = useState<{uid:string|null;id:string|null;awaiting?:boolean}|null>(null);
  const { cartItems, directItem, clearDirectCheckout, updateDirectPrice, removeFromCart, updateLinePrice } = useCart();
  const { toast } = useToast();
  const [editingAddress, setEditingAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cod' | null>(null);
  const [advanceAccepted, setAdvanceAccepted] = useState(false);
  const [termsLoading, setTermsLoading] = useState(true);
  const [termsError, setTermsError] = useState(false);
  const [termsAttempt, setTermsAttempt] = useState(0);
  const [advanceProducts, setAdvanceProducts] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState(initialNote);
  useEffect(() => { if (initialNote) setNote(v => v || initialNote); }, [initialNote]);
  const [busy, setBusy] = useState(false);
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const [pincode, setPincode] = useState('');
  const [requestedDate, setRequestedDate] = useState(() => new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10));
  const [requestedSlot, setRequestedSlot] = useState('');
  const [giftRecipient, setGiftRecipient] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [priceChanges, setPriceChanges] = useState<Array<{ lineIndex: number; name: string; current: number; expected: number }>>([]);
  const [result, setResult] = useState<string[]>([]);
  const sourceItems = direct ? (directItem ? [directItem] : []) : cartItems;
  const pendingKey = direct ? 'treatstory-direct-checkout-id' : 'treatstory-pending-checkout';
  const items = sourceItems.filter(i => i.id.startsWith('seller:') && (!onlyProductId || i.id === 'seller:' + onlyProductId) && (!onlyLineId || i.lineId === onlyLineId));
  useEffect(() => {
    const uid=user?.uid??null;
    const choice=addressChoice?.uid===uid?addressChoice:null;
    if(choice&&choice.id===null)return; // Deliberate one-order edit stays selected.
    const options=savedAddressOptions(addressBook,savedAddress);
    const selected=choice?.id?options.find(a=>a.id===choice.id):addressBook?options.find(a=>a.id===addressBook.defaultId):savedAddress;
    if(choice?.id&&!selected&&(addressBookLoading||choice.awaiting))return;
    if(selected&&choice?.awaiting)setAddressChoice({...choice,awaiting:false});
    if(choice?.id&&!selected){setAddressChoice(null);return;}
    setAddress(selected?addressText(selected):'');setPincode(selected?.pincode||'');setName(selected?.recipient||'');setPhone(selected?.phone||'');
  }, [savedAddress,addressBook,addressBookLoading,addressChoice,user?.uid]);
  const productKey = JSON.stringify([...new Set(items.map(i => i.id.slice('seller:'.length)))]);
  useEffect(() => {
    if (!db) return;
    let live = true;
    setAdvanceProducts([]); setAdvanceAccepted(false); setTermsLoading(true); setTermsError(false);
    Promise.all((JSON.parse(productKey) as string[]).map(id => getDoc(doc(db, 'marketplace_products', id)))).then(docs => { if (live) setAdvanceProducts(docs.filter(d => d.data()?.advancePaymentRequired === true).map(d => d.data()?.name as string)); }).catch(() => { if (live) setTermsError(true); }).finally(() => { if (live) setTermsLoading(false); });
    return () => { live = false; };
  }, [db, productKey, termsAttempt]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!db || !user || busy || !items.length || paymentMethod !== 'cod' || priceChanges.length || termsLoading || termsError || (advanceProducts.length > 0 && !advanceAccepted)) return;
    if (name.trim().length < 2 || phone.trim().length < 5 || address.trim().length < 10) { setEditingAddress(true); return; }
    if (!/^\d{6}$/.test(pincode) && fulfillment === 'delivery') {
      setEditingAddress(true);
      toast({ variant: 'destructive', title: 'Enter a valid six-digit delivery PIN code' });
      return;
    }
    setBusy(true);
    try {
      // Keep this ID between network retries. The backend will return the
      // original confirmation instead of reserving inventory twice.
      let checkoutId = sessionStorage.getItem(pendingKey);
      if (!checkoutId) {
        checkoutId = crypto.randomUUID();
        sessionStorage.setItem(pendingKey, checkoutId);
      }
      const token = await user.getIdToken();
      const response = await fetch('/api/checkout', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          checkoutId, advancePaymentAcknowledged: advanceAccepted,
          lines: items.map(item => ({
            productId: item.id.slice('seller:'.length), quantity: item.quantity,
            expectedPrice: item.price, customizationNote: item.customizationNote || '',
            weight: item.selectedWeight || null,
          })),
          customerName: name.trim(), customerPhone: phone.trim(), deliveryAddress: address.trim(),
          customerNote: note.trim(), deliveryMode: fulfillment, pincode: fulfillment === 'delivery' ? pincode : undefined,
          requestedDate, requestedSlot, giftRecipient: giftRecipient.trim(), giftMessage: giftMessage.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        details?: { priceChanges?: Array<{lineIndex:number;name:string;current:number;expected:number}> };
        orderIds?: string[];
      };
      if (!response.ok) {
        if (response.status === 409 && payload.details?.priceChanges?.length) {
          setPriceChanges(payload.details.priceChanges);
          throw new ActionError('Some prices changed. Review and accept the updated prices before placing the order.', 409);
        }
        throw new ActionError(payload.error || 'Checkout could not be confirmed.', response.status, (payload as {details?:{code?:string}}).details?.code);
      }
      const orderIds = payload.orderIds ?? [];
      if (!orderIds.length) throw new ActionError('The order response was incomplete. Keep this checkout open and retry, or check your orders before starting again.');
      setResult(orderIds);
      if (direct) clearDirectCheckout();
      else for (const item of items) removeFromCart(item.lineId);
      sessionStorage.removeItem(pendingKey);
      onComplete?.();
      toast({ title: 'Order request sent', description: `${orderIds.length} creator order(s) received. Your seller will confirm preparation and delivery; no payment was collected online.` });
    } catch (error) {
      console.error('TreatStory checkout response failed', {code:(error as {code?:string})?.code});
      toast(errorToast(error,'checkout'));
    } finally { setBusy(false); }
  }
  function acceptUpdatedPrices() {
    for (const change of priceChanges) {
      const line = items[change.lineIndex];
      if (line) { if (direct) updateDirectPrice(change.current); else updateLinePrice(line.lineId, change.current); }
    }
    sessionStorage.removeItem(pendingKey);
    setPriceChanges([]);
    toast({ title: 'Prices updated', description: 'Review the total, then submit your order again.' });
  }
  const returnToCheckout = `/checkout?${new URLSearchParams({...(direct ? {buy:'direct'} : {}), ...(onlyProductId ? {product:onlyProductId} : {}), ...(onlyLineId ? {line:onlyLineId} : {})}).toString()}`;
  if (!items.length && !result.length) return null;
  return <section className={variant === 'page' ? 'space-y-4 rounded-2xl border border-[#e8e0d5] bg-white p-5 shadow-[0_14px_45px_rgba(51,39,24,0.04)] sm:p-8 lg:p-10' : 'mt-7 space-y-6 rounded-3xl border border-[#e8e0d5] bg-[#faf8f4] p-5 sm:p-7'}>
    <div className="border-b border-[#e8e0d5] pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Step 02 · Secure checkout</p><h3 className="mt-2 text-2xl font-medium tracking-tight">Delivery & payment</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Order handmade favourites from independent creators. Your seller confirms the order before fulfillment.</p></div>
    <CheckoutAddressDialog open={editingAddress} onOpenChange={setEditingAddress} value={{name, phone, address, pincode}} selectedId={addressChoice&&addressChoice.uid===(user?.uid??null)?addressChoice.id:addressBook?.defaultId??(savedAddress?'legacy':null)} onSave={(v,id) => {setAddressChoice({uid:user?.uid??null,id:id??null,awaiting:!!id&&!savedAddressOptions(addressBook,savedAddress).some(a=>a.id===id)});setName(v.name);setPhone(v.phone);setAddress(v.address);setPincode(v.pincode);}} />
    {result.length > 0 && <div role="status" aria-live="polite" className="rounded-3xl border border-[#e1d7c8] bg-[#f8f5ee] p-6 text-center sm:p-9"><CheckCircle2 className="mx-auto h-12 w-12 text-[#668657]"/><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a68a64]">Order received</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Thank you for ordering!</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71685e]">We've received your TreatStory order request. Your seller will review and confirm preparation and delivery details. No payment was collected online.</p><div className="mx-auto mt-5 max-w-lg space-y-2 rounded-2xl border bg-white p-4 text-left"><p className="mb-2 text-xs font-semibold text-[#796b58]">Your order {result.length === 1 ? 'ID' : 'IDs'}</p>{result.map(id => <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f5f1] px-3 py-2"><code className="min-w-0 break-all text-xs font-semibold text-[#29251f]">{id}</code><button type="button" aria-label={`Copy order ID ${id}`} className="shrink-0 rounded-full border p-2" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(id); }}><ClipboardCopy className="h-4 w-4"/></button></div>)}</div><Link href="/orders" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#29251f] px-6 text-sm font-semibold text-white">Track your orders</Link></div>}
    {isUserLoading ? <SectionSkeleton /> : !user ? <div className="rounded-2xl bg-white p-5"><p className="text-sm">Sign in to continue to checkout.</p><Link href={`/login?next=${encodeURIComponent(returnToCheckout)}`} className="editorial-button mt-4">Sign in</Link></div> : items.length > 0 && <form onSubmit={submit} className="space-y-4 sm:space-y-6">
      <div className="space-y-4"><p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#a68a64]" />Contact & delivery details</p>
      <div className="flex items-start justify-between gap-3 rounded-xl border bg-[#faf8f4] p-3 text-xs"><div className="min-w-0"><p className="font-semibold">{name ? `${name} · ${phone}` : 'Add your delivery details'}</p><p className="mt-1 line-clamp-2 text-muted-foreground">{address || 'Choose an address for this order.'}</p>{pincode && <p className="mt-1 text-muted-foreground">PIN {pincode}</p>}</div><Button type="button" variant="outline" size="sm" onClick={() => setEditingAddress(true)}>{address ? 'Change address' : 'Add address'}</Button></div>
      <div className="grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
        <label className="space-y-2 text-xs font-medium">Fulfillment method
          <select className="h-11 w-full rounded-lg border bg-white px-3 text-sm" value={fulfillment} onChange={e => setFulfillment(e.target.value as typeof fulfillment)}><option value="delivery">Seller delivery</option><option value="pickup">Pickup from creator</option></select>
        </label>
        <label className="space-y-2 text-xs font-medium">Requested date
          <Input required type="date" min={new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)} max={new Date(Date.now() + 330 * 60000 + 90 * 86400000).toISOString().slice(0, 10)} value={requestedDate} onChange={e => setRequestedDate(e.target.value)} />
        </label>
        <label className="space-y-2 text-xs font-medium">Preferred time / slot (optional)
          <Input maxLength={60} placeholder="e.g. 10 AM – 12 PM" value={requestedSlot} onChange={e => setRequestedSlot(e.target.value)} />
        </label>
      </div>
      <details className="rounded-xl border p-3"><summary className="cursor-pointer text-xs font-medium">Gift options & notes (optional)</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-xs font-medium">Gift recipient (optional)
          <Input maxLength={120} placeholder="Recipient name" value={giftRecipient} onChange={e => setGiftRecipient(e.target.value)} />
        </label>
        <label className="space-y-2 text-xs font-medium sm:col-span-2">Gift message (optional)
          <Textarea maxLength={300} rows={2} placeholder="A thoughtful note for the gift..." value={giftMessage} onChange={e => setGiftMessage(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1.5 text-xs font-medium">Notes for the creator (optional)<Textarea maxLength={750} placeholder="Customisation, delivery instructions…" value={note} onChange={e => setNote(e.target.value)} className="mt-1 bg-white" /></label></details></div>
      <div className="space-y-3 border-t border-[#e8e0d5] pt-5"><p className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4 text-[#a68a64]" />Payment method</p>{termsLoading && <p role="status" className="text-xs">Checking payment terms…</p>}{termsError && <p role="alert" className="text-xs text-red-700">Could not load payment terms. <button type="button" className="underline" onClick={() => setTermsAttempt(v => v + 1)}>Retry</button></p>}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-[#bda17b] bg-[#fcfaf6] p-4 sm:p-5"><input type="radio" name="payment-method" value="cod" required checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="mt-1 h-4 w-4 shrink-0 accent-[#846b49]" /><Banknote className="mt-0.5 h-5 w-5 text-[#846b49]" /><span><span className="block text-sm font-semibold">Cash on Delivery (COD)</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{paymentMethod === 'cod' && advanceProducts.length ? 'The seller arranges the advance; any remaining balance is payable on delivery.' : 'Pay when your order arrives. Select to review the payment terms.'} Availability and delivery charges are confirmed by the seller.</span></span></label>
      {paymentMethod === 'cod' && advanceProducts.length > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><strong>Advance payment required</strong><p className="mt-1 text-xs">{advanceProducts.join(', ')}: the seller will arrange the advance and confirm payment before preparation. No payment is collected on this website.</p><label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" required checked={advanceAccepted} onChange={e => setAdvanceAccepted(e.target.checked)} />I understand that these products require an advance before preparation.</label></div>}
      <div className="flex items-start gap-3 rounded-2xl border border-dashed p-4 text-muted-foreground"><CreditCard className="h-5 w-5 shrink-0" /><span className="text-xs leading-5"><strong className="block text-foreground">UPI / Cards / Net banking</strong>Coming soon. Online payments are not available yet, and no money will be collected now.</span></div></div>
      <div className="space-y-3 border-t border-[#e8e0d5] pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-4 w-4" />Shipping charges and COD availability are subject to seller confirmation.</p>{priceChanges.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" role="alert"><strong>Prices changed since you added these products.</strong><ul className="mt-2 space-y-1">{priceChanges.map((change,i) => <li key={i}>{change.name}: ₹{change.expected} → ₹{change.current}</li>)}</ul><Button type="button" onClick={acceptUpdatedPrices} className="mt-3">Accept updated prices</Button></div>}<Button type="submit" disabled={busy || !db || paymentMethod !== 'cod' || termsLoading || termsError || (advanceProducts.length > 0 && !advanceAccepted) || priceChanges.length > 0} className="h-14 w-full rounded-full bg-[#29251f] text-sm font-semibold transition hover:bg-[#51463a]">{busy ? 'Placing your order…' : `Place ${items.length} order${items.length === 1 ? '' : 's'}`}</Button><p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4" />No payment collected online</p></div>
    </form>}
  </section>;
}
