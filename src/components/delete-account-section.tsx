'use client';

import { useState, type FormEvent } from 'react';
import type { Auth, User } from 'firebase/auth';
import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut } from 'firebase/auth';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DeleteAccountSection({ user, auth, isSeller }: { user: User; auth: Auth | null; isSeller: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const usesPassword = user.providerData.some(provider => provider.providerId === 'password');
  const usesGoogle = user.providerData.some(provider => provider.providerId === 'google.com');

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'DELETE' || !acknowledged || !auth || busy) return;
    setBusy(true);
    setError('');
    try {
      if (usesPassword) {
        if (!user.email || !password) throw new Error('Enter your current account password.');
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      } else if (usesGoogle) {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }
      const token = await user.getIdToken(true);
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Account deletion is temporarily unavailable. Please try again.');
      await signOut(auth).catch(() => undefined);
      window.location.assign('/');
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      setError(code === 'auth/wrong-password' || code === 'auth/invalid-credential'
        ? 'Incorrect password. Please check it and try again.'
        : code === 'auth/popup-closed-by-user'
        ? 'Google reauthentication was cancelled.'
        : cause instanceof Error ? cause.message : 'Could not delete your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <section id="delete-account" className="scroll-mt-24 rounded-2xl border border-[#efd8d4] bg-white p-4 sm:rounded-3xl sm:p-7">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-red-50 p-2 text-red-700"><ShieldAlert className="h-5 w-5" /></span><div className="min-w-0"><h2 className="text-lg font-semibold text-[#7b332c]">Privacy & account deletion</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Permanently close your TreatStory {isSeller ? 'seller and buyer' : 'buyer'} account. You cannot undo this action.</p></div></div>
    {!open ? <Button type="button" variant="outline" className="mt-5 min-h-11 rounded-full border-red-200 text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete my account</Button> :
      <form onSubmit={removeAccount} className="mt-5 space-y-4 rounded-2xl border border-red-200 bg-[#fffaf9] p-4 sm:p-6">
        <div className="flex items-start gap-2 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Deleting your account removes your profile, saved addresses, wishlist, notifications and {isSeller ? 'storefront and product listings' : 'account preferences'}. You must first finish or cancel active orders. Cancel unaccepted custom requests or finish their orders first. Uploaded photos and support records are removed; provider cleanup may require a retry. Previously downloaded copies cannot be recalled.</p></div>
        <p className="text-xs leading-5 text-muted-foreground">Completed transaction records may remain for payment, tax, fraud prevention and support obligations, with buyer contact details removed. Previously uploaded images on the image host may remain until separately purged. Your account cannot be recovered.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-red-700" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} /><span>I understand this permanently closes my account and may remove my store.</span></label>
        <div><Label htmlFor="deletePhrase">Type DELETE to confirm</Label><Input id="deletePhrase" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} autoComplete="off" placeholder="DELETE" className="mt-2 max-w-xs" /></div>
        {usesPassword && <div><Label htmlFor="deletePassword">Current password</Label><Input id="deletePassword" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-2 max-w-xs" /></div>}
        {!usesPassword && <p className="text-xs text-muted-foreground">{usesGoogle ? 'You will be asked to confirm your Google account.' : 'Sign in again first if your session is more than five minutes old.'}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !acknowledged || confirmation !== 'DELETE' || (usesPassword && !password)} className="min-h-11 rounded-full bg-red-700 text-white hover:bg-red-800">{busy ? 'Deleting account…' : 'Permanently delete account'}</Button>
          <Button type="button" variant="outline" disabled={busy} className="min-h-11 rounded-full" onClick={() => {setOpen(false);setError('');setPassword('');setConfirmation('');setAcknowledged(false);}}>Cancel</Button>
        </div>
      </form>}
  </section>;
}
