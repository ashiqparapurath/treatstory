'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, CakeSlice, Check, CheckCircle2, Gift, Heart,
  Palette, ShieldCheck, ShoppingBag, Sparkles, Store,
} from 'lucide-react';
import { SELLER_TRIAL_MESSAGE } from '@/lib/seller-policy';
import { errorToast } from '@/lib/user-notices';
import { Header } from '@/components/header';
import { useAccountRole, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { SellerCategory } from '@/lib/marketplace-types';

const categories: { value: SellerCategory; label: string }[] = [
  { value: 'home-bakery', label: 'Home bakery' },
  { value: 'art', label: 'Art and paintings' },
  { value: 'handmade', label: 'Handmade crafts and gifts' },
  { value: 'other', label: 'Other creative business' },
];

type ApplicationStep = 1 | 2 | 3;
const applicationSteps = ['Your business', 'Contact details', 'Your story'] as const;

function StorefrontPreview() {
  const previewProducts = [
    { name: 'Home bakes', icon: CakeSlice, bg: 'bg-[#eacbb7]', accent: 'text-[#854f37]' },
    { name: 'Art & prints', icon: Palette, bg: 'bg-[#d9d8c6]', accent: 'text-[#66704f]' },
    { name: 'Handmade gifts', icon: Gift, bg: 'bg-[#e8d8c8]', accent: 'text-[#9d7655]' },
  ];
  return (
    <div aria-label="Illustrative preview of a TreatStory seller storefront" className="mx-auto w-full max-w-[490px] min-w-0">
      <div className="relative rounded-[26px] border border-white/90 bg-[#fffdf8] p-3 shadow-[0_24px_70px_rgba(66,46,30,0.14)] sm:rounded-[30px] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#efe7db] px-2 pb-3">
          <span className="font-serif text-[22px] tracking-[-0.055em] text-[#392e25]">TreatStory<span className="text-[#ae885e]">.</span></span>
          <span className="rounded-full bg-[#f5eee4] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8b6d50]">Store preview</span>
        </div>
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ede0cf] text-[#765438]"><Store aria-hidden="true" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.015em] text-[#322820]">Your creator studio</p>
            <p className="mt-0.5 text-[11px] text-[#8c7c6e]">A space for what you make</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:gap-3">
          {previewProducts.map(({name,icon: Icon,bg,accent}) => (
            <div key={name} className="min-w-0">
              <div className={'flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[14px] ' + bg}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/60 bg-white/35 shadow-inner sm:h-20 sm:w-20">
                  <Icon aria-hidden="true" className={'h-8 w-8 stroke-[1.2] sm:h-10 sm:w-10 ' + accent}/>
                </div>
              </div>
              <p className="mt-2 truncate text-[10px] font-semibold text-[#534438] sm:text-xs">{name}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-[14px] bg-[#f7f1e9] px-3 py-3">
          <span className="text-[11px] font-medium text-[#70563d]">Your products. Your storefront.</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9b7753]"/>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] tracking-wide text-[#8b7762]">Illustrative storefront preview · Not actual products or seller results</p>
    </div>
  );
}

function SellerFaq() {
  const questions = [
    { q: 'Do I need an account to apply?', a: 'No. You can apply first. Before seller access is enabled, register and verify an account using the same email address.' },
    { q: 'When does the six-month free trial begin?', a: SELLER_TRIAL_MESSAGE },
    { q: 'Can I apply from outside Kerala?', a: 'Yes. Creators in India can apply. Sellers choose their own pickup and delivery coverage; national shipping is not guaranteed.' },
    { q: 'What if I sell food or home bakes?', a: 'Home bakers must provide current FSSAI registration or licence information for review in Store Settings before publishing products.' },
    { q: 'Will my store be approved immediately?', a: 'No. TreatStory reviews each application before activating seller access.' },
  ];
  return (
    <section aria-labelledby="seller-faq-heading" className="mt-16 scroll-mt-28 border-t border-[#e6dccf] pt-10 sm:mt-20 sm:pt-14">
      <div className="grid gap-7 md:grid-cols-[0.7fr_1.3fr] md:gap-14">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#957454]">Good to know</p>
          <h2 id="seller-faq-heading" className="mt-3 max-w-sm font-serif text-[30px] leading-tight tracking-[-0.035em] text-[#32271f] sm:text-4xl">A few things you might wonder.</h2>
          <p className="mt-4 text-sm leading-7 text-[#796b5e]">Clear answers before you apply.</p>
        </div>
        <div className="divide-y divide-[#e6dccf] border-y border-[#e6dccf]">
          {questions.map(({q,a}) => (
            <details key={q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-[14px] font-medium text-[#3d3026] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8c6848] [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden="true" className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#efe5d8] text-[#8b6b4b]">
                  <span className="absolute h-px w-2.5 bg-current"/>
                  <span className="absolute h-2.5 w-px bg-current transition-transform group-open:rotate-90 group-open:opacity-0"/>
                </span>
              </summary>
              <p className="max-w-xl pb-5 pr-8 text-[13px] leading-6 text-[#75695e]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BecomeSellerPage() {
  const { user, isUserLoading } = useUser();
  const { seller, isRoleLoading, roleError } = useAccountRole();
  const { toast } = useToast();
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState<SellerCategory>('home-bakery');
  const [contactEmail, setContactEmail] = useState('');
  useEffect(() => { if (user?.email) setContactEmail(v => v || user.email || ''); }, [user?.email]);
  const [contactPhone, setContactPhone] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<ApplicationStep>(1);
  const [applicationVisible, setApplicationVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const initialStep = useRef(true);

  useEffect(() => {
    const target = document.getElementById('seller-application');
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setApplicationVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialStep.current) { initialStep.current = false; return; }
    stepHeading.current?.focus();
    stepHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || seller || (user && (isRoleLoading || roleError))) return;
    if (step !== 3) {
      setStep(current => (current + 1) as ApplicationStep);
      return;
    }
    const website = new FormData(event.currentTarget).get('website') || '';
    setSubmitting(true);
    try {
      const response = await fetch('/api/seller-applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: 'Bearer ' + await user.getIdToken() } : {}),
        },
        body: JSON.stringify({
          businessName: businessName.trim(), businessCategory,
          businessCity: businessCity.trim(), businessState: businessState.trim(),
          contactEmail: contactEmail.trim(), contactPhone: contactPhone.trim(),
          description: description.trim(), website,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Application could not be submitted.');
      setSubmitted(true);
      toast({ title: 'Application submitted', description: 'Your request is awaiting review.' });
    } catch (error) {
      toast(errorToast(error, 'seller-application'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fcfaf6] text-[#30291f]">
      <Header />
      <main className="section-shell mx-auto max-w-6xl pb-44 pt-5 sm:pb-24 sm:pt-9">
        <section aria-labelledby="seller-page-heading" className="relative overflow-hidden rounded-[22px] bg-[#f0e6d9] sm:rounded-[32px]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-36 h-72 w-72 rounded-full bg-white/40 blur-3xl sm:h-[450px] sm:w-[450px]"/>
          <div className="relative grid min-w-0 items-center gap-9 px-5 py-8 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10 lg:px-12 lg:py-16">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#855f40]">
                <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0"/> A place for independent makers
              </p>
              <h1 id="seller-page-heading" className="mt-5 max-w-[650px] text-[clamp(2.2rem,6vw,4.3rem)] font-medium leading-[1.1] tracking-[-0.052em] text-[#30261f]">
                What you create deserves <span className="font-serif font-normal italic text-[#9c724d]">its own stage.</span>
              </h1>
              <p className="mt-5 max-w-md text-[14px] leading-7 text-[#65574b] sm:text-base sm:leading-8">
                From home bakes and handmade gifts to art and one-of-a-kind pieces, share your work with shoppers discovering independent creators across India.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href="#seller-application" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#30271f] px-6 text-[13px] font-semibold text-white transition hover:bg-[#4a3b2c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#30271f]">
                  Apply to sell <ArrowRight aria-hidden="true" className="h-4 w-4"/>
                </a>
                <a href="#how-it-works" className="inline-flex min-h-11 items-center gap-2 px-1 text-[13px] font-medium text-[#604b38] underline decoration-[#a88965] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#604b38]">How it works</a>
              </div>
              <p className="mt-6 flex max-w-lg items-start gap-2 text-[12px] leading-6 text-[#6a553f]">
                <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#8d6b48]"/>
                {SELLER_TRIAL_MESSAGE}
              </p>
            </div>
            <StorefrontPreview/>
          </div>
        </section>

        <section aria-labelledby="seller-benefits-heading" className="mt-13 sm:mt-20">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#9f805a]">Why TreatStory</p>
            <h2 id="seller-benefits-heading" className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.04em] text-[#312820] sm:text-4xl">Keep your craft at the centre.</h2>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-8">
            {[
              { icon: Store, title: 'A storefront that feels like yours', detail: 'Bring your creations, photos and product details together in a space shoppers can explore.' },
              { icon: ShoppingBag, title: 'Orders in one place', detail: 'See incoming requests and manage orders from your seller dashboard.' },
              { icon: Heart, title: 'Your work, thoughtfully presented', detail: 'Show the story and care behind each handmade piece, bake or artwork.' },
            ].map(({icon: Icon,title,detail}) => (
              <div key={title} className="flex gap-3 border-t border-[#e7ddcf] pt-5 sm:block">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f2e8dc] text-[#8e6a46] sm:mb-5 sm:h-12 sm:w-12">
                  <Icon aria-hidden="true" className="h-5 w-5 stroke-[1.6]"/>
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-[#382d24] sm:text-base">{title}</h3>
                  <p className="mt-2 max-w-sm text-[13px] leading-6 text-[#776b5e]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="seller-process-heading" className="scroll-mt-28 mt-14 sm:mt-20">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#9f805a]">Simple from the start</p>
            <h2 id="seller-process-heading" className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.04em] sm:text-4xl">A thoughtful beginning, in three steps.</h2>
          </div>
          <ol className="mt-7 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {[
              ['01', 'Tell us what you make', 'Introduce your business and where you are based.'],
              ['02', 'Share how to reach you', 'Add the contact details we can use to review your request.'],
              ['03', 'Send your story', 'Submit your application for review before seller access is enabled.'],
            ].map(([number,title,detail]) => (
              <li key={number} className="flex gap-4 border-t border-[#e7ddcf] pt-5">
                <span aria-hidden="true" className="font-serif text-[28px] italic leading-none text-[#b08a63]">{number}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#382d24]">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-[#776b5e]">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="seller-application" aria-label="Seller application" className="mt-16 scroll-mt-28 border-t border-[#e7ddcf] pt-9 sm:mt-20 sm:pt-12">
          {isUserLoading || (user && isRoleLoading) ? (
            <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 text-sm text-[#746958]">
              <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#d8c9b6] border-t-[#65513a]"/>
              Checking your account…
            </div>
          ) : seller ? (
            <section role="status" className="max-w-2xl space-y-4 py-3 sm:rounded-[25px] sm:bg-[#eef2e8] sm:p-9">
              <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-[#648056]"/>
              <h2 className="text-2xl font-medium">Your seller space is ready.</h2>
              <p className="text-sm leading-7 text-[#67735d]">You already have seller access. Open your dashboard to manage your creations, store and orders.</p>
              <Link href="/seller/dashboard" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white">Open seller dashboard <ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>
            </section>
          ) : roleError ? (
            <section role="alert" className="max-w-2xl py-3 text-sm leading-7 text-amber-950">
              We couldn’t check your seller account access right now. Refresh this page or contact support if the problem continues.
            </section>
          ) : submitted ? (
            <section role="status" className="max-w-2xl py-3 sm:rounded-[25px] sm:bg-[#eef2e8] sm:p-9">
              <CheckCircle2 aria-hidden="true" className="h-9 w-9 text-[#688259]"/>
              <h2 className="mt-4 font-serif text-3xl">Your story is on its way.</h2>
              <p className="mt-3 text-sm leading-7 text-[#617459]">We’ve received your application. We’ll review the details and contact you using the information you provided.</p>
              {!user && <p className="mt-4 text-sm leading-6"><Link href="/register?next=%2Fbecome-a-seller" className="underline">Create an account</Link> with the same contact email and verify it before seller activation. <Link href="/login?next=%2Fbecome-a-seller" className="underline">Already registered? Sign in.</Link></p>}
              <Link href="/" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#455b3d] underline underline-offset-4">Back to TreatStory <ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>
            </section>
          ) : (
            <section aria-labelledby="seller-form-heading" className="mx-auto max-w-[770px]">
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#9f805a]">Become a TreatStory creator</p>
                <h2 id="seller-form-heading" className="mt-2 font-serif text-[30px] tracking-[-0.035em] text-[#312820] sm:text-4xl">Your next chapter starts here.</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#73685b]">Tell us a little about your business. You can review your details before sending your application.</p>
              </div>
              <div className="mt-8 sm:rounded-[26px] sm:border sm:border-[#ece2d6] sm:bg-white sm:p-9 sm:shadow-[0_12px_40px_rgba(55,42,28,0.045)]">
                <ol aria-label="Application progress" className="grid grid-cols-3 gap-2 sm:gap-3">
                  {applicationSteps.map((title,index) => {
                    const number = (index + 1) as ApplicationStep;
                    const current = step === number;
                    const completed = step > number;
                    return <li key={title} aria-current={current ? 'step' : undefined} className="min-w-0">
                      <div className={ 'h-1.5 rounded-full ' + (completed || current ? 'bg-[#8b623f]' : 'bg-[#eee7dd]') }/>
                      <div className="mt-3 flex items-center gap-2">
                        <span aria-hidden="true" className={ 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' + (current || completed ? 'bg-[#3f3023] text-white' : 'bg-[#f1e9de] text-[#8f7b66]') }>
                          {completed ? <Check aria-hidden="true" className="h-3.5 w-3.5"/> : number}
                        </span>
                        <span className={ 'truncate text-[10px] font-medium sm:text-xs ' + (current ? 'text-[#32271f]' : 'text-[#8b7d70]') }>{title}</span>
                      </div>
                    </li>;
                  })}
                </ol>
                <div className="mt-9 border-b border-[#eee6dc] pb-5">
                  <p aria-live="polite" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a07f5b]">Step {step} of 3</p>
                  <h3 ref={stepHeading} tabIndex={-1} className="mt-2 scroll-mt-32 text-[23px] font-medium tracking-[-0.03em] text-[#30291f] outline-none" >
                    {step === 1 ? 'Tell us about your business' : step === 2 ? 'How can we reach you?' : 'The story behind your work'}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#827367]">
                    {step === 1 ? 'What do you create, and where is your studio based?' : step === 2 ? 'We will use these details to contact you about your application.' : 'A few words about what makes your creations special.'}
                  </p>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-6">
                  <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"/>
                  {step === 1 && <>
                    <div className="space-y-2">
                      <Label htmlFor="businessName">Business / studio name</Label>
                      <Input id="businessName" required minLength={2} maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="e.g. Little Bloom Bakery" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="businessCategory">What do you create?</Label>
                      <Select value={businessCategory} onValueChange={value => setBusinessCategory(value as SellerCategory)} disabled={submitting}>
                        <SelectTrigger id="businessCategory" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-left text-base sm:text-sm">
                          <SelectValue placeholder="Choose a creator category"/>
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={6} align="start" className="max-h-[min(22rem,65dvh)] w-[var(--radix-select-trigger-width)]">
                          {categories.map(category => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="businessCity">Business city / town</Label>
                        <Input id="businessCity" required minLength={2} maxLength={80} value={businessCity} onChange={event=>setBusinessCity(event.target.value)} placeholder="e.g. Kochi" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="businessState">State or union territory</Label>
                        <Input id="businessState" required minLength={2} maxLength={80} value={businessState} onChange={event=>setBusinessState(event.target.value)} placeholder="e.g. Kerala" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                      </div>
                    </div>
                  </>}
                  {step === 2 && <>
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">Contact email</Label>
                      <Input id="contactEmail" type="email" required maxLength={254} value={contactEmail} onChange={event=>setContactEmail(event.target.value)} placeholder="you@example.com" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">Contact number</Label>
                      <Input id="contactPhone" type="tel" required minLength={5} maxLength={40} value={contactPhone} onChange={event=>setContactPhone(event.target.value)} placeholder="A number we can reach" className="min-h-12 rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                    </div>
                    <p className="flex items-start gap-2 text-[12px] leading-6 text-[#827367]">
                      <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#866e52]"/>
                      Application review happens before seller access is activated.
                    </p>
                  </>}
                  {step === 3 && <>
                    <div className="space-y-2">
                      <Label htmlFor="description">A little about your work</Label>
                      <Textarea id="description" required maxLength={2000} rows={5} value={description} onChange={event=>setDescription(event.target.value)} placeholder="What do you make, and what makes your creations special?" className="min-h-[144px] rounded-xl border-[#e6dacd] bg-white text-base sm:text-sm" disabled={submitting}/>
                      <p className="text-xs leading-5 text-[#8d8174]">Home bakers must submit current FSSAI registration or licence details for review in Store Settings before publishing products.</p>
                    </div>
                    <div className="rounded-[18px] bg-[#f7f1e8] px-4 py-4">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c684b]">Your application at a glance</p>
                      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                        <div className="min-w-0"><dt className="text-[#8c7b6c]">Business</dt><dd className="mt-0.5 break-words font-medium text-[#3b3027]">{businessName}</dd></div>
                        <div className="min-w-0"><dt className="text-[#8c7b6c]">Location</dt><dd className="mt-0.5 break-words font-medium text-[#3b3027]">{businessCity}, {businessState}</dd></div>
                        <div className="min-w-0"><dt className="text-[#8c7b6c]">Category</dt><dd className="mt-0.5 font-medium text-[#3b3027]">{categories.find(category=>category.value===businessCategory)?.label}</dd></div>
                        <div className="min-w-0"><dt className="text-[#8c7b6c]">Contact</dt><dd className="mt-0.5 break-all font-medium text-[#3b3027]">{contactEmail}</dd></div>
                      </dl>
                    </div>
                  </>}
                  <div className="flex flex-col-reverse gap-3 border-t border-[#eee6dc] pt-6 sm:flex-row sm:items-center sm:justify-between">
                    {step > 1 ? <button type="button" onClick={()=>setStep(current=>(current-1) as ApplicationStep)} disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#dfd1c2] px-5 text-[13px] font-semibold text-[#5c4938] hover:bg-[#f9f4ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#856445]">
                      <ArrowLeft aria-hidden="true" className="h-4 w-4"/> Back
                    </button> : <p className="text-[11px] leading-5 text-[#8d8174]">Takes just a few details to get started.</p>}
                    <Button type="submit" disabled={submitting} className="min-h-12 w-full rounded-full bg-[#30291f] px-7 text-sm font-semibold text-white hover:bg-[#554737] sm:w-auto">
                      {step === 3 ? (submitting ? 'Sending your application…' : 'Send seller application') : 'Continue'}
                      {!submitting && <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4"/>}
                    </Button>
                  </div>
                  {step === 3 && <p className="text-xs leading-6 text-[#8d8174]">No account is needed to apply. Register and verify the same email before activation. Approval is not automatic.</p>}
                </form>
              </div>
            </section>
          )}
        </section>

        <SellerFaq/>
        <p className="mt-12 border-t border-[#eee6db] pt-7 text-center text-[11px] tracking-wide text-[#9e907f]">Little finds, lovely stories. Made by people like you.</p>
      </main>
      {!submitted && !seller && !roleError && !applicationVisible && !isUserLoading && (
        <a href="#seller-application" aria-label="Apply to sell on TreatStory"
          className="fixed inset-x-4 z-30 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white shadow-[0_9px_28px_rgba(50,35,25,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#30291f] md:hidden"
          style={{ bottom: 'calc(90px + env(safe-area-inset-bottom))' }}>
          Apply to sell <ArrowRight aria-hidden="true" className="h-4 w-4"/>
        </a>
      )}
    </div>
  );
}
