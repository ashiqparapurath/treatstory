'use client';
import { toast } from '@/hooks/use-toast';
import { errorToast } from '@/lib/user-notices';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  // CRITICAL: Call signInAnonymously directly. Do NOT use 'await signInAnonymously(...)'.
  void signInAnonymously(authInstance).catch(error=>toast(errorToast(error,'sign-in')));
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  // CRITICAL: Call createUserWithEmailAndPassword directly. Do NOT use 'await createUserWithEmailAndPassword(...)'.
  void createUserWithEmailAndPassword(authInstance,email.trim(),password).catch(error=>toast(errorToast(error,'register')));
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  // CRITICAL: Call signInWithEmailAndPassword directly. Do NOT use 'await signInWithEmailAndPassword(...)'.
  void signInWithEmailAndPassword(authInstance,email.trim(),password).catch(error=>toast(errorToast(error,'sign-in')));
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}
