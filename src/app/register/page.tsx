'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { getErrorNotice, validateEmail, type UserNotice } from '@/lib/user-notices';
import { requestAccountMail } from '@/lib/account-mail';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles, ShoppingBag } from 'lucide-react';

export default function RegisterPage() {
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [formError,setFormError]=useState<UserNotice|null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function nextDestination() {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/^\/(login|register)([/?#]|$)/.test(next) ? next : '/dashboard';
  }

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
      router.replace(nextDestination());
    } catch (error) {
      const notice=getErrorNotice(error,'register');setFormError(notice);toast({variant:'destructive',title:notice.title,description:notice.description});
    } finally {
      setSubmitting(false);
    }
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

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-start pb-7 pt-10 sm:justify-center sm:py-14">
          <div className="mb-7 sm:mb-8">
            <h1 className="text-[clamp(2.15rem,8vw,2.65rem)] font-semibold leading-[1.1] tracking-[-0.045em] text-[#1c1c1e] sm:text-[44px] sm:font-medium sm:text-[#2c2823]">Create your account</h1>
            <p className="mt-3 max-w-sm text-[15px] leading-6 text-[#767680] sm:text-sm sm:text-[#796e61]">Discover thoughtful creations, follow your favourites and keep orders in one place.</p>
          </div>

          <form noValidate onSubmit={register} className="space-y-5">
            <div className="overflow-hidden rounded-[17px] border border-[#e5e5ea] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.025)] sm:space-y-5 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none">
              <div className="space-y-1 px-4 py-2.5 sm:space-y-2 sm:px-0 sm:py-0">
                <Label htmlFor="registerName" className="text-[12px] font-medium text-[#8e8e93] sm:text-xs sm:font-semibold sm:text-[#443b31]">Your name</Label>
                <Input aria-invalid={formError?.field==='name'} aria-describedby={formError?'registration-error':undefined} id="registerName" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e=>{setName(e.target.value);setFormError(null);}} placeholder="Your full name" className="h-9 rounded-none border-0 bg-transparent px-0 text-base shadow-none placeholder:text-[#aeaeb2] focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-12 sm:rounded-xl sm:border sm:border-[#ddd4c8] sm:bg-white sm:px-4 sm:text-sm sm:focus-visible:ring-[#a78c6a]" />
              </div>
              <div className="space-y-1 border-t border-[#eeeef0] px-4 py-2.5 sm:space-y-2 sm:border-0 sm:px-0 sm:py-0">
                <Label htmlFor="email" className="text-[12px] font-medium text-[#8e8e93] sm:text-xs sm:font-semibold sm:text-[#443b31]">Email address</Label>
                <Input aria-invalid={formError?.field==='email'} aria-describedby={formError?'registration-error':undefined} id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={e => {setEmail(e.target.value);setFormError(null);}} placeholder="you@example.com" className="h-9 rounded-none border-0 bg-transparent px-0 text-base shadow-none placeholder:text-[#aeaeb2] focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-12 sm:rounded-xl sm:border sm:border-[#ddd4c8] sm:bg-white sm:px-4 sm:text-sm sm:focus-visible:ring-[#a78c6a]" />
              </div>
              <div className="space-y-1 border-t border-[#eeeef0] px-4 py-2.5 sm:space-y-2 sm:border-0 sm:px-0 sm:py-0">
                <Label htmlFor="password" className="text-[12px] font-medium text-[#8e8e93] sm:text-xs sm:font-semibold sm:text-[#443b31]">Password</Label>
                <div className="relative">
                  <Input aria-invalid={formError?.field==='password'} aria-describedby={formError?'registration-error':undefined} id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} value={password} onChange={e => {setPassword(e.target.value);setFormError(null);}} placeholder="At least 6 characters" className="h-9 rounded-none border-0 bg-transparent px-0 pr-12 text-base shadow-none placeholder:text-[#aeaeb2] focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-12 sm:rounded-xl sm:border sm:border-[#ddd4c8] sm:bg-white sm:px-4 sm:pr-12 sm:text-sm sm:focus-visible:ring-[#a78c6a]" />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)} className="absolute -inset-y-1 right-0 flex w-11 items-center justify-center rounded-xl text-[#8e8e93] hover:text-[#27272a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a88c6c] sm:inset-y-0 sm:right-1">{showPassword ? <EyeOff className="h-[19px] w-[19px]"/>:<Eye className="h-[19px] w-[19px]"/>}</button>
                </div>
              </div>
            </div>
            {formError&&<div id="registration-error" role="alert" className="border-l-[3px] border-red-400 bg-red-50/80 px-3 py-3 text-sm text-red-800 sm:rounded-xl sm:border sm:border-red-200"><p className="font-semibold">{formError.title}</p><p className="mt-1 text-xs leading-5">{formError.description}</p></div>}
            {!auth&&<p role="status" className="text-xs text-amber-800">Account creation is temporarily unavailable. Please try again later.</p>}
            <Button type="submit" className="mt-1 h-[54px] w-full rounded-[15px] bg-[#1c1c1e] text-[15px] font-semibold text-white hover:bg-[#35353a] sm:h-12 sm:rounded-full sm:bg-[#29251f] sm:text-sm" disabled={!auth || submitting}>{submitting ? 'Creating account…' : <span className="inline-flex items-center gap-2">Create account <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}</Button>
          </form>

          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[#dedee3] sm:bg-[#e7ded2]" />
              <span className="text-xs font-medium text-[#8e8e93]">or</span>
              <span className="h-px flex-1 bg-[#dedee3] sm:bg-[#e7ded2]" />
            </div>
            <GoogleSignInButton auth={auth} disabled={submitting} onSuccess={() => router.replace(nextDestination())} />
          </div>

          <div className="mt-8 border-t border-[#e7e7ea] pt-5 sm:mt-7 sm:border-[#e7ded2]">
            <p className="text-center text-sm text-[#8e8e93] sm:text-[#7a7167]">Already have an account? <Link href="/login" className="inline-flex min-h-10 items-center font-semibold text-[#80684c] hover:text-[#29251f] sm:underline sm:underline-offset-4">Sign in</Link></p>
          </div>
          <p className="mt-5 hidden items-center justify-center gap-2 text-center text-[11px] text-[#958a7c] sm:flex"><ShieldCheck className="h-4 w-4"/> Secure account for customers and creators</p>
        </div>
        <p className="hidden text-center text-[11px] text-[#a3998e] sm:block">© {new Date().getFullYear()} TreatStory · Little finds. Lovely stories.</p>
      </section>
    </main>
  );
}
