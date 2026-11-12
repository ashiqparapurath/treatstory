'use client';

import Link from 'next/link';
import { Bell, ChevronRight, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { AccountPreferencesShell } from '@/components/account-preferences-shell';

const sections = [
  { href: '/account/personal', icon: UserRound, title: 'Personal information', detail: 'Your name, email address and verification' },
  { href: '/account/delivery', icon: MapPin, title: 'Delivery addresses', detail: 'Add, update or choose your default address' },
  { href: '/notifications', icon: Bell, title: 'Notifications', detail: 'Recent order and account updates' },
  { href: '/account/privacy', icon: ShieldCheck, title: 'Privacy & security', detail: 'Understand your data and manage account deletion' },
];

export default function AccountSettingsPage() {
  return (
    <AccountPreferencesShell title="Account settings" description="Choose what you want to manage. Each setting has its own space, so you can focus on one thing at a time.">
      <nav aria-label="Account settings" className="divide-y divide-[#eee7dc]">
        {sections.map(({ href, icon: Icon, title, detail }) => (
          <Link href={href} key={href}
            className="group flex min-h-[78px] items-center gap-4 py-4 transition hover:bg-[#f5f0e9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a68a64] sm:px-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0e9df] text-[#8b6d4a]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[#342c23]">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-[#827568]">{detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a59a8b] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <p className="mt-9 text-xs leading-6 text-[#827568]">Looking for order history or saved products? Find them in More → Marketplace.</p>
    </AccountPreferencesShell>
  );
}
