'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || submitting) return;
    setSubmitting(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name.trim() });
      toast({ title: 'Welcome to TreatStory', description: 'Your customer account is ready.' });
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/account');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ variant: 'destructive', title: 'Registration failed', description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 sm:p-10">
        <Link href="/" className="brand-wordmark text-3xl">TreatStory</Link>
        <p className="eyebrow mt-8 text-[#a68a64]">Join our creative community</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create an account to shop handmade creations, track orders and save delivery details.</p>
        <form onSubmit={register} className="mt-8 space-y-5">
          <div className="space-y-2"><Label htmlFor="registerName">Your name</Label><Input id="registerName" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e=>setName(e.target.value)} placeholder="Name on your TreatStory profile" /></div><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <Button type="submit" className="h-12 w-full rounded-full" disabled={!auth || submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already registered? <Link href="/login?next=%2Fbecome-a-seller" className="font-semibold text-foreground underline underline-offset-4">Sign in</Link></p>
      </div>
    </main>
  );
}
