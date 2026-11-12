'use client';

import { SavedAddressList } from '@/components/default-delivery-address';
import { AccountPreferencesShell } from '@/components/account-preferences-shell';

export default function DeliveryPreferencesPage() {
  return (
    <AccountPreferencesShell title="Delivery addresses" description="Keep your saved locations together and choose the address you want to use by default.">
      <section aria-label="Saved delivery addresses" className="max-w-2xl">
        <SavedAddressList />
      </section>
    </AccountPreferencesShell>
  );
}
