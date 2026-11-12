'use client';

import { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { AccountPreferencesShell } from '@/components/account-preferences-shell';
import { AccountEmailSettings } from '@/components/account-email-settings';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { errorToast } from '@/lib/user-notices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PersonalInformationPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(user?.displayName ?? ''); }, [user?.uid, user?.displayName]);

  async function saveName() {
    const value = name.trim();
    if (!user || saving || value.length < 2 || value.length > 80) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: value });
      setEditing(false);
      toast({ title: 'Your name was updated' });
    } catch(error) {
      toast(errorToast(error, 'save-profile'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountPreferencesShell title="Personal information" description="Review your profile and keep your contact information up to date.">
      {user && <div className="max-w-2xl space-y-9">
        <section aria-label="Display name" className="space-y-4">
          <Label htmlFor="personal-display-name" className="text-xs font-semibold uppercase tracking-[0.13em] text-[#9a8161]">Display name</Label>
          {editing ? (
            <form onSubmit={event => {event.preventDefault(); void saveName();}} className="space-y-3">
              <Input id="personal-display-name" value={name} onChange={event=>setName(event.target.value)}
                autoComplete="name" maxLength={80} minLength={2} required
                className="min-h-12 border-[#e2d8cc] bg-white text-base sm:text-sm" />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving || name.trim().length < 2} className="min-h-11 rounded-full bg-[#30291f] px-6 text-white">{saving?'Saving…':'Save name'}</Button>
                <Button type="button" variant="ghost" disabled={saving} onClick={()=>{setEditing(false);setName(user.displayName ?? '');}}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p id="personal-display-name" className="break-words text-lg font-medium text-[#352c22]">{user.displayName || 'No name added yet'}</p>
              <Button type="button" variant="outline" className="min-h-11 rounded-full border-[#d8cbbb] bg-white" onClick={()=>setEditing(true)}>Edit name</Button>
            </div>
          )}
          <p className="text-xs leading-6 text-[#817466]">This name appears on your TreatStory profile.</p>
        </section>

        <section aria-label="Email settings" className="border-t border-[#ebe4da] pt-7">
          <Label className="text-xs font-semibold uppercase tracking-[0.13em] text-[#9a8161]">Email address</Label>
          <p className="mt-3 break-all text-[15px] font-medium text-[#352c22]">{user.email ?? 'No email available'}</p>
          <AccountEmailSettings key={user.uid} user={user} />
        </section>
        <section aria-label="Linked account" className="border-t border-[#ebe4da] pt-7">
          <Label className="text-xs font-semibold uppercase tracking-[0.13em] text-[#9a8161]">Sign-in methods</Label>
          <p className="mt-3 text-sm leading-6 text-[#655a4e]">
            {user.providerData.some(provider=>provider.providerId==='google.com') ? 'Google' : 'Email and password'}
          </p>
          <p className="mt-2 text-xs leading-6 text-[#817466]">Sign-in methods are managed through Firebase Authentication. To change access to your account, contact support.</p>
        </section>
      </div>}
    </AccountPreferencesShell>
  );
}
