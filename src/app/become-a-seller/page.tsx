'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Gift, Heart, MapPin, PackageCheck, ShieldCheck, Sparkles, Store, X } from 'lucide-react';
import { Header } from '@/components/header';
import { useAccountRole, useUser } from '@/firebase';
import { SELLER_TRIAL_MESSAGE } from '@/lib/seller-policy';
import { errorToast } from '@/lib/user-notices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { SellerCategory } from '@/lib/marketplace-types';

type ApplicationStep = 1 | 2 | 3;
const steps = ['Your business', 'Contact details', 'Your story'] as const;
const categories: { value: SellerCategory; label: string }[] = [
  { value: 'home-bakery', label: 'Home bakery' },
  { value: 'art', label: 'Art & paintings' },
  { value: 'handmade', label: 'Handmade crafts & gifts' },
  { value: 'other', label: 'Another creative business' },
];

const benefits = [
  { icon: Store, number: '01', heading: 'A space of your own', copy: 'Let buyers see your creations together in a dedicated storefront with your own story.' },
  { icon: Heart, number: '02', heading: 'Made for independent makers', copy: 'Show your craft and connect with people looking for thoughtful, one-of-a-kind finds.' },
  { icon: PackageCheck, number: '03', heading: 'Stay close to every order', copy: 'Manage products, incoming requests and orders with tools designed for small businesses.' },
];

function CreatorHero() {
  return (
    <section aria-labelledby="seller-page-heading" className="-mx-4 overflow-hidden bg-[#252a25] text-[#fff9ed] sm:mx-0 sm:rounded-[28px]">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="flex min-w-0 flex-col justify-center px-5 pb-9 pt-11 sm:px-10 sm:py-14 lg:px-14 lg:py-20">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e6c7a6]">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> TreatStory for creators
          </p>
          <h1 id="seller-page-heading" className="mt-5 max-w-[570px] font-serif text-[clamp(2.75rem,7.4vw,5.1rem)] leading-[1.04] tracking-[-0.052em]">
            Made by you.
            <span className="mt-1 block italic text-[#e3bf98]">Loved by many.</span>
          </h1>
          <p className="mt-6 max-w-md text-[14px] leading-7 text-[#e3e1d8] sm:text-[15px] sm:leading-8">
            Your baking, art and handmade creations deserve to be discovered. Bring your story to a marketplace celebrating independent makers across India.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href="#seller-application" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f1d9b9] px-6 text-sm font-semibold text-[#2e3029] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1d9b9]">
              Start your application <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
            <a href="#how-it-works" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#eee2d3] underline decoration-[#bda48b] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              See how it works <ArrowDownRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-10 flex max-w-md items-start gap-3 border-t border-white/15 pt-5">
            <CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#efd0a8]" />
            <p className="text-[12px] leading-6 text-[#eee5db]">{SELLER_TRIAL_MESSAGE}</p>
          </div>
        </div>
        <div className="relative min-h-[235px] overflow-hidden bg-[#dac4ad] sm:min-h-[360px] lg:min-h-[550px]">
          <Image src="/img/our-story-creators.svg" alt="Illustration of cakes, ceramics, embroidery and handmade gifts displayed together" width={1400} height={790} priority
            className="absolute inset-0 h-full w-full object-cover object-center" sizes="(max-width: 1023px) 100vw, 45vw" />
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-[15px] border border-white/70 bg-[#fffdf6]/95 px-4 py-3 text-[#44372b] shadow-[0_10px_22px_rgba(44,29,17,0.10)] sm:bottom-7 sm:left-7 sm:right-7">
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9c7653]">Your own creator space</p>
              <p className="mt-1 truncate font-serif text-[17px] sm:text-xl">Every creation has a story.</p></div>
            <Store aria-hidden="true" className="h-5 w-5 shrink-0 text-[#9c7653]"/>
          </div>
        </div>
      </div>
    </section>
  );
}

