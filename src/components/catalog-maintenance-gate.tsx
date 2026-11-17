'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { doc } from 'firebase/firestore';
import { Construction } from 'lucide-react';
import { Header } from '@/components/header';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';

type CatalogSettings = { maintenanceEnabled?: boolean; maintenanceMessage?: string };
const defaultMessage = 'We are making a few improvements to the collection. Please check back soon.';

/** Presentation-only catalog guard: this does not block product URLs or checkout. */
export function CatalogMaintenanceGate({ children, standalone = false }: { children: ReactNode; standalone?: boolean }) {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'catalog') : null, [db]);
  const { data, isLoading, error } = useDoc<CatalogSettings>(settingsRef);
  const loading = !db || isLoading;
  // Wait for the initial status so maintenance never flashes catalog content.
  // If Firebase rules have not yet been deployed or the read fails, keep normal
  // browsing available: this is a display-only flag, not an access barrier.
  if (!loading && (error || data?.maintenanceEnabled !== true)) return <>{children}</>;

  const panel = loading ? (
    <div role="status" aria-label="Checking catalog availability" className="mx-auto h-64 w-full max-w-3xl animate-pulse rounded-[28px] bg-[#ece5db]" />
  ) : (
    <section role="status" aria-live="polite" className="mx-auto w-full max-w-3xl rounded-[28px] border border-[#e9dfd1] bg-[#fcfaf7] px-5 py-12 text-center shadow-[0_15px_50px_rgba(60,45,29,0.05)] sm:px-10 sm:py-16">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eee6da] text-[#8a6e4d]">
        <Construction aria-hidden="true" className="h-6 w-6" />
      </span>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b805d]">TreatStory collection</p>
      <h2 className="mt-3 text-3xl font-medium tracking-tight text-[#29251f] sm:text-4xl">
        Under maintenance
      </h2>
      <p className="mx-auto mt-4 max-w-lg whitespace-pre-line break-words text-sm leading-7 text-[#756a5d] sm:text-base">
        {data?.maintenanceMessage?.trim() || defaultMessage}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/support" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8c9b5] px-6 text-xs font-semibold text-[#594b3e] hover:bg-[#f2ebe1]">Contact support</Link>
      </div>
    </section>
  );
  if (standalone) return <div className="min-h-screen bg-[#f8f6f2]"><Header /><main className="section-shell py-12 sm:py-20">{panel}</main></div>;
  return panel;
}
