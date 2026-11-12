
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

      <section className="flex min-h-[100dvh] min-w-0 flex-col bg-[#f5f5f7] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:bg-[#faf8f4] sm:px-10 sm:py-9 lg:min-h-screen lg:px-12 xl:px-20">
        <div className="relative flex min-h-12 min-w-0 items-center justify-between gap-3 lg:justify-end">
          <Link href="/" aria-label="Back to shop" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-transparent pr-3 text-[15px] font-medium text-[#80684c] transition-colors hover:text-[#27272a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a88c6c] sm:rounded-full sm:border sm:border-[#e6ded2] sm:bg-white sm:px-4 sm:text-xs sm:hover:bg-[#f2ece4]">
            <ArrowLeft className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            <span className="sm:hidden">Shop</span><span className="hidden sm:inline">Back to shop</span>
          </Link>
          <Link href="/" className="brand-wordmark absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-[26px] leading-none text-[#27272a] sm:text-[30px] lg:hidden">TreatStory</Link>
          <span aria-hidden="true" className="w-12 lg:hidden" />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-start pb-7 pt-14 sm:justify-center sm:py-14">
          <div className="mb-9 sm:mb-8">
            <h1 className="text-[clamp(2.2rem,9vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.045em] text-[#1c1c1e] sm:text-[44px] sm:font-medium sm:text-[#2c2823]">{resetMode ? 'Reset password' : 'Welcome back'}</h1>
            <p className="mt-3 max-w-sm text-[15px] leading-6 text-[#767680] sm:text-sm sm:leading-6 sm:text-[#796e61]">{resetMode ? 'We’ll send a secure reset link to your email.' : 'Sign in to continue your TreatStory.'}</p>
          </div>
          <form noValidate onSubmit={resetMode ? handlePasswordReset : handleSignIn} className="space-y-5 sm:space-y-5">
            <div className="overflow-hidden rounded-[17px] border border-[#e5e5ea] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.025)] sm:space-y-5 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none">
              <div className="space-y-1 px-4 py-3 sm:space-y-2 sm:px-0 sm:py-0">
                <Label htmlFor="email" className="text-[12px] font-medium text-[#8e8e93] sm:text-xs sm:font-semibold sm:text-[#443b31]">Email address</Label>
                <Input ref={emailInput} aria-invalid={formError?.field==='email'||formError?.field==='credentials'} aria-describedby={formError?'sign-in-error':undefined} id="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={e => {setEmail(e.target.value);setFormError(null);setResetSent(false);}} required disabled={isLoading} className="h-9 rounded-none border-0 bg-transparent px-0 text-base text-[#1c1c1e] shadow-none placeholder:text-[#aeaeb2] focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-12 sm:rounded-xl sm:border sm:border-[#ddd4c8] sm:bg-white sm:px-4 sm:text-sm sm:focus-visible:ring-[#a78c6a]" />
              </div>
              {!resetMode && <div className="space-y-1 border-t border-[#eeeef0] px-4 py-3 sm:space-y-2 sm:border-0 sm:px-0 sm:py-0">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password" className="text-[12px] font-medium text-[#8e8e93] sm:text-xs sm:font-semibold sm:text-[#443b31]">Password</Label>
                  <button type="button" onClick={() => { setResetMode(true); setResetSent(false); setFormError(null); }} className="hidden min-h-9 items-center text-xs font-semibold text-[#786044] underline decoration-[#c4aa89] underline-offset-4 hover:text-[#29251f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a] sm:inline-flex">Forgot password?</button>
                </div>
                <div className="relative">
                  <Input ref={passwordInput} aria-invalid={formError?.field==='password'||formError?.field==='credentials'} aria-describedby={formError?'sign-in-error':undefined} id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => {setPassword(e.target.value);setFormError(null);}} required disabled={isLoading} className="h-9 rounded-none border-0 bg-transparent px-0 pr-12 text-base text-[#1c1c1e] shadow-none placeholder:text-[#aeaeb2] focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-12 sm:rounded-xl sm:border sm:border-[#ddd4c8] sm:bg-white sm:px-4 sm:pr-12 sm:text-sm sm:focus-visible:ring-[#a78c6a]" />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(v=>!v)} className="absolute -inset-y-1 right-0 flex w-11 items-center justify-center rounded-xl text-[#8e8e93] transition-colors hover:text-[#27272a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a88c6c] sm:inset-y-0 sm:right-1">{showPassword ? <EyeOff className="h-[19px] w-[19px]" /> : <Eye className="h-[19px] w-[19px]" />}</button>
                </div>
              </div>}
            </div>
            {!resetMode && <div className="flex justify-end">
              <button type="button" onClick={() => { setResetMode(true); setResetSent(false); setFormError(null); }} className="inline-flex min-h-11 items-center text-[13px] font-medium text-[#80684c] transition-colors hover:text-[#27272a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a88c6c] sm:hidden">Forgot password?</button>
            </div>}
            {formError&&<div id="sign-in-error" role="alert" className="border-l-[3px] border-red-400 bg-red-50/80 px-3 py-3 text-sm text-red-800 sm:rounded-xl sm:border sm:border-red-200"><p className="font-semibold">{formError.title}</p><p className="mt-1 text-xs leading-5">{formError.description}</p></div>}
            {!auth&&<p role="status" className="text-xs text-amber-800">Sign-in is temporarily unavailable. Please try again later or contact support.</p>}
            {resetMode && resetSent && <p role="status" className="border-l-[3px] border-[#b19b79] bg-[#f5f0e8] px-3 py-3 text-sm leading-6 text-[#5c4b37] sm:rounded-xl sm:border sm:border-[#e1d8ca]">If an account exists for this email, you’ll receive a reset link. Check your inbox and spam folder.</p>}
            <Button type="submit" disabled={isLoading || !auth} className="mt-1 h-[54px] w-full rounded-[15px] bg-[#1c1c1e] text-[15px] font-semibold text-white transition-colors hover:bg-[#35353a] focus-visible:ring-2 focus-visible:ring-[#9a846d] sm:mt-2 sm:h-12 sm:rounded-full sm:bg-[#29251f] sm:text-sm sm:hover:bg-[#51463a]">{isLoading ? (resetMode ? 'Sending…' : 'Signing in…') : <>{resetMode ? 'Send reset link' : 'Sign in'} <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
          </form>
          {resetMode && <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setFormError(null); }} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-[#6f583d] hover:text-[#29251f]"><ArrowLeft className="h-4 w-4" /> Back to sign in</button>}
          <div className="mt-10 pt-2 sm:mt-7 sm:border-t sm:border-[#e7ded2] sm:pt-5"><p className="text-center text-[14px] leading-6 text-[#8e8e93] sm:text-sm sm:text-[#7a7167]">New to TreatStory? <Link href="/register" className="inline-flex min-h-10 items-center font-semibold text-[#80684c] transition-colors hover:text-[#27272a] sm:min-h-8 sm:text-[#29251f] sm:underline sm:decoration-[#bca07b] sm:underline-offset-4">Create an account</Link></p></div>
          <p className="mt-5 hidden items-center justify-center gap-2 text-center text-[11px] leading-5 text-[#958a7c] sm:flex"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> Secure sign-in for customers and creators</p>
        </div>
        <p className="hidden text-center text-[11px] text-[#a3998e] sm:block">© {new Date().getFullYear()} TreatStory · Little finds. Lovely stories.</p>
      </section>
    </main>
  );
}