function SellerBenefits() {
  return (
    <section aria-labelledby="seller-benefits-heading" className="mt-16 sm:mt-24">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#96714e]">Why join TreatStory</p>
          <h2 id="seller-benefits-heading" className="mt-3 font-serif text-[clamp(1.9rem,5vw,3.2rem)] leading-[1.12] tracking-[-0.038em] text-[#2e302a]">A thoughtful place for the work you love.</h2>
        </div>
        <p className="max-w-xs text-[13px] leading-6 text-[#776f62]">You create the good things. We give people a place to find them.</p>
      </div>
      <div className="mt-9 grid gap-7 sm:grid-cols-3 sm:gap-6">
        {benefits.map(({icon: Icon,number,heading,copy}) => (
          <div key={number} className="min-w-0 border-t border-[#dbd4c8] pt-5">
            <div className="flex items-center justify-between">
              <span className="font-serif text-[15px] italic text-[#a38362]">{number}</span>
              <Icon aria-hidden="true" className="h-5 w-5 stroke-[1.5] text-[#947050]"/>
            </div>
            <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.02em] text-[#342e26]">{heading}</h3>
            <p className="mt-2 max-w-sm text-[13px] leading-7 text-[#786d61]">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const items = [
    ['Introduce yourself', 'Tell us what you make, where you are based and how to contact you.'],
    ['We review your application', 'TreatStory checks seller details before activating your creator account.'],
    ['Set up your shop', 'Once approved, add products and configure delivery or pickup areas you can fulfil.'],
  ];
  return (
    <section id="how-it-works" aria-labelledby="seller-how-heading" className="mt-16 scroll-mt-24 bg-[#eee9df] px-5 py-10 sm:mt-24 sm:rounded-[24px] sm:px-10 sm:py-12 lg:px-12">
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#907353]">The process</p>
          <h2 id="seller-how-heading" className="mt-3 max-w-sm font-serif text-[clamp(1.9rem,4vw,2.8rem)] leading-[1.12] tracking-[-0.035em]">A simple beginning, step by step.</h2>
          <p className="mt-4 max-w-xs text-[13px] leading-6 text-[#766b60]">No account is needed to apply. Application review comes before seller access.</p>
        </div>
        <ol className="divide-y divide-[#d7cfc2] border-t border-[#d7cfc2]">
          {items.map(([title,detail],index) => (
            <li key={title} className="flex gap-4 py-5 sm:gap-6">
              <span className="w-8 shrink-0 font-serif text-[22px] italic text-[#947050]">{String(index+1).padStart(2,'0')}</span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-[#393129]">{title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#74685e]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SellerFaq() {
  const questions = [
    { q: 'How does the six-month free trial work?', a: SELLER_TRIAL_MESSAGE },
    { q: 'Do I need to create an account first?', a: 'No. Apply first if you like. Before activation, you will need to register and verify an account using the same email address.' },
    { q: 'Can sellers join from anywhere in India?', a: 'Yes. Sellers across India can apply. Each seller chooses pickup and delivery coverage; shipping to every PIN code is not guaranteed.' },
    { q: 'What about food and home bakes?', a: 'Home bakers must provide current FSSAI registration or licence details for review before listing food products.' },
    { q: 'Is seller approval automatic?', a: 'No. TreatStory reviews each application before granting seller access.' },
  ];
  return (
    <section aria-labelledby="seller-faq-heading" className="mt-16 border-t border-[#ded6c9] pt-9 sm:mt-20 sm:pt-12">
      <div className="grid gap-8 md:grid-cols-[0.75fr_1.25fr] md:gap-14">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#927350]">Before you begin</p>
          <h2 id="seller-faq-heading" className="mt-3 font-serif text-[clamp(2rem,4vw,2.8rem)] leading-[1.12]">Questions, answered.</h2>
        </div>
        <div className="divide-y divide-[#ded6c9] border-t border-[#ded6c9]">
          {questions.map(({q,a}) => (
            <details key={q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[14px] font-medium text-[#3d3329] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#927350] [&::-webkit-details-marker]:hidden">
                {q} <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#967655] transition-transform group-open:rotate-180"/>
              </summary>
              <p className="max-w-lg pb-5 pr-8 text-[13px] leading-7 text-[#7b6e61]">{a}</p>
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

  const [businessName,setBusinessName] = useState('');
  const [businessCategory,setBusinessCategory] = useState<SellerCategory>('home-bakery');
  const [businessCity,setBusinessCity] = useState('');
  const [businessState,setBusinessState] = useState('');
  const [contactEmail,setContactEmail] = useState('');
  const [contactPhone,setContactPhone] = useState('');
  const [description,setDescription] = useState('');
  const [step,setStep] = useState<ApplicationStep>(1);
  const [submitted,setSubmitted] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const [applicationVisible,setApplicationVisible] = useState(false);
  const stepHeading=useRef<HTMLHeadingElement>(null);
  const firstStep=useRef(true);

  useEffect(() => { if(user?.email) setContactEmail(value => value || user.email || ''); }, [user?.email]);

  useEffect(() => {
    const target=document.getElementById('seller-application');
    if(!target || typeof IntersectionObserver === 'undefined') return;
    const observer=new IntersectionObserver(([entry]) => setApplicationVisible(entry.isIntersecting),{threshold:0.05});
    observer.observe(target);
    return () => observer.disconnect();
  },[]);

  useEffect(() => {
    if(firstStep.current){firstStep.current=false;return;}
    stepHeading.current?.focus();
    stepHeading.current?.scrollIntoView({behavior:'smooth',block:'start'});
  },[step]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(submitting || seller || (user && (isRoleLoading || roleError)))return;
    if(step !== 3) {
      setStep(current => (current + 1) as ApplicationStep);
      return;
    }
    const website=new FormData(event.currentTarget).get('website') || '';
    setSubmitting(true);
    try{
      const response=await fetch('/api/seller-applications',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(user ? {Authorization:'Bearer ' + await user.getIdToken()} : {}),
        },
        body:JSON.stringify({
          businessName:businessName.trim(),businessCategory,
          businessCity:businessCity.trim(),businessState:businessState.trim(),
          contactEmail:contactEmail.trim(),contactPhone:contactPhone.trim(),
          description:description.trim(),website,
        }),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Application could not be submitted.');
      setSubmitted(true);
      toast({title:'Application submitted',description:'Your request is awaiting review.'});
    }catch(error){
      toast(errorToast(error,'seller-application'));
    }finally{setSubmitting(false);}
  }

  const fieldClass='min-h-12 w-full min-w-0 rounded-[12px] border-[#dfd6c8] bg-[#fffefa] text-base text-[#373027] placeholder:text-[#a69b8d] focus-visible:ring-[#9e805d] sm:text-sm';

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fbfaf7] text-[#302c26]">
      <Header />
      <main className="section-shell mx-auto max-w-[1280px] pb-44 pt-0 sm:pb-24 sm:pt-8">
        <CreatorHero/>
        <SellerBenefits/>
        <HowItWorks/>
        <section id="seller-application" aria-labelledby="seller-application-heading" className="mt-16 scroll-mt-28 sm:mt-24">
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#927350]">Start creating your shop</p>
              <h2 id="seller-application-heading" className="mt-3 max-w-sm font-serif text-[clamp(2rem,4vw,3.3rem)] leading-[1.13] tracking-[-0.04em]">Let us meet the maker.</h2>
              <p className="mt-4 max-w-sm text-[13px] leading-7 text-[#7b7064]">Three short steps, and your application is ready for review. Nothing is published automatically.</p>
              <div className="mt-7 flex max-w-sm items-start gap-3 border-t border-[#ded6c9] pt-5 text-[12px] leading-6 text-[#76685a]">
                <ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#95734e]"/>
                <p>Six months free from approval, with no automatic charge or renewal. Continue only if you are satisfied.</p>
              </div>
            </div>
            {isUserLoading || (user && isRoleLoading) ? (
              <div role="status" aria-live="polite" className="flex min-h-32 items-center gap-3 text-sm text-[#706456]">
                <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#d8c7b2] border-t-[#70533c]"/>Checking your account…
              </div>
            ) : seller ? (
              <section role="status" className="min-w-0 border-t border-[#ded6c9] pt-7">
                <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-[#688259]"/>
                <h3 className="mt-5 font-serif text-[30px]">Your creator space is ready.</h3>
                <p className="mt-3 max-w-md text-[13px] leading-7 text-[#6d6a5e]">Your seller account is active. Head to your dashboard to manage products, orders and store settings.</p>
                <Link href="/seller/dashboard" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#282c27] px-6 text-sm font-semibold text-white">Open seller dashboard <ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>
              </section>
            ) : roleError ? (
              <section role="alert" className="max-w-lg border-t border-[#ded6c9] pt-7 text-sm leading-7 text-[#75502d]">
                We couldn’t check your seller access right now. Refresh this page or contact support if the issue continues.
              </section>
            ) : submitted ? (
              <section role="status" className="min-w-0 border-t border-[#ded6c9] pt-7">
                <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-[#688259]"/>
                <h3 className="mt-4 font-serif text-[32px] tracking-[-0.03em]">Your story is on its way.</h3>
                <p className="mt-3 max-w-lg text-[13px] leading-7 text-[#686d5c]">Your application was received. TreatStory will review it and contact you with the details provided.</p>
                {!user && <p className="mt-4 max-w-lg text-sm leading-7 text-[#6e6559]"><Link href="/register?next=%2Fbecome-a-seller" className="font-semibold underline underline-offset-4">Create your account</Link> using the same email and verify it before activation. <Link href="/login?next=%2Fbecome-a-seller" className="underline underline-offset-4">Already registered? Sign in.</Link></p>}
                <Link href="/" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#4a5840] underline underline-offset-4">Return to TreatStory <ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>
              </section>
            ) : (
              <div className="min-w-0 sm:rounded-[24px] sm:border sm:border-[#e5ddd0] sm:bg-white sm:px-8 sm:py-8 lg:px-10">
                <ol aria-label="Application progress" className="grid grid-cols-3 gap-2 sm:gap-3">
                  {steps.map((label,index)=>{
                    const current=(index+1) as ApplicationStep;
                    const active=step===current;
                    const done=step>current;
                    return <li key={label} aria-current={active?'step':undefined} className="min-w-0">
                      <div className={'h-1 rounded-full '+(active||done?'bg-[#796046]':'bg-[#e6dfd4]')}/>
                      <span className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold sm:text-xs">
                        <span aria-hidden="true" className={'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] '+(active||done?'bg-[#2a3129] text-white':'bg-[#eee8df] text-[#8c8173]')}>{done?<Check className="h-3.5 w-3.5"/>:current}</span>
                        <span className={'min-w-0 truncate '+(active?'text-[#292e28]':'text-[#8c8173]')}>{label}</span>
                      </span>
                    </li>;
                  })}
                </ol>
                <div className="mt-9 border-b border-[#e7dfd4] pb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#927350]" aria-live="polite">Step {step} of 3</p>
                  <h3 ref={stepHeading} tabIndex={-1} className="mt-2 scroll-mt-28 text-[24px] font-semibold tracking-[-0.03em] outline-none sm:text-[27px]">
                    {step===1?'What do you create?':step===2?'How can we reach you?':'Tell us your story.'}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#81776b]">
                    {step===1?'A few details about your business.':step===2?'We’ll only use these to contact you about your application.':'What makes the work you create special?'}
                  </p>
                </div>
                <form onSubmit={submit} className="mt-7 space-y-5">
                  <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"/>
                  {step===1 && <>
                    <div className="space-y-2"><Label htmlFor="businessName">Business or studio name</Label>
                      <Input id="businessName" required minLength={2} maxLength={120} value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder="e.g. Little Bloom Bakery" className={fieldClass} disabled={submitting}/></div>
                    <div className="space-y-2"><Label htmlFor="businessCategory">What do you make?</Label>
                      <Select value={businessCategory} onValueChange={v=>setBusinessCategory(v as SellerCategory)} disabled={submitting}>
                        <SelectTrigger id="businessCategory" className={fieldClass}><SelectValue/></SelectTrigger>
                        <SelectContent position="popper" sideOffset={6} className="max-w-[calc(100vw-2rem)]">
                          {categories.map(category=><SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                        </SelectContent>
                      </Select></div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="min-w-0 space-y-2"><Label htmlFor="businessCity">City or town</Label>
                        <Input id="businessCity" required minLength={2} maxLength={80} value={businessCity} onChange={e=>setBusinessCity(e.target.value)} placeholder="e.g. Pune" className={fieldClass} disabled={submitting}/></div>
                      <div className="min-w-0 space-y-2"><Label htmlFor="businessState">State or union territory</Label>
                        <Input id="businessState" required minLength={2} maxLength={80} value={businessState} onChange={e=>setBusinessState(e.target.value)} placeholder="e.g. Maharashtra" className={fieldClass} disabled={submitting}/></div>
                    </div>
                  </>}
                  {step===2 && <>
                    <div className="space-y-2"><Label htmlFor="contactEmail">Contact email</Label>
                      <Input id="contactEmail" type="email" required maxLength={254} value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="you@example.com" className={fieldClass} disabled={submitting}/></div>
                    <div className="space-y-2"><Label htmlFor="contactPhone">Contact number</Label>
                      <Input id="contactPhone" type="tel" required minLength={5} maxLength={40} value={contactPhone} onChange={e=>setContactPhone(e.target.value)} placeholder="Mobile number" className={fieldClass} disabled={submitting}/></div>
                    <div className="flex items-start gap-2 bg-[#f1ede6] px-4 py-3 text-[12px] leading-6 text-[#70675c]">
                      <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#927350]"/>
                      Your information is reviewed before any seller account is activated.
                    </div>
                  </>}
                  {step===3 && <>
                    <div className="space-y-2"><Label htmlFor="description">A little about your work</Label>
                      <Textarea id="description" required minLength={1} maxLength={2000} rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Tell us what you love to make, and what makes your creations special…" className={fieldClass+' min-h-[140px] resize-y'} disabled={submitting}/>
                      <p className="text-xs leading-6 text-[#867c70]">Home bakers need to provide FSSAI registration or licence details for review in Store Settings before publishing food listings.</p></div>
                    <div className="bg-[#f1ede6] px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d6d4c]">Review your details</p>
                      <dl className="mt-3 grid gap-x-4 gap-y-3 text-[12px] sm:grid-cols-2">
                        <div className="min-w-0"><dt className="text-[#87786a]">Studio</dt><dd className="mt-1 break-words font-semibold">{businessName}</dd></div>
                        <div className="min-w-0"><dt className="text-[#87786a]">Category</dt><dd className="mt-1 break-words font-semibold">{categories.find(c=>c.value===businessCategory)?.label}</dd></div>
                        <div className="min-w-0"><dt className="text-[#87786a]">Location</dt><dd className="mt-1 break-words font-semibold">{businessCity}, {businessState}</dd></div>
                        <div className="min-w-0"><dt className="text-[#87786a]">Contact</dt><dd className="mt-1 break-all font-semibold">{contactEmail}</dd></div>
                      </dl>
                    </div>
                  </>}
                  <div className="flex flex-col-reverse gap-3 border-t border-[#e7dfd4] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    {step>1?<button type="button" onClick={()=>setStep(current=>(current-1) as ApplicationStep)} disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#dcd1c2] px-5 text-[13px] font-semibold text-[#54493f] hover:bg-[#f6f2eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#937451]"><ArrowLeft aria-hidden="true" className="h-4 w-4"/>Back</button>:
                      <p className="text-[11px] text-[#8c7e70]">A few details to get started.</p>}
                    <Button type="submit" disabled={submitting} className="min-h-12 w-full rounded-full bg-[#293029] px-6 text-sm font-semibold text-white hover:bg-[#485648] sm:w-auto">
                      {step===3?(submitting?'Sending application…':'Send application'):'Continue'}
                      {!submitting&&<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4"/>}
                    </Button>
                  </div>
                  {step===3&&<p className="text-[12px] leading-6 text-[#827568]">No account is needed to apply. Register and verify the same email before activation. Approval is subject to review.</p>}
                </form>
              </div>
            )}
          </div>
        </section>
        <SellerFaq/>
        <footer className="mt-16 border-t border-[#ded6c9] pt-6 text-center text-[11px] text-[#938575]">For makers, by people who believe in handmade stories. <Link href="/support" className="font-semibold underline underline-offset-4">Questions? Contact us.</Link></footer>
      </main>
      {!submitted&&!seller&&!roleError&&!applicationVisible&&!isUserLoading&&(
        <a href="#seller-application" aria-label="Apply to sell on TreatStory" className="fixed inset-x-4 z-30 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#293029] px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(24,28,22,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c7658] md:hidden"
          style={{bottom:'calc(90px + env(safe-area-inset-bottom))'}}>Apply to sell <ArrowRight aria-hidden="true" className="h-4 w-4"/></a>
      )}
    </div>
  );
}
