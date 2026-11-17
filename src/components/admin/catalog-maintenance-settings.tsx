'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Construction, ExternalLink } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getErrorNotice } from '@/lib/user-notices';

type CatalogSettings = { maintenanceEnabled?: boolean; maintenanceMessage?: string; updatedAt?: unknown };

export function CatalogMaintenanceSettings() {
  const db = useFirestore();
  const { toast } = useToast();
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'catalog') : null, [db]);
  const { data, isLoading, error: readError } = useDoc<CatalogSettings>(settingsRef);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (dirty || saving) return;
    setEnabled(data?.maintenanceEnabled === true);
    setMessage(data?.maintenanceMessage ?? '');
  }, [data, dirty, saving]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settingsRef || saving || isLoading || readError) return;
    const notice = message.trim();
    if (notice.length > 240) { setSaveError('Keep the maintenance message within 240 characters.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await setDoc(settingsRef, { maintenanceEnabled: enabled, maintenanceMessage: notice, updatedAt: serverTimestamp() }, { merge: true });
      setDirty(false);
      toast({
        title: enabled ? 'Catalog maintenance enabled' : 'Catalog maintenance disabled',
        description: enabled ? 'Buyers now see the maintenance notice instead of product listings.' : 'Public product listings are available again.',
      });
    } catch (cause) {
      setSaveError(getErrorNotice(cause, 'save').description || 'Maintenance settings could not be saved.');
    } finally { setSaving(false); }
  }

  return <div className="rounded-2xl border border-[#e6dfd5] bg-white p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Storefront visibility</p>
        <h2 className="mt-1 text-lg font-semibold text-[#29251f]">Product listing maintenance</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[#817568]">
          Temporarily replace buyer-facing product listings on Home, Shop all, New Arrivals and seller store pages with a maintenance notice.
          Product details, checkout, orders, and admin/seller workspaces are not disabled.
        </p>
      </div>
      <Construction className="h-5 w-5 shrink-0 text-[#a68a64]" aria-hidden="true" />
    </div>
    {!db || isLoading ? <div role="status" aria-label="Loading catalog settings" className="mt-6 h-40 animate-pulse rounded-xl bg-[#f3eee7]" /> :
      readError ? <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Could not load catalog settings. Make sure the Firestore rules allow administrator access before editing.</p> :
      <form onSubmit={save} className="mt-6 max-w-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#eee7de] bg-[#fcfaf7] p-4">
          <div className="min-w-0">
            <Label htmlFor="catalog-maintenance-switch" className="text-sm font-semibold">Show “Under maintenance” to shoppers</Label>
            <p className="mt-1 text-xs text-[#817568]">{enabled ? 'Maintenance will be active once saved.' : 'Listings will be visible once saved.'}</p>
          </div>
          <Switch id="catalog-maintenance-switch" aria-label="Product listing maintenance mode" checked={enabled} onCheckedChange={value => { setEnabled(value); setDirty(true); setSaveError(''); }} disabled={saving} />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="catalog-maintenance-message">Message for shoppers (optional)</Label>
            <span className="text-[11px] tabular-nums text-[#817568]">{message.length}/240</span>
          </div>
          <Textarea id="catalog-maintenance-message" maxLength={240} rows={3} value={message} onChange={event => { setMessage(event.target.value); setDirty(true); setSaveError(''); }} placeholder="We're making a few improvements. Please check back soon." className="rounded-xl border-[#e6dfd5] bg-[#fcfaf7]" />
          <p className="text-xs text-[#817568]">Leave empty to use the default notice. Changes update visitors in real time after saving.</p>
        </div>
        {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{saveError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efe9e1] pt-4">
          <Link href="/products" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#796348] hover:underline">Preview product listing <ExternalLink className="h-4 w-4" /></Link>
          <Button type="submit" disabled={!dirty || saving} className="min-h-11 rounded-xl bg-[#29251f] px-5 text-white">{saving ? 'Saving…' : 'Save catalog visibility'}</Button>
        </div>
      </form>}
  </div>;
}
