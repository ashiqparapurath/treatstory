'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getErrorNotice } from '@/lib/user-notices';
import { EnquirySettingsForm } from '@/components/admin/enquiry-settings-form';
import { LifeBuoy, MessageCircle, ExternalLink, ChevronDown } from 'lucide-react';
import Link from 'next/link';

type SupportSettings = { contactEmail?: string; publicNotice?: string; updatedAt?: unknown };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PlatformSettings() {
  const db = useFirestore();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? doc(db, 'settings', 'support') : null, [db]);
  const { data, isLoading, error: readError } = useDoc<SupportSettings>(ref);
  const [contactEmail, setContactEmail] = useState('');
  const [publicNotice, setPublicNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (dirty || busy) return;
    setContactEmail(data?.contactEmail ?? '');
    setPublicNotice(data?.publicNotice ?? '');
  }, [data, dirty, busy]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ref || !db || busy) return;
    const email = contactEmail.trim().toLowerCase();
    const notice = publicNotice.trim();
    if (email && (!emailPattern.test(email) || email.length > 254)) {
      setError('Enter a valid support email address or leave the field empty.'); return;
    }
    if (notice.length > 300) {
      setError('Keep the support notice within 300 characters.'); return;
    }
    setBusy(true); setError('');
    try {
      await setDoc(ref, { contactEmail: email, publicNotice: notice, updatedAt: serverTimestamp() }, { merge: true });
      setDirty(false);
      toast({ title: 'Customer support settings saved', description: 'Changes are visible on the public support page.' });
    } catch (cause) {
      const notice = getErrorNotice(cause, 'save');
      setError(notice.description || 'Settings could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-5">
    <div className="rounded-2xl border border-[#e6dfd5] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Customer communications</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">Support experience</h2><p className="mt-2 max-w-xl text-xs leading-5 text-[#817568]">Configure the contact information and guidance customers see on the TreatStory support page. Support tickets and replies stay in Customer support.</p></div>
        <LifeBuoy className="h-5 w-5 shrink-0 text-[#a68a64]" />
      </div>
      {isLoading ? <div role="status" className="mt-5 h-40 animate-pulse rounded-xl bg-[#f3eee7]" aria-label="Loading support settings" /> :
      readError ? <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Support settings could not be loaded. Check your administrator access before editing.</p> :
      <form onSubmit={save} className="mt-6 max-w-2xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="platform-support-email">Public support email (optional)</Label>
          <Input id="platform-support-email" type="email" autoComplete="email" maxLength={254} placeholder="support@example.com" value={contactEmail} onChange={event => { setContactEmail(event.target.value); setDirty(true); setError(''); }} className="min-h-11 rounded-xl border-[#e6dfd5] bg-[#fcfaf7]" />
          <p className="text-xs text-[#817568]">Appears as an email contact link on the customer support page. Leave empty to show only in-app tickets.</p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="platform-support-notice">Public support notice (optional)</Label><span className="text-[11px] tabular-nums text-[#817568]">{publicNotice.length}/300</span></div>
          <Textarea id="platform-support-notice" maxLength={300} rows={3} value={publicNotice} onChange={event => { setPublicNotice(event.target.value); setDirty(true); setError(''); }} placeholder="Share a brief service update or helpful guidance with customers." className="rounded-xl border-[#e6dfd5] bg-[#fcfaf7]" />
          <p className="text-xs text-[#817568]">Displays above the support request form. Keep it relevant; don't include account IDs or private information.</p>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efe9e1] pt-4">
          <Link href="/support" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#796348] hover:underline">View customer support page <ExternalLink className="h-4 w-4" /></Link>
          <Button type="submit" disabled={!dirty || busy} className="min-h-11 rounded-xl bg-[#29251f] px-5 text-white">{busy ? 'Saving…' : dirty ? 'Save support settings' : 'Saved'}</Button>
        </div>
      </form>}
    </div>
    <details className="group overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-5 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex items-start gap-3"><MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#a68a64]" /><span><span className="block text-sm font-semibold text-[#29251f]">Legacy WhatsApp enquiries</span><span className="mt-1 block text-xs leading-5 text-[#817568]">Only affects original catalog enquiries. Does not change seller checkout or order handling.</span></span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#796348] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#eee8df] p-4 sm:p-6"><EnquirySettingsForm /></div>
    </details>
  </section>;
}
