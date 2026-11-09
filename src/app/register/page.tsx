'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { getErrorNotice, validateEmail, type UserNotice } from '@/lib/user-notices';
import { requestAccountMail } from '@/lib/account-mail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [formError,setFormError]=useState<UserNotice|null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(submitting)return;setFormError(null);
    const invalid = name.trim().length < 2 || name.trim().length > 80 ? {title:'Check your name',description:'Use 2–80 characters for the name on your profile.',field:'name' as const} : validateEmail(email) || (password.length<6?{title:'Choose a longer password',description:'Use at least six characters for your new password.',field:'password' as const}:null);
    if(invalid){setFormError(invalid);toast({variant:'destructive',title:invalid.title,description:invalid.description});return;}
    if(!auth){const notice=getErrorNotice({code:'app/service-unavailable'},'register');setFormError(notice);toast({variant:'destructive',title:notice.title,description:notice.description});return;}
    setSubmitting(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        await updateProfile(result.user, {displayName:name.trim()});
        toast({title:'Your account is ready',description:`Welcome to TreatStory, ${name.trim().split(/\s+/)[0]}.`});
      } catch {toast({title:'Account created; name not saved',description:'You can sign in now. Add your name from your profile.'});}
      try {await requestAccountMail('verify-email',{user:result.user});}
      catch {toast({title:'Account ready; verification email not sent',description:'You can use your account now. Request email verification again from your profile.'});}
      try {await requestAccountMail('welcome',{user:result.user});}
      catch {toast({title:'Account ready; welcome email delayed',description:'You can use your account now. Your welcome email could not be requested.'});}
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/account');
    } catch (error) {
      const notice=getErrorNotice(error,'register');setFormError(notice);toast({variant:'destructive',title:notice.title,description:notice.description});
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
        <form noValidate onSubmit={register} className="mt-8 space-y-5">
          <div className="space-y-2"><Label htmlFor="registerName">Your name</Label><Input aria-invalid={formError?.field==='name'} aria-describedby={formError?'registration-error':undefined} id="registerName" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e=>{setName(e.target.value);setFormError(null);}} placeholder="Name on your TreatStory profile" /></div><div className="space-y-2"><Label htmlFor="email">Email</Label><Input aria-invalid={formError?.field==='email'} aria-describedby={formError?'registration-error':undefined} id="email" type="email" autoComplete="email" required value={email} onChange={e => {setEmail(e.target.value);setFormError(null);}} /></div>
          <div className="space-y-2"><Label htmlFor="password">Password</Label><Input aria-invalid={formError?.field==='password'} aria-describedby={formError?'registration-error':undefined} id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => {setPassword(e.target.value);setFormError(null);}} /></div>
          {formError&&<div id="registration-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{formError.title}</p><p className="mt-1 text-xs">{formError.description}</p></div>}
          {!auth&&<p role="status" className="text-xs text-amber-800">Account creation is temporarily unavailable. Please try again later.</p>}
          <Button type="submit" className="h-12 w-full rounded-full" disabled={!auth || submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already registered? <Link href="/login?next=%2Fbecome-a-seller" className="font-semibold text-foreground underline underline-offset-4">Sign in</Link></p>
      </div>
    </main>
  );
}
