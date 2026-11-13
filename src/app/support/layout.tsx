import type { ReactNode } from 'react';
import LegacySupportPage from '@/components/support-legacy-page';

/** Both rollout switches default off. Infrastructure and independent review
 * must be complete before enabling the replacement; never revive the pilot. */
export default function SupportLayout({ children }: { children: ReactNode }) {
  return process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' && process.env.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true'
    ? children
    : <LegacySupportPage />;
}
