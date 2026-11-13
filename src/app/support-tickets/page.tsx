'use client';
import { useAccountRole } from '@/firebase';
import LegacySupportPage from '@/components/support-legacy-page';
import { SupportLegacyInbox } from '@/components/admin/support-legacy-inbox';
export default function HistoricalSupportTickets() {
  const { role, isRoleLoading, roleError } = useAccountRole();
  if (isRoleLoading) return <p role="status" className="p-6">Loading support tickets…</p>;
  if (roleError) return <p role="alert" className="p-6">Unable to verify support access.</p>;
  return role === 'admin' ? <SupportLegacyInbox /> : <LegacySupportPage />;
}
