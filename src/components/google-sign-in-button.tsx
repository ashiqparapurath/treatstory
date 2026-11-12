'use client';

import { useState } from 'react';
import type { Auth } from 'firebase/auth';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

/** A single Google sign-in action for returning and newly registering users.
 * Firebase's authenticated UID remains the source of truth for all roles.
 * Popup mode avoids third-party-cookie redirect problems with Vercel authDomain.
 */
export function GoogleSignInButton({
  auth,
  disabled = false,
  onSuccess,
}: {
  auth: Auth | null;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function signIn() {
    if (busy || disabled) return;
    if (!auth) {
      toast({ variant: 'destructive', title: 'Sign-in unavailable', description: 'Please try again shortly.' });
      return;
    }
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      onSuccess?.();
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      const notices: Record<string, { title: string; description: string }> = {
        'auth/popup-blocked': {
          title: 'Google sign-in was blocked',
          description: 'Allow popups for TreatStory or open the site in your browser, then try again.',
        },
        'auth/operation-not-supported-in-this-environment': {
          title: 'Open TreatStory in your browser',
          description: 'Google sign-in isn’t supported inside this browser view. Open the site in Safari or Chrome.',
        },
        'auth/unauthorized-domain': {
          title: 'Google sign-in is not configured',
          description: 'This website domain must be authorized in Firebase Authentication. Please contact support.',
        },
        'auth/operation-not-allowed': {
          title: 'Google sign-in is unavailable',
          description: 'Google must be enabled as a sign-in provider in Firebase Authentication.',
        },
        'auth/account-exists-with-different-credential': {
          title: 'Account already exists',
          description: 'Sign in using your original method. Contact support if you need to connect Google to that account.',
        },
        'auth/network-request-failed': {
          title: 'Could not connect',
          description: 'Check your internet connection and try Google sign-in again.',
        },
      };
      const notice = notices[code ?? ''] ?? {
        title: 'Google sign-in failed',
        description: 'Please try again, or sign in with your email and password.',
      };
      toast({ variant: 'destructive', ...notice });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signIn()}
      disabled={disabled || busy || !auth}
      aria-busy={busy}
      className="flex min-h-[54px] w-full items-center justify-center gap-3 rounded-[15px] border border-[#e4e4e9] bg-white px-4 text-[15px] font-semibold text-[#303034] transition-colors hover:bg-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a88c6c] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:rounded-full sm:border-[#ded6ca] sm:text-sm"
    >
      <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.29 5.48-4.85 7.18l7.73 6C44.33 38.03 46.98 31.88 46.98 24.55Z"/>
        <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.77-4.59l-7.98-6.19A23.92 23.92 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"/>
      </svg>
      {busy ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}
