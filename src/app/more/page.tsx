'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut as firebaseSignOut } from 'firebase/auth';
import {
  ArrowUpRight, Bell, BookOpen, ChevronRight, ClipboardList, FileText, Heart,
  HelpCircle, Home, LogIn, LogOut, MapPin, Package, Settings, ShieldCheck,
  ShoppingBag, Store, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import { Header } from '@/components/header';
import { useAuth, useUser, useAccountRole } from '@/firebase';
import { useMobileAttention } from '@/hooks/use-mobile-attention';
import { useToast } from '@/hooks/use-toast';
import { errorToast } from '@/lib/user-notices';
import type { MobileRole } from '@/lib/mobile-navigation';

type MenuLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  attention?: boolean;
};

function MenuSection({ heading, items }: { heading: string; items: MenuLink[] }) {
  if (!items.length) return null;
  return (
    <section aria-label={heading} className="space-y-3">
      <h2 className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a8060]">{heading}</h2>
      <div className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white sm:rounded-3xl">
        {items.map((item, index) => (
          <Link key={item.href} href={item.href}
            className={`group flex min-h-[66px] items-center gap-3 px-4 py-3.5 transition hover:bg-[#faf7f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#9a8060] sm:px-5 ${index ? 'border-t border-[#f0ebe4]' : ''}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f6f2ec] text-[#80684a]">
              <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#302b25]">
                {item.label}
                {item.attention && <span aria-label="Pending activity" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#aa6447]"/>}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#82786c]">{item.description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#aa9c8c] transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Only existing destinations; role-specific options are added after live role verification. */
export function morePageSections(
  role: MobileRole,
  authenticated: boolean,
  attention: { orders: boolean; applications: boolean },
): { account: MenuLink[]; marketplace: MenuLink[]; information: MenuLink[] } {
  const account: MenuLink[] = authenticated
    ? [
      { label: 'Account & personal information', description: 'Profile, email and account details', href: '/account#profile-details', icon: UserRound },
      { label: 'Delivery preferences', description: 'Your saved delivery address', href: '/account#delivery-address', icon: MapPin },
      { label: 'Notifications', description: 'Recent TreatStory updates', href: '/notifications', icon: Bell },
      { label: 'Privacy & account deletion', description: 'Manage your account and privacy', href: '/account#delete-account', icon: ShieldCheck },
    ]
    : [];

  const marketplace: MenuLink[] = [];
  if (role === 'admin' && authenticated) {
    marketplace.push(
      { label: 'Admin dashboard', description: 'Manage the marketplace', href: '/admin', icon: Home, attention: attention.orders || attention.applications },
      { label: 'Seller applications', description: 'Review pending creator requests', href: '/admin?tab=applications', icon: Users, attention: attention.applications },
      { label: 'Marketplace orders', description: 'Review order requests', href: '/admin?tab=orders', icon: Package, attention: attention.orders },
      { label: 'Support inbox', description: 'Manage support requests', href: '/admin?tab=support', icon: HelpCircle },
    );
  } else if (role === 'seller' && authenticated) {
    marketplace.push(
      { label: 'Seller dashboard', description: 'Your creator workspace', href: '/seller/dashboard', icon: Store, attention: attention.orders },
      { label: 'Seller orders', description: 'Review and manage new orders', href: '/seller/dashboard?section=orders', icon: ClipboardList, attention: attention.orders },
      { label: 'My products', description: 'Create and manage your listings', href: '/seller/dashboard?section=products', icon: Package },
      { label: 'Store settings', description: 'Your storefront and delivery options', href: '/seller/dashboard?section=store', icon: Settings },
    );
  } else if (role === 'customer' || !authenticated) {
    marketplace.push({ label: 'Become a seller', description: 'Join TreatStory as a creator', href: '/become-a-seller', icon: Store });
  }

  if (authenticated) {
    marketplace.push(
      { label: 'My purchases', description: 'Track orders you placed', href: '/orders', icon: ShoppingBag },
      { label: 'Saved items', description: 'Your wishlist', href: '/favorites', icon: Heart },
    );
  }

  const information: MenuLink[] = [
    { label: 'Help & contact', description: 'Get assistance from TreatStory', href: '/support', icon: HelpCircle },
    { label: 'Our story', description: 'About TreatStory', href: '/about', icon: BookOpen },
    { label: 'Terms of service', description: 'Marketplace terms and conditions', href: '/terms-of-service', icon: FileText },
    { label: 'Privacy policy', description: 'How information is handled', href: '/privacy-policy', icon: ShieldCheck },
  ];
  return { account, marketplace, information };
}

export default function MorePage() {
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { role, roleError, isRoleLoading } = useAccountRole();
  const attention = useMobileAttention(user?.uid ?? null, role, !!user && !isRoleLoading && !roleError);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const roleReady = !isUserLoading && (!user || (!isRoleLoading && !roleError && !!role));
  const sections = morePageSections(roleReady && user ? role : null, !!user && roleReady, attention);

  async function logout() {
    if (!auth || busy) return;
    setBusy(true);
    try {
      await firebaseSignOut(auth);
      router.replace('/');
      toast({ title: 'Signed out' });
    } catch (error) {
      toast(errorToast(error, 'sign-out'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f6f2]">
      <Header />
      <main className="section-shell mx-auto max-w-3xl space-y-7 pb-32 pt-7 sm:space-y-9 sm:py-12">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#a68a64]">TreatStory</p>
          <h1 className="text-3xl font-medium tracking-tight text-[#29251f] sm:text-4xl">More</h1>
          <p className="max-w-lg text-sm leading-6 text-[#746b60]">Your account, marketplace and helpful links, all in one place.</p>
        </div>

        {user && (isUserLoading || isRoleLoading) &&
          <div role="status" aria-live="polite" className="flex min-h-16 items-center gap-3 rounded-2xl border border-[#e8e0d5] bg-white px-5 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d7c7b3] border-t-[#453a2f]"/> Checking your account access…
          </div>}
        {!user && isUserLoading &&
          <div role="status" className="min-h-16 animate-pulse rounded-2xl bg-[#ede8e0]" aria-label="Loading account"/>}
        {user && roleError && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          We couldn’t verify your account permissions. Sign in again or retry before opening a restricted workspace.
        </div>}

        <MenuSection heading="Account & preferences" items={sections.account} />
        <MenuSection heading="Marketplace" items={sections.marketplace} />
        <MenuSection heading="App & information" items={sections.information} />

        {!isUserLoading && <section aria-label="Account actions" className="space-y-3">
          <h2 className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a8060]">Account actions</h2>
          <div className="rounded-2xl border border-[#e8e0d5] bg-white p-3 sm:rounded-3xl">
            {user ? (
              <button type="button" onClick={() => void logout()} disabled={busy} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#a14b43] transition hover:bg-[#fff4f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a14b43] disabled:opacity-60">
                <LogOut className="h-5 w-5" aria-hidden="true" /> {busy ? 'Signing out…' : 'Sign out'} <ArrowUpRight className="ml-auto h-4 w-4" aria-hidden="true"/>
              </button>
            ) : (
              <Link href="/login?next=%2Fmore" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#453a2f] transition hover:bg-[#f8f4ef]">
                <LogIn className="h-5 w-5" aria-hidden="true" /> Sign in <ArrowUpRight className="ml-auto h-4 w-4" aria-hidden="true"/>
              </Link>
            )}
          </div>
        </section>}
        <p className="pb-3 text-center text-[11px] text-[#a49889]">Little finds, lovely stories.</p>
      </main>
    </div>
  );
}
