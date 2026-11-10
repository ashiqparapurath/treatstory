'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { Check, ImagePlus, ShieldCheck, Store, Truck, Clock3, AlertTriangle } from 'lucide-react';
import type { Seller } from '@/lib/marketplace-types';
import { uploadTreatStoryPhoto } from '@/lib/cloudinary-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { errorToast } from '@/lib/user-notices';

type StoreDraft = {
  logoUrl: string;
  description: string;
  contactPhone: string;
  whatsappNumber: string;
  isOpen: boolean;
  deliveryMethods: Array<'delivery' | 'pickup'>;
  deliveryPincodes: string;
  deliveryFee: string;
  pickupAddress: string;
  deliverySlots: string;
  dailyOrderCapacity: string;
  acceptanceHours: string;
};

const version = (value: unknown) => (value as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;

function initialDraft(seller: Seller): StoreDraft {
  return {
    logoUrl: seller.logoUrl || '',
    description: seller.description || '',
    contactPhone: seller.contactPhone || '',
    whatsappNumber: seller.whatsappNumber || '',
    isOpen: seller.isOpen !== false,
    deliveryMethods: seller.deliveryMethods?.length ? [...seller.deliveryMethods] : ['delivery'],
    deliveryPincodes: (seller.deliveryPincodes || []).join('\n'),
    deliveryFee: String(seller.deliveryFee ?? 0),
    pickupAddress: seller.pickupAddress || '',
    deliverySlots: (seller.deliverySlots || []).join('\n'),
    dailyOrderCapacity: String(seller.dailyOrderCapacity ?? 0),
    acceptanceHours: String(seller.acceptanceHours ?? 24),
  };
}

export function SellerStoreSettings({ seller, user, db, active }: { seller: Seller; user: User; db: Firestore; active: boolean }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<StoreDraft>(() => initialDraft(seller));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const loadedVersion = useRef<number | null>(version(seller.updatedAt));

  useEffect(() => {
    if (!dirty && !busy && !uploading) {
      setDraft(initialDraft(seller));
      loadedVersion.current = version(seller.updatedAt);
    }
  }, [seller, dirty, busy, uploading]);

  function update<K extends keyof StoreDraft>(key: K, value: StoreDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setDirty(true);
    setError('');
  }

  function toggleDelivery(method: 'delivery' | 'pickup', enabled: boolean) {
    const methods = enabled ? [...new Set([...draft.deliveryMethods, method])] : draft.deliveryMethods.filter(item => item !== method);
    update('deliveryMethods', methods);
  }

  async function uploadLogo(file?: File) {
    if (!file || !active || busy || uploading) return;
    if (file.size > 2_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP logo up to 2 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const url = await uploadTreatStoryPhoto(user, file, 'logo');
      update('logoUrl', url);
      toast({ title: 'Logo uploaded', description: 'Save your store settings to publish your new logo.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Logo upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || busy || uploading || !dirty) return;
    const phone = draft.whatsappNumber.replace(/\D/g, '');
    const codes = [...new Set(draft.deliveryPincodes.split(/[\s,]+/).map(x => x.trim()).filter(Boolean))];
    const slots = [...new Set(draft.deliverySlots.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
    const fee = Number(draft.deliveryFee);
    const capacity = Number(draft.dailyOrderCapacity);
    const acceptance = Number(draft.acceptanceHours);
    if (phone && (phone.length < 8 || phone.length > 15)) return setError('Enter a valid WhatsApp number with country code.');
    if (draft.description.length > 2000 || draft.contactPhone.length > 40 || draft.pickupAddress.length > 500) return setError('One or more text fields are too long.');
    if (codes.length > 10 || codes.some(x => !/^\d{6}$/.test(x))) return setError('Use up to 10 valid six-digit delivery PIN codes.');
    if (slots.length > 6 || slots.some(x => x.length < 1 || x.length > 60)) return setError('Use up to 6 delivery slots of at most 60 characters each.');
    if (!draft.deliveryMethods.length) return setError('Choose at least one fulfillment method.');
    if (!Number.isFinite(fee) || fee < 0 || fee > 5000 || !Number.isInteger(capacity) || capacity < 0 || capacity > 100 || !Number.isInteger(acceptance) || acceptance < 1 || acceptance > 72) return setError('Check the delivery fee, capacity, and reply deadline.');
    if (draft.logoUrl && !/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//.test(draft.logoUrl)) return setError('Upload a valid logo using the photo picker.');
    setBusy(true);
    setError('');
    try {
      const ref = doc(db, 'sellers', user.uid);
      await runTransaction(db, async tx => {
        const current = await tx.get(ref);
        const record = current.data();
        if (!record || record.ownerUid !== user.uid || record.status !== 'active') throw new Error('Your seller access is unavailable. Refresh and try again.');
        if (loadedVersion.current !== null && version(record.updatedAt) !== loadedVersion.current) throw new Error('Store settings changed in another window. Refresh to review those changes before saving.');
        tx.update(ref, {
          logoUrl: draft.logoUrl, description: draft.description, contactPhone: draft.contactPhone,
          whatsappNumber: phone, isOpen: draft.isOpen, deliveryMethods: draft.deliveryMethods,
          deliveryPincodes: codes, deliveryFee: fee, pickupAddress: draft.pickupAddress,
          deliverySlots: slots, dailyOrderCapacity: capacity, acceptanceHours: acceptance,
          updatedAt: serverTimestamp(),
        });
      });
      setDirty(false);
      toast({ title: 'Store settings saved', description: 'Your storefront has been updated.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save changes.');
      toast(errorToast(cause, 'save-store'));
    } finally {
      setBusy(false);
    }
  }

  const panel = 'rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:rounded-3xl sm:p-6 lg:p-8';
  return <form onSubmit={save} className="min-w-0 space-y-4 pb-8 sm:space-y-6">
    <div className="overflow-hidden rounded-2xl bg-[#29251f] px-5 py-6 text-white sm:rounded-3xl sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-3xl font-semibold text-[#78664f] shadow-inner sm:h-24 sm:w-24">
          {draft.logoUrl ? <img src={draft.logoUrl} alt="Store logo preview" className="h-full w-full object-contain" /> : seller.businessName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d2b58b]">Store identity</p><h2 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{seller.businessName}</h2><p className="mt-2 max-w-xl text-xs leading-5 text-white/70">Make your store instantly recognizable with a clear logo and a thoughtful description.</p><Link href={'/shop/' + user.uid} className="mt-3 inline-flex text-xs font-medium text-[#eacda6] underline underline-offset-4">Preview public storefront</Link></div>
      </div>
    </div>

    <div className={'grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6'}>
      <section className={panel}>
        <div className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Branding & story</h3></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Square PNG, JPG or WebP recommended. Maximum 2 MB.</p>
        <Label htmlFor="sellerLogo" className="mt-5 block text-sm">Store logo</Label>
        <input id="sellerLogo" type="file" accept="image/png,image/jpeg,image/webp" disabled={!active || busy || uploading} onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} className="mt-2 block w-full min-w-0 rounded-xl border border-dashed border-[#d9cabb] p-3 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#eee6da] file:px-3 file:py-2 file:text-xs file:font-semibold disabled:opacity-50" />
        {uploading && <p role="status" className="mt-2 text-xs text-muted-foreground">Uploading logo securely…</p>}
        {draft.logoUrl && <Button type="button" variant="outline" size="sm" className="mt-3 rounded-full" disabled={!active || uploading || busy} onClick={() => update('logoUrl', '')}>Remove logo</Button>}
        <Label htmlFor="sellerDescription" className="mt-5 block text-sm">About your store</Label>
        <Textarea id="sellerDescription" rows={5} maxLength={2000} value={draft.description} disabled={!active} onChange={e => update('description', e.target.value)} placeholder="Tell your buyers what makes your creations special…" className="mt-2 resize-y" />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{draft.description.length}/2000</p>
      </section>
      <section className={panel}>
        <div className="flex items-center gap-2"><Store className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Store contact & availability</h3></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Make it easy for buyers to reach your business.</p>
        <div className="mt-5 space-y-5">
          <div><Label htmlFor="sellerBusinessName">Approved business name</Label><Input id="sellerBusinessName" value={seller.businessName} disabled className="mt-2 bg-[#faf8f4]" /></div>
          <div><Label htmlFor="sellerPhone">Contact phone</Label><Input id="sellerPhone" type="tel" maxLength={40} disabled={!active} value={draft.contactPhone} onChange={e => update('contactPhone', e.target.value)} className="mt-2" /></div>
          <div><Label htmlFor="sellerWhatsApp">WhatsApp business number</Label><Input id="sellerWhatsApp" type="tel" inputMode="tel" maxLength={20} placeholder="919876543210" disabled={!active} value={draft.whatsappNumber} onChange={e => update('whatsappNumber', e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Include country code. Leave empty to hide WhatsApp.</p></div>
          <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-[#f7f4ee] px-4 py-3 text-sm"><span><strong className="block font-medium">Accepting new orders</strong><span className="block text-xs text-muted-foreground">{draft.isOpen ? 'Your shop is open to buyers' : 'Your shop is temporarily paused'}</span></span><input type="checkbox" disabled={!active} checked={draft.isOpen} onChange={e => update('isOpen', e.target.checked)} className="h-5 w-5 accent-[#29251f]" /></label>
        </div>
      </section>
    </div>

    <section className={panel}>
      <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Delivery & pickup</h3></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Select supported fulfillment methods and define the areas you serve.</p>
      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          {(['delivery', 'pickup'] as const).map(method => <label key={method} className="flex min-h-12 items-center gap-3 rounded-xl border bg-[#faf8f4] px-4 py-3 text-sm"><input type="checkbox" checked={draft.deliveryMethods.includes(method)} disabled={!active} onChange={e => toggleDelivery(method, e.target.checked)} className="h-4 w-4 accent-[#29251f]" />{method === 'delivery' ? 'Seller delivery' : 'Customer pickup'}</label>)}
          <div><Label htmlFor="sellerDeliveryFee">Delivery charge (₹)</Label><Input id="sellerDeliveryFee" type="number" min={0} max={5000} step="0.01" disabled={!active || !draft.deliveryMethods.includes('delivery')} value={draft.deliveryFee} onChange={e => update('deliveryFee', e.target.value)} className="mt-2" /></div>
          <div><Label htmlFor="sellerPincodes">Delivery PIN codes (up to 10)</Label><Textarea id="sellerPincodes" rows={3} disabled={!active || !draft.deliveryMethods.includes('delivery')} value={draft.deliveryPincodes} onChange={e => update('deliveryPincodes', e.target.value)} placeholder={'673001\n673002'} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">One per line or comma-separated. Blank means unrestricted coverage.</p></div>
        </div>
        <div className="space-y-4">
          <div><Label htmlFor="sellerPickup">Pickup address</Label><Textarea id="sellerPickup" rows={3} maxLength={500} disabled={!active || !draft.deliveryMethods.includes('pickup')} value={draft.pickupAddress} onChange={e => update('pickupAddress', e.target.value)} placeholder="Collection location" className="mt-2" /></div>
          <div><Label htmlFor="sellerSlots">Delivery / pickup time slots (up to 6)</Label><Textarea id="sellerSlots" rows={4} disabled={!active} value={draft.deliverySlots} onChange={e => update('deliverySlots', e.target.value)} placeholder={'Morning (9–12)\nAfternoon (2–5)'} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Enter one slot per line.</p></div>
        </div>
      </div>
    </section>

    <section className={panel}>
      <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Order capacity & timing</h3></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="sellerCapacity">Daily order capacity</Label><Input id="sellerCapacity" type="number" min={0} max={100} disabled={!active} value={draft.dailyOrderCapacity} onChange={e => update('dailyOrderCapacity', e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Zero means no daily limit.</p></div>
        <div><Label htmlFor="sellerAcceptance">Accept orders within (hours)</Label><Input id="sellerAcceptance" type="number" min={1} max={72} disabled={!active} value={draft.acceptanceHours} onChange={e => update('acceptanceHours', e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Choose 1–72 hours.</p></div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <div className={(dirty || busy || uploading ? 'sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 shadow-lg md:bottom-4 ' : '') + 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#e8e0d5] bg-white/95 p-3 backdrop-blur-md sm:p-4'}>
      <div className="min-w-0 text-xs text-muted-foreground"><Check className="mr-1 inline h-4 w-4" />{uploading ? 'Uploading logo…' : dirty ? 'Unsaved changes' : 'All changes saved'}</div>
      <Button type="submit" disabled={!active || busy || uploading || !dirty} className="min-h-11 rounded-full px-4 text-xs sm:px-6 sm:text-sm">{busy ? 'Saving…' : 'Save changes'}</Button>
    </div>
    <div className="flex flex-col gap-2 rounded-2xl border border-[#edd7d1] bg-[#fffafa] p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div><p className="flex items-center gap-2 font-semibold text-[#8b3b31]"><ShieldCheck className="h-4 w-4" />Account & privacy</p><p className="mt-1 text-xs text-muted-foreground">You can request permanent account deletion from your profile. Open orders must be completed first.</p></div>
      <Link href="/account#delete-account" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-[#d9b4ad] px-4 text-xs font-semibold text-[#8b3b31]">Manage account</Link>
    </div>
  </form>;
}
