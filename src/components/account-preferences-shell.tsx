'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Header } from '@/components/header';
import { useUser } from '@/firebase';

type Props = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
};

/** Shared account authorization and page framing; no duplicate profile dashboard.
 * Navigation back through More is handled by the shared inline header trail.
 */
export function AccountPreferencesShell({ eyebrow = 'Account & preferences', title, description, children }: Props) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login?next=' + encodeURIComponent(pathname));
    }
  }, [isUserLoading, user, router, pathname]);

  return (
    <div className="min-h-screen bg-[#fcfaf6] text-[#302920]">
      <Header />
      <main className="section-shell mx-auto max-w-3xl pb-32 pt-6 sm:pt-12">
        <nav aria-label="Account settings breadcrumb" className="mb-8 hidden items-center gap-2 text-xs text-[#877968] md:flex">
          <Link href="/more" className="transition hover:text-[#3b3026]">More</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          {pathname === '/account/settings'
            ? <span aria-current="page" className="font-semibold text-[#3b3026]">Account settings</span>
            : <>
                <Link href="/account/settings" className="transition hover:text-[#3b3026]">Account settings</Link>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-current="page" className="font-semibold text-[#3b3026]">{title}</span>
              </>}
        </nav>
        <div className="mb-9 border-b border-[#ebe4d9] pb-7 sm:mb-11 sm:pb-9">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a18463]">{eyebrow}</p>
          <h1 className="mt-3 text-[clamp(1.9rem,6.5vw,2.8rem)] font-medium leading-tight tracking-[-0.04em]">{title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#786e63]">{description}</p>
        </div>
        {isUserLoading ? (
          <div role="status" className="space-y-4" aria-label="Loading your account">
            <div className="h-12 animate-pulse rounded-xl bg-[#eee8df]" />
            <div className="h-12 animate-pulse rounded-xl bg-[#eee8df]" />
          </div>
        ) : !user ? (
          <p role="status" className="text-sm text-[#786e63]">Opening sign in…</p>
        ) : children}
      </main>
    </div>
  );
}
