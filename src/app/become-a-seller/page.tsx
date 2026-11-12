'use client';
import { requestSellerMail } from '@/lib/account-mail';
import { errorToast } from '@/lib/user-notices';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Header } from '@/components/header';
import { useAccountRole, useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { SellerCategory } from '@/lib/marketplace-types';
import { ArrowRight, CheckCircle2, Palette, Store, ShoppingBag, Sparkles } from 'lucide-react';

const categories: { value: SellerCategory; label: string }[] = [
  { value: 'home-bakery', label: 'Home bakery' },
  { value: 'art', label: 'Art and paintings' },
  { value: 'handmade', label: 'Handmade crafts and gifts' },
  { value: 'other', label: 'Other creative business' },
];

export default function BecomeSellerPage() {
  const { user, isUserLoading } = useUser();
  const { seller, isRoleLoading, roleError } = useAccountRole();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState<SellerCategory>('home-bakery');
  const [contactEmail, setContactEmail] = useState('');
  useEffect(() => { if (user?.email) setContactEmail(v => v || user.email || ''); }, [user?.email]);
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firestore || !user || !user.displayName?.trim() || !user.email || submitting || seller || isRoleLoading || roleError) return;
    setSubmitting(true);
    try {
      await setDoc(doc(firestore, 'seller_applications', user.uid), {
        ownerUid: user.uid,
        businessName: businessName.trim(),
        businessCategory,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        description: description.trim(),
        status: 'pending',
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
      try{await requestSellerMail(user,'application',user.uid);}catch{toast({title:'Application saved; email update delayed',description:'Track your application here. You do not need to submit it again.'});}
      toast({ title: 'Application submitted', description: 'Your request is awaiting review.' });
    } catch(error) {toast(errorToast(error,'seller-application'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fcfaf6] text-[#30291f]">
      <Header />
      <main className="section-shell mx-auto max-w-5xl pb-28 pt-7 sm:pt-12">
        <div className="relative overflow-hidden rounded-[28px] bg-[#eee7db] px-6 py-9 sm:rounded-[32px] sm:px-10 sm:py-12 lg:px-14">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#f9f3e8]/80 blur-2xl" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.19em] text-[#8b6d4a]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> For independent Kerala creators
            </p>
            <h1 className="mt-5 max-w-2xl text-[clamp(2.2rem,7vw,4.25rem)] font-medium leading-[1.06] tracking-[-0.045em]">
              Made by you.<br />
              <span className="font-serif italic font-normal text-[#9f805a]">Discovered by more.</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#6d6051] sm:text-base sm:leading-8">
              Turn your home bakery, artwork or handmade creations into a storefront on TreatStory.
              Meet customers who appreciate the care behind what you make.
            </p>
            <a href="#how-it-works" className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#4c3f2e] underline decoration-[#b69d7e] underline-offset-4">
              See how it works <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <section aria-label="Benefits for creators" className="mt-8 grid gap-6 border-b border-[#e7dfd3] pb-8 sm:mt-10 sm:grid-cols-3 sm:gap-8">
          {[
            { icon: Store, title: 'A storefront for your work', description: 'Showcase creations with product photos, details and prices.' },
            { icon: ShoppingBag, title: 'Orders in one place', description: 'Keep track of customer orders through your seller dashboard.' },
            { icon: Palette, title: 'Made for independent makers', description: 'A marketplace for the home bakers, artists and crafters of Kerala.' },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3 sm:block">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0e8dd] text-[#8e7351] sm:mb-3">
                <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#342c23]">{title}</h2>
                <p className="mt-1 text-xs leading-6 text-[#7c7165]">{description}</p>
              </div>
            </div>
          ))}
        </section>

        <section id="how-it-works" className="scroll-mt-24 py-9 sm:py-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9f805a]">The next steps</p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">A simple way to get started.</h2>
          <ol className="mt-7 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {[
              ['01', 'Create your account', 'Use your TreatStory profile to keep your application and future seller access together.'],
              ['02', 'Tell us what you create', 'Share your business name, category and a little about your work.'],
              ['03', 'We review your request', 'Our team reviews applications before seller access is activated.'],
            ].map(([number, title, description]) => (
              <li key={number} className="flex gap-4 sm:block">
                <span className="font-serif text-2xl italic text-[#b59b7b]">{number}</span>
                <div>
                  <h3 className="mt-1 text-sm font-semibold text-[#342c23] sm:mt-3">{title}</h3>
                  <p className="mt-1.5 text-xs leading-6 text-[#7a6f63]">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="border-t border-[#e7dfd3] pt-8 sm:pt-10">
          {isUserLoading || (user && isRoleLoading) ? (
            <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 text-sm text-[#746958]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d8c9b6] border-t-[#65513a]" aria-hidden="true" />
              Checking your account…
            </div>
          ) : seller ? (
            <section role="status" className="space-y-4 rounded-[24px] bg-[#f0f3ea] p-6 sm:p-9">
              <CheckCircle2 className="h-7 w-7 text-[#648056]" aria-hidden="true" />
              <h2 className="text-2xl font-medium">Your seller space is ready.</h2>
              <p className="max-w-xl text-sm leading-7 text-[#67735d]">You already have seller access. Open your dashboard to manage your creations, store and orders.</p>
              <Link href="/seller/dashboard" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white">
                Open seller dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : roleError ? (
            <section role="alert" className="rounded-[24px] bg-amber-50 p-6 text-sm leading-7 text-amber-950">
              We couldn’t check your seller account access right now. Refresh this page or contact support if the problem continues.
            </section>
          ) : !user ? (
            <section aria-labelledby="seller-account-heading" className="grid gap-6 rounded-[26px] bg-[#f3ede4] px-5 py-7 sm:px-9 sm:py-9 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#967854]">Your first step</p>
                <h2 id="seller-account-heading" className="mt-2 text-2xl font-medium leading-tight tracking-tight sm:text-[28px]">Let’s get your creator journey started.</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#73685b]">
                  Create a free TreatStory profile, or sign in if you already have one. It helps us connect your application to the right account and keep you updated on the review.
                </p>
                <p className="mt-2 text-xs leading-6 text-[#897e70]">Applying is a request for review—not an automatic seller approval.</p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row md:w-64 md:shrink-0 md:flex-col">
                <Link href="/register?next=%2Fbecome-a-seller" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#30291f] px-5 text-sm font-semibold text-white transition hover:bg-[#554737]">
                  Create account <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link href="/login?next=%2Fbecome-a-seller" className="inline-flex min-h-12 w-full items-center justify-center whitespace-nowrap rounded-full bg-white/75 px-4 text-sm font-semibold text-[#433629] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a]">
                  I already have an account
                </Link>
              </div>
            </section>
          ) : !user.displayName?.trim() ? (
            <section className="rounded-[26px] bg-[#f3ede4] p-6 sm:p-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#967854]">Almost ready</p>
              <h2 className="mt-2 text-2xl font-medium">Add your name to your profile.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#73685b]">Your name helps us identify your application. Once your profile is complete, you can return here to share your business details.</p>
              <Link href="/account?next=%2Fbecome-a-seller" className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white">
                Complete profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : submitted ? (
            <section role="status" className="rounded-[26px] bg-[#edf2e9] p-6 sm:p-9">
              <CheckCircle2 className="h-8 w-8 text-[#688259]" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-medium">Your story is on its way.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#617459]">We've received your application. We'll review the details and contact you using your TreatStory account email.</p>
              <Link href="/" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#455b3d] underline underline-offset-4">
                Back to TreatStory <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : (
            <section aria-labelledby="seller-form-heading" className="max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#9f805a]">Your application</p>
              <h2 id="seller-form-heading" className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Tell us about your creations.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#73685b]">A few details about your business will help us understand what you make. Your application will be reviewed before you can start selling.</p>
              <form onSubmit={submit} className="mt-8 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business / studio name</Label>
                  <Input id="businessName" required minLength={2} maxLength={120} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Little Bloom Bakery" className="min-h-12 bg-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessCategory">What do you create?</Label>
                  <select id="businessCategory" value={businessCategory} onChange={e => setBusinessCategory(e.target.value as SellerCategory)} className="flex min-h-12 w-full rounded-md border border-input bg-white px-3 text-sm">
                    {categories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                  </select>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="contactEmail">Contact email</Label><Input id="contactEmail" type="email" required maxLength={254} value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="min-h-12 bg-white"/></div>
                  <div className="space-y-2"><Label htmlFor="contactPhone">Contact number</Label><Input id="contactPhone" type="tel" required maxLength={40} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="A number we can reach" className="min-h-12 bg-white"/></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">A little about your work</Label>
                  <Textarea id="description" required maxLength={2000} rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="What do you make, and what makes your creations special?" className="bg-white" />
                  <p className="text-xs leading-5 text-[#8d8174]">Tell us your story in your own words.</p>
                </div>
                <Button type="submit" className="min-h-12 w-full rounded-full bg-[#30291f] text-white hover:bg-[#554737] sm:w-auto sm:px-9" disabled={submitting || !firestore}>
                  {submitting ? 'Sending your application…' : 'Send seller application'}
                </Button>
                <p className="max-w-xl text-xs leading-6 text-[#8d8174]">Your request is linked to your signed-in TreatStory profile. Approval is not automatic.</p>
              </form>
            </section>
          )}
        </div>
        <p className="mt-9 text-center text-[11px] tracking-wide text-[#aa9b89]">Little finds, lovely stories. Made by people like you.</p>
      </main>
    </div>
  );
}
