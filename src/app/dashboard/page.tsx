'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccountRole, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { SectionSkeleton } from '@/components/loading-states';

export default function DashboardRouter() {
  const { user, isUserLoading } = useUser();
  const { role, roleError, isRoleLoading } = useAccountRole();
  const router = useRouter();

  useEffect(() => {
    if (isUserLoading || isRoleLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (roleError || !role) return;
    router.replace(role === 'admin' ? '/admin' : role === 'seller' ? '/seller/dashboard' : '/account');
  }, [user, isUserLoading, role, roleError, isRoleLoading, router]);

  return <div className="min-h-screen bg-[#f7f5f1]"><Header />
    <main className="section-shell py-10">
      <h1 className="text-2xl font-medium">Opening your workspace</h1>
      {roleError ? <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-white p-5 text-sm">
        We couldn’t verify your account access. Please refresh or contact support. Your account role has not been changed.
      </div> : <SectionSkeleton />}
    </main>
  </div>;
}
