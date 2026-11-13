import type { ReactNode } from 'react';
import LegacySupportPage from '@/components/support-legacy-page';

/**
 * Encrypted chat remains experimental until multi-device enrollment,
 * recovery, and an independent security review are complete.
 * Default to the working ticket system on production and previews.
 */
export default function SupportLayout({ children }: { children: ReactNode }) {
  return process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true'
    ? children
    : <LegacySupportPage />;
}
