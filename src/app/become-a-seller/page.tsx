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
      <main className="section-shell mx-auto max-w-6xl pb-28 pt-5 sm:pt-10">
        <section aria-labelledby="seller-page-heading" className="relative overflow-hidden rounded-none bg-transparent sm:rounded-[34px] sm:bg-[#ede4d8]">
          <div className="pointer-events-none absolute -right-20 -top-44 hidden h-96 w-96 rounded-full bg-[#fff7ea]/80 blur-3xl sm:block" aria-hidden="true" />
          <div className="relative grid items-center gap-8 px-0 py-3 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:px-14 lg:py-16">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.21em] text-[#8d704e]">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                TreatStory for creators
              </p>
              <h1 id="seller-page-heading" className="mt-5 max-w-2xl text-[clamp(2.25rem,6vw,4.2rem)] font-medium leading-[1.07] tracking-[-0.052em] text-[#30281f]">
                Made by you.<br />
                <span className="font-serif italic font-normal text-[#997957]">Discovered by more.</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-[#655a4e] sm:text-base sm:leading-8">
                Your talent deserves to be seen. Bring your home bakes, art or handmade creations to a marketplace built around independent makers in Kerala.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <a href="#seller-application" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white transition hover:bg-[#4b4033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#71583b]">
                  Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="#how-it-works" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#594c3e] underline decoration-[#aa906f] underline-offset-4 transition hover:text-[#30291f]">
                  How it works
                </a>
              </div>
              <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-[#827362]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#897152]" aria-hidden="true" />
                Seller access is reviewed before activation.
              </p>
              <div aria-label="Marketplace creator categories" className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                {['Home bakes', 'Art', 'Handmade'].map((category, index) => (
                  <span key={category} className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wide text-[#806b52]">
                    {index > 0 && <span aria-hidden="true" className="text-[#b8a48a]">·</span>}{category}
                  </span>
                ))}
              </div>
            </div>

            <div aria-label="Creators featured at TreatStory" className="hidden min-w-0 rounded-[23px] border border-white/60 bg-[#fffaf3]/85 p-5 shadow-[0_20px_50px_rgba(88,66,43,0.08)] sm:block sm:p-7">
              <div className="flex items-center justify-between gap-3 border-b border-[#e8ded0] pb-4">
                <span className="font-serif text-2xl tracking-[-0.04em] text-[#40352a]">TreatStory<span className="text-[#b69a74]">.</span></span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a856d]">Creator community</span>
              </div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.17em] text-[#998166]">A place for what you make</p>
              <div className="mt-3 space-y-1">
                {[
                  { icon: ShoppingBag, title: 'Home bakes', description: 'Made with care, shared with joy' },
                  { icon: Palette, title: 'Art & illustrations', description: 'Creative ideas brought to life' },
                  { icon: Store, title: 'Handmade crafts', description: 'Thoughtful pieces, lovingly made' },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex items-center gap-3 border-b border-[#eee5d9] py-3 last:border-b-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0e5d6] text-[#8a6b48]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#3e3429]">{title}</span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-[#897d6d]">{description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#b09b83]" aria-hidden="true" />
                  </div>
                ))}
              </div>
              <p className="mt-4 font-serif text-base italic text-[#937a5e]">Little finds. Lovely stories.</p>
            </div>
          </div>
        </section>

        <section id="seller-application" aria-label="Seller application" className="scroll-mt-28 mt-8 border-t border-[#ece4d9] pt-7 sm:mt-10 sm:border-0 sm:pt-0">
          {isUserLoading || (user && isRoleLoading) ? (
            <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 text-sm text-[#746958]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d8c9b6] border-t-[#65513a]" aria-hidden="true" />
              Checking your account…
            </div>
          ) : seller ? (
            <section role="status" className="space-y-4 bg-transparent px-0 py-2 sm:rounded-[24px] sm:bg-[#f0f3ea] sm:p-9">
              <CheckCircle2 className="h-7 w-7 text-[#648056]" aria-hidden="true" />
              <h2 className="text-2xl font-medium">Your seller space is ready.</h2>
              <p className="max-w-xl text-sm leading-7 text-[#67735d]">You already have seller access. Open your dashboard to manage your creations, store and orders.</p>
              <Link href="/seller/dashboard" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white">
                Open seller dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : roleError ? (
            <section role="alert" className="bg-transparent px-0 py-2 text-sm leading-7 text-amber-950 sm:rounded-[24px] sm:bg-amber-50 sm:p-6">
              We couldn’t check your seller account access right now. Refresh this page or contact support if the problem continues.
            </section>
          ) : !user ? (
            <section aria-labelledby="seller-account-heading" className="grid min-w-0 gap-5 bg-transparent px-0 py-0 sm:gap-7 sm:rounded-[30px] sm:bg-[#f6f1e9] sm:px-9 sm:py-10 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#967854]">Your first step</p>
                <h2 id="seller-account-heading" className="mt-2 text-2xl font-medium leading-tight tracking-tight sm:text-[28px]">Ready to make your creations discoverable?</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#73685b]">
                  Start with a free TreatStory account. We’ll keep your application, review updates and future seller access connected to your profile.
                </p>
                <p className="mt-2 text-xs leading-6 text-[#897e70]">Applying is a request for review—not an automatic seller approval.</p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row md:w-64 md:shrink-0 md:flex-col">
                <Link href="/register?next=%2Fbecome-a-seller" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#30291f] px-5 text-sm font-semibold text-white transition hover:bg-[#554737]">
                  Create account <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link href="/login?next=%2Fbecome-a-seller" className="inline-flex min-h-12 w-full items-center justify-center whitespace-nowrap bg-transparent px-2 text-sm font-semibold text-[#433629] underline decoration-[#c5ae91] underline-offset-4 transition hover:text-[#70583d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f805a] sm:rounded-full sm:bg-white/75 sm:px-4 sm:no-underline sm:hover:bg-white">
                  I already have an account
                </Link>
              </div>
            </section>
          ) : !user.displayName?.trim() ? (
            <section className="bg-transparent p-0 sm:rounded-[26px] sm:bg-[#f3ede4] sm:p-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#967854]">Almost ready</p>
              <h2 className="mt-2 text-2xl font-medium">Add your name to your profile.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#73685b]">Your name helps us identify your application. Once your profile is complete, you can return here to share your business details.</p>
              <Link href="/account?next=%2Fbecome-a-seller" className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#30291f] px-6 text-sm font-semibold text-white">
                Complete profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          ) : submitted ? (
            <section role="status" className="bg-transparent p-0 sm:rounded-[26px] sm:bg-[#edf2e9] sm:p-9">
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
              <form onSubmit={submit} className="mt-7 space-y-6 bg-transparent p-0 shadow-none sm:mt-8 sm:rounded-[24px] sm:bg-white sm:p-9 sm:shadow-[0_8px_32px_rgba(55,42,28,0.035)]">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business / studio name</Label>
                  <Input id="businessName" required minLength={2} maxLength={120} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Little Bloom Bakery" className="min-h-12 bg-white" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessCategory">What do you create?</Label>
                  <select id="businessCategory" value={businessCategory} onChange={e => setBusinessCategory(e.target.value as SellerCategory)} className="min-h-12 w-full rounded-[14px] border-[#e4dbd0] bg-[#fffdfa] px-4 text-base text-[#352c23] sm:text-sm">
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
        </section>

        <section aria-label="Benefits for creators" className="mt-12 sm:mt-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#a0835d]">Made for independent creators</p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-[#312a22] sm:text-3xl">Your creativity. Our marketplace.</h2>
            </div>
            <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-[#ab987e] sm:block">Home bakes · Art · Crafts</span>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-7">
            {[
              { icon: Store, title: 'Your own storefront', description: 'Present your products, photos and prices in one dedicated space.' },
              { icon: ShoppingBag, title: 'A clearer way to manage orders', description: 'View incoming orders and keep track of each customer request.' },
              { icon: Palette, title: 'A home for handmade work', description: 'Share the details that make your baking, artwork and crafts unique.' },
            ].map(({ icon: Icon, title, description }) => (
              <div key={title} className="group border-0 pt-0 sm:border-t sm:border-[#dcd1c3] sm:pt-5">
                <div className="flex items-start gap-3 sm:block">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-transparent text-[#846748] sm:mb-5 sm:h-11 sm:w-11 sm:rounded-xl sm:bg-[#f0e6d9]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#352d25]">{title}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-[#786e63]">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-28 mt-14 border-0 pt-0 sm:mt-20 sm:border-t sm:border-[#e8dfd3] sm:pt-16">
          <div className="max-w-xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9f805a]">Simple from the start</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] sm:text-3xl">A simple way to get started.</h2>
            <p className="mt-3 text-sm leading-7 text-[#73685b]">The first steps are straightforward, and you can get started at your own pace.</p>
          </div>
          <ol className="mt-8 grid gap-7 sm:grid-cols-3 sm:gap-10">
            {[
              ['01', 'Make your TreatStory account', 'Create a free profile or sign in to continue.'],
              ['02', 'Introduce your business', 'Tell us what you create and how to contact you.'],
              ['03', 'We review your application', 'Seller access is enabled after approval.'],
            ].map(([number, title, description]) => (
              <li key={number} className="flex min-w-0 gap-4 sm:block">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center font-serif text-[18px] italic text-[#9b7f5d] sm:mb-5 sm:h-10 sm:w-10 sm:rounded-full sm:border sm:border-[#d9c7b1] sm:text-[15px]">{number}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#352d25]">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-[#756a5e]">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-12 border-0 pt-0 text-center text-[11px] tracking-wide text-[#9e907f] sm:mt-16 sm:border-t sm:border-[#eee6db] sm:pt-7">Little finds, lovely stories. Made by people like you.</p>
      </main>
    </div>
  );
}
