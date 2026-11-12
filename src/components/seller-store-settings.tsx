'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { Check, Pencil, BookOpen, ShieldCheck, Store, Truck, Clock3, AlertTriangle } from 'lucide-react';
import type { Seller } from '@/lib/marketplace-types';
import { uploadTreatStoryPhoto } from '@/lib/cloudinary-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getErrorNotice } from '@/lib/user-notices';
import { StoreShareButton } from '@/components/store-share-button';

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
  const [settingsTab, setSettingsTab] = useState<'profile' | 'delivery' | 'operations'>('profile');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const loadedVersion = useRef<number | null>(version(seller.updatedAt));
  const logoInput = useRef<HTMLInputElement>(null);

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
      const notice = getErrorNotice(cause, 'save-store');
      setError(notice.description);
      toast({ variant: 'destructive', title: notice.title, description: notice.description });
    } finally {
      setBusy(false);
    }
  }

  const panel = 'rounded-2xl border border-[#e6dfd5] bg-white p-5 sm:p-6';
  return <form onSubmit={save} className="min-w-0 space-y-4 pb-8 sm:space-y-5">
    <div role="tablist" aria-label="Store settings sections" className="grid grid-cols-3 gap-1 rounded-2xl border border-[#e6dfd5] bg-white p-1.5">
      {([{id:'profile',label:'Profile',icon:Store},{id:'delivery',label:'Delivery',icon:Truck},{id:'operations',label:'Operations',icon:Clock3}] as const).map(tab => <button key={tab.id} role="tab" type="button" id={`store-settings-tab-${tab.id}`} aria-selected={settingsTab === tab.id} aria-controls={`store-settings-${tab.id}`} onClick={() => setSettingsTab(tab.id)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition sm:text-sm ${settingsTab === tab.id ? 'bg-[#29251f] text-white' : 'text-[#766a5c] hover:bg-[#f5f0e9]'}`}><tab.icon className="h-4 w-4 shrink-0" />{tab.label}</button>)}
    </div>
    <div id="store-settings-profile" role="tabpanel" aria-labelledby="store-settings-tab-profile" hidden={settingsTab !== 'profile'} className="space-y-4 sm:space-y-5">
    <div className="overflow-hidden rounded-2xl bg-[#29251f] px-5 py-6 text-white sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-white text-3xl font-semibold text-[#78664f] shadow-inner">
            {draft.logoUrl ? <img src={draft.logoUrl} alt="Store logo preview" className="h-full w-full object-contain" /> : seller.businessName.slice(0, 1).toUpperCase()}
          </div>
          <input ref={logoInput} id="sellerLogo" type="file" accept="image/png,image/jpeg,image/webp" tabIndex={-1} className="sr-only" aria-label="Choose a store logo" disabled={!active || busy || uploading} onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" aria-label="Edit store logo" title="Edit store logo" onClick={() => logoInput.current?.click()} disabled={!active || busy || uploading} className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#29251f] bg-white text-[#29251f] shadow-md transition hover:bg-[#f4ede4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d2b58b]">Store identity</p><h2 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{seller.businessName}</h2><p className="mt-2 max-w-xl text-xs leading-5 text-white/70">Tap the pencil on your logo to upload a JPG, PNG or WebP (up to 2 MB). Save your changes when you're ready.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Link href={'/shop/' + user.uid} className="inline-flex min-h-11 items-center text-xs font-medium text-[#eacda6] underline underline-offset-4">Preview public storefront</Link><StoreShareButton sellerId={user.uid} storeName={seller.businessName} dark />{draft.logoUrl && <button type="button" onClick={() => update('logoUrl', '')} disabled={!active || busy || uploading} className="text-xs text-white/70 underline underline-offset-4 hover:text-white disabled:opacity-50">Remove logo</button>}</div>
        {uploading && <p role="status" className="mt-2 text-xs text-[#eacda6]">Uploading logo…</p>}</div>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Store details</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">How buyers see your business</h2></div><span className="inline-flex items-center gap-2 rounded-full border border-[#e4dbd0] bg-white px-3 py-1.5 text-xs text-[#776858]"><span className={draft.isOpen ? 'h-2 w-2 rounded-full bg-emerald-500' : 'h-2 w-2 rounded-full bg-amber-500'} />{draft.isOpen ? 'Accepting orders' : 'Store paused'}</span></div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-5">
      <section className={panel}>
        <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Your store story</h3></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Share what makes your creations special.</p>
        <Label htmlFor="sellerDescription" className="mt-5 block text-sm">About your store</Label>
        <Textarea id="sellerDescription" rows={4} maxLength={2000} value={draft.description} disabled={!active} onChange={e => update('description', e.target.value)} placeholder="Tell your buyers what makes your creations special…" className="mt-2 resize-y" />
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

    </div>
    <div id="store-settings-delivery" role="tabpanel" aria-labelledby="store-settings-tab-delivery" hidden={settingsTab !== 'delivery'} className="space-y-4">
    <div className="pt-1"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Fulfillment preferences</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">Delivery and order handling</h2><p className="mt-1 text-xs text-[#817568]">Make sure customers know where and when you can fulfill their requests.</p></div>
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

    </div>
    <div id="store-settings-operations" role="tabpanel" aria-labelledby="store-settings-tab-operations" hidden={settingsTab !== 'operations'} className="space-y-4">
    <section className={panel}>
      <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#9c7c52]" /><h3 className="text-lg font-semibold">Order capacity & timing</h3></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="sellerCapacity">Daily order capacity</Label><Input id="sellerCapacity" type="number" min={0} max={100} disabled={!active} value={draft.dailyOrderCapacity} onChange={e => update('dailyOrderCapacity', e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Zero means no daily limit.</p></div>
        <div><Label htmlFor="sellerAcceptance">Accept orders within (hours)</Label><Input id="sellerAcceptance" type="number" min={1} max={72} disabled={!active} value={draft.acceptanceHours} onChange={e => update('acceptanceHours', e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Choose 1–72 hours.</p></div>
      </div>
    </section>

    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <div className={(dirty || busy || uploading ? 'sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 shadow-lg md:bottom-4 ' : '') + 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#e8e0d5] bg-white/95 p-3 backdrop-blur-md sm:p-4'}>
      <div className="min-w-0 text-xs text-muted-foreground"><Check className="mr-1 inline h-4 w-4" />{uploading ? 'Uploading logo…' : dirty ? 'Unsaved changes' : 'All changes saved'}</div>
      <Button type="submit" disabled={!active || busy || uploading || !dirty} className="min-h-11 rounded-xl bg-[#29251f] px-4 text-xs text-white hover:bg-[#443b31] sm:px-6 sm:text-sm">{busy ? 'Saving…' : 'Save changes'}</Button>
    </div>
    {settingsTab === 'operations' && <div className="flex flex-col gap-2 rounded-2xl border border-[#edd7d1] bg-[#fffafa] p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div><p className="flex items-center gap-2 font-semibold text-[#8b3b31]"><ShieldCheck className="h-4 w-4" />Account & privacy</p><p className="mt-1 text-xs text-muted-foreground">You can request permanent account deletion from your profile. Open orders must be completed first.</p></div>
      <Link href="/account#delete-account" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-[#d9b4ad] px-4 text-xs font-semibold text-[#8b3b31]">Manage account</Link>
    </div>}
  </form>;
}
