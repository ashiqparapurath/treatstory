'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { AccountPreferencesShell } from '@/components/account-preferences-shell';
import { DeleteAccountSection } from '@/components/delete-account-section';
import { useAccountRole, useAuth, useUser } from '@/firebase';

export default function PrivacyPreferencesPage() {
  const { user } = useUser();
  const auth = useAuth();
  const { role, roleError, isRoleLoading } = useAccountRole();

  return (
    <AccountPreferencesShell title="Privacy & security" description="Understand your account data and the safeguards in place before changing or deleting your account.">
      <div className="max-w-2xl space-y-9">
        <section aria-label="Privacy policy" className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8b704e]" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-[#332b23]">Your data, your choices</h2>
            <p className="mt-2 text-sm leading-7 text-[#756a5e]">Review how TreatStory handles account and order information before making changes.</p>
            <Link href="/privacy-policy" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[#785f42] underline underline-offset-4">Read privacy policy</Link>
          </div>
        </section>
        {isRoleLoading ? <p role="status" className="text-sm text-[#817466]">Checking account permissions…</p>
        : roleError ? <p role="alert" className="text-sm text-red-700">We couldn’t verify your account permissions. Refresh and try again.</p>
        : user && role === 'admin' ? <p className="border-t border-[#ebe3d9] pt-7 text-sm leading-7 text-[#756a5e]">Administrator account changes are handled by TreatStory support. Contact support before requesting removal of an administrator account.</p>
        : user ? <div className="border-t border-[#ebe3d9] pt-7"><DeleteAccountSection user={user} auth={auth} isSeller={role === 'seller'} /></div>
        : null}
      </div>
    </AccountPreferencesShell>
  );
}
