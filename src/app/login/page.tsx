
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getErrorNotice, validateEmail, type UserNotice } from '@/lib/user-notices';
import { requestAccountMail } from '@/lib/account-mail';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles, ShoppingBag, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const [formError,setFormError] = useState<UserNotice|null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  // The dashboard router sends buyers to their profile and creators/admins
  // to the correct workspace. Never send a successful login to the homepage.
  useEffect(() => {
    if (!isUserLoading && user) {
      const next = new URLSearchParams(window.location.search).get('next');
      // Only permit same-origin app destinations.
      const destination = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/^\/(login|register)([/?#]|$)/.test(next) ? next : '/dashboard';
      router.replace(destination);
    }
  }, [user, isUserLoading, router]);

  useEffect(() => { if(formError?.field==='password') passwordInput.current?.focus(); else if(formError?.field) emailInput.current?.focus(); },[formError]);
  function showError(error: unknown, reset = false) {
    const notice = getErrorNotice(error,reset?'reset-password':'sign-in');
    setFormError(notice);
    toast({variant:'destructive',title:notice.title,description:notice.description,
      ...(notice.field==='credentials'?{action:<ToastAction altText="Reset your password" onClick={()=>{setResetMode(true);setResetSent(false);setFormError(null);}}>Reset password</ToastAction>}:{}),
    });
  }
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();if(isLoading)return;setFormError(null);
    const emailError = validateEmail(email);
    if(emailError){setFormError(emailError);toast({variant:'destructive',title:emailError.title,description:emailError.description});return;}
    if(!password){showError({code:'auth/missing-password'});return;}
    if(!auth){showError({code:'app/service-unavailable'});return;}
    setIsLoading(true);
    try {
      const result=await signInWithEmailAndPassword(auth,email.trim(),password);
      const firstName=result.user.displayName?.trim().split(/\s+/)[0];
      toast({title:'Signed in successfully',description:firstName?`Welcome back, ${firstName}.`:'Welcome back to TreatStory.'});
    } catch(error) {showError(error);}
    finally {setIsLoading(false);}
  };
  function resetSuccess() {
    setResetSent(true);toast({title:'Check your inbox',description:'If an account uses this email, a reset link will arrive shortly. Check your spam folder too.'});
  }
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();if(isLoading)return;setFormError(null);setResetSent(false);
    const emailError=validateEmail(email);
    if(emailError){setFormError(emailError);toast({variant:'destructive',title:emailError.title,description:emailError.description});return;}
    if(!auth){showError({code:'app/service-unavailable'},true);return;}
    setIsLoading(true);
    try {await requestAccountMail('reset-password',{email:email.trim()});resetSuccess();}
    catch(error) {if((error as {code?:string})?.code==='auth/user-not-found')resetSuccess();else showError(error,true);}
    finally {setIsLoading(false);}
  };

  if (isUserLoading || user) {
    return <div className="flex min-h-screen items-center justify-center bg-[#faf8f4]"><div className="flex items-center gap-3 text-sm text-[#756b5e]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d7c7b3] border-t-[#453a2f]" />Opening TreatStory…</div></div>;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf8f4] text-[#2c2823] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#e9dfd0] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[url('/img/login-side.avif')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1d1916]/45 via-[#1d1916]/10 to-[#1d1916]/75" />
        <div className="relative z-10 flex items-center justify-between px-10 pt-10 xl:px-16">
          <Link href="/" className="brand-wordmark text-4xl text-white">TreatStory</Link>
          <span className="rounded-full border border-white/40 bg-white/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">Made with heart</span>
        </div>
        <div className="relative z-10 max-w-xl px-10 pb-14 text-white xl:px-16 xl:pb-20">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f0d9b5]"><Sparkles className="h-4 w-4" /> Thoughtfully discovered</p>
          <h2 className="mt-5 text-5xl font-medium leading-[1.08] tracking-tight xl:text-6xl">Every little find has <span className="font-serif italic font-normal">a story.</span></h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/85">From homemade bakes to thoughtful handcrafted gifts, discover creations made with care by independent makers.</p>
          <div className="mt-9 flex items-center gap-5 border-t border-white/30 pt-6 text-xs text-white/85"><span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Curated finds</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Your personal account</span></div>
        </div>
      </section>

      <section className="flex min-h-[100dvh] min-w-0 flex-col bg-[#fcfaf6] px-5 pb-6 pt-6 sm:bg-[#faf8f4] sm:px-10 sm:py-9 lg:min-h-screen lg:px-12 xl:px-20">
        <div className="flex min-w-0 items-center justify-between gap-4 lg:justify-end">
          <Link href="/" className="brand-wordmark min-w-0 text-[30px] leading-none text-[#302920] lg:hidden">TreatStory</Link>
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-transparent px-0 text-xs font-medium text-[#72604d] transition-colors hover:text-[#2c2823] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a] sm:border sm:border-[#e6ded2] sm:bg-white sm:px-4 sm:hover:bg-[#f2ece4]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to shop</Link>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-start pb-7 pt-11 sm:justify-center sm:py-14">
          <div className="mb-8 sm:mb-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b7d56] lg:hidden">Your space on TreatStory</p>
            <h1 className="text-[clamp(2.15rem,9vw,2.65rem)] font-medium leading-[1.12] tracking-[-0.045em] sm:text-[44px]">{resetMode ? 'Reset your password.' : 'Welcome back.'}</h1>
            <p className="mt-3 max-w-sm text-sm leading-7 text-[#796e61] sm:mt-3 sm:text-sm sm:leading-6">{resetMode ? 'Enter your email and we’ll send you a secure link to reset your password.' : 'Sign in to find your saved creations, orders and favourite makers.'}</p>
          </div>
          <form noValidate onSubmit={resetMode ? handlePasswordReset : handleSignIn} className="space-y-5 sm:space-y-5">
            <div className="space-y-2"><Label htmlFor="email" className="text-xs font-semibold text-[#443b31]">Email address</Label><Input ref={emailInput} aria-invalid={formError?.field==='email'||formError?.field==='credentials'} aria-describedby={formError?'sign-in-error':undefined} id="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={e => {setEmail(e.target.value);setFormError(null);setResetSent(false);}} required disabled={isLoading} className="h-[54px] rounded-[14px] border-[#e2d9cd] bg-white px-4 text-base shadow-none sm:h-12 sm:rounded-xl sm:text-sm focus-visible:ring-[#a78c6a]" /></div>
            {!resetMode && <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password" className="text-xs font-semibold text-[#443b31]">Password</Label>
                <button type="button" onClick={() => { setResetMode(true); setResetSent(false); setFormError(null); }} className="inline-flex min-h-9 items-center text-xs font-semibold text-[#786044] underline decoration-[#c4aa89] underline-offset-4 hover:text-[#29251f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a]">Forgot password?</button>
              </div>
              <div className="relative"><Input ref={passwordInput} aria-invalid={formError?.field==='password'||formError?.field==='credentials'} aria-describedby={formError?'sign-in-error':undefined} id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => {setPassword(e.target.value);setFormError(null);}} required disabled={isLoading} className="h-[54px] rounded-[14px] border-[#e2d9cd] bg-white px-4 pr-12 text-base shadow-none sm:h-12 sm:rounded-xl sm:text-sm focus-visible:ring-[#a78c6a]" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(v=>!v)} className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-lg text-[#7a7167] hover:text-[#29251f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>}
            {formError&&<div id="sign-in-error" role="alert" className="border-l-[3px] border-red-400 bg-red-50/80 px-3 py-3 text-sm text-red-800 sm:rounded-xl sm:border sm:border-red-200"><p className="font-semibold">{formError.title}</p><p className="mt-1 text-xs leading-5">{formError.description}</p></div>}
            {!auth&&<p role="status" className="text-xs text-amber-800">Sign-in is temporarily unavailable. Please try again later or contact support.</p>}
            {resetMode && resetSent && <p role="status" className="border-l-[3px] border-[#b19b79] bg-[#f5f0e8] px-3 py-3 text-sm leading-6 text-[#5c4b37] sm:rounded-xl sm:border sm:border-[#e1d8ca]">If an account exists for this email, you’ll receive a reset link. Check your inbox and spam folder.</p>}
            <Button type="submit" disabled={isLoading || !auth} className="mt-2 h-[54px] w-full rounded-full bg-[#29251f] text-sm font-semibold text-white transition hover:bg-[#51463a] sm:h-12">{isLoading ? (resetMode ? 'Sending…' : 'Signing in…') : <>{resetMode ? 'Send reset link' : 'Sign in'} <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
          </form>
          {resetMode && <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setFormError(null); }} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-[#6f583d] hover:text-[#29251f]"><ArrowLeft className="h-4 w-4" /> Back to sign in</button>}
          <div className="mt-8 border-t border-[#e7ded2] pt-6 sm:mt-7 sm:pt-5"><p className="text-center text-sm leading-6 text-[#7a7167]">New to TreatStory? <Link href="/register" className="inline-flex min-h-8 items-center font-semibold text-[#29251f] underline decoration-[#bca07b] underline-offset-4 hover:text-[#8c6c43]">Create an account</Link></p></div>
          <p className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-[#958a7c]"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> Secure sign-in for customers and creators</p>
        </div>
        <p className="hidden text-center text-[11px] text-[#a3998e] sm:block">© {new Date().getFullYear()} TreatStory · Little finds. Lovely stories.</p>
      </section>
    </main>
  );
}
