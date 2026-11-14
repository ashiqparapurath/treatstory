'use client';
import { SellerCompliance } from '@/components/seller-compliance';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { requestSellerMail } from '@/lib/account-mail';
import { errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { SellerApplication } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function SellerApplications() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const applicationsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'seller_applications') : null, [firestore]);
  const { data: applications, isLoading, error: loadError, retry: retryLoad, hasMore, loadingMore, loadMore } = usePagedCollection<SellerApplication>(applicationsQuery);

  const [working, setWorking] = useState<string | null>(null);

  async function review(application: SellerApplication, approved: boolean) {
    if (!firestore || !user || working) return;
    setWorking(application.id);
    try {
      const response = await fetch('/api/seller-applications', {method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({id:application.id,approved})});
      const result = await response.json();
      if(!response.ok)throw new Error(result.error || 'Review failed.');
      toast({ title: approved ? 'Seller approved' : 'Application rejected' });
      try{await requestSellerMail(user,'application',application.id);}catch{toast({title:'Review saved; email update delayed',description:'The application status is saved. The email update could not be queued.'});}
    } catch(error) {
      toast(errorToast(error,'seller-application'));
    } finally {
      setWorking(null);
    }
  }

  const pending = (applications || []).filter(item => item.status === 'pending');
  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Creator onboarding</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">Applications awaiting review</h2><p className="mt-1 text-xs text-[#817568]">Review new businesses before granting marketplace access.</p></div>
        <p className="text-xs text-muted-foreground">Six calendar months free · No automatic renewal</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading applications…</p> :
        pending.length === 0 ? <p className="rounded-2xl border border-[#e6dfd5] bg-white p-8 text-sm text-muted-foreground">No pending seller applications.</p> :
        <div className="grid gap-3">
          {pending.map(application => (
            <article key={application.id} className="rounded-2xl border border-[#e6dfd5] bg-white p-5 transition hover:border-[#bba48a] sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{application.businessName}</h3>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{application.businessCategory}</p>
                  <p className="text-sm text-muted-foreground">{application.description}</p>
                  <p className="text-sm">{application.contactEmail} · {application.contactPhone}</p>
                  {!application.ownerUid && <p className="text-xs font-medium text-amber-800">Guest application · Applicant must register and verify this email before approval</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" className="h-10 rounded-xl" disabled={working !== null} onClick={() => review(application, false)}>Reject</Button>
                  <Button className="h-10 rounded-xl bg-[#29251f] text-white" disabled={working !== null} onClick={() => review(application, true)}>{working === application.id ? 'Saving…' : 'Approve trial'}</Button>
                </div>
              </div>
            </article>
          ))}
        </div>}
    <SellerCompliance admin/>
    <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>
    </section>
  );
}
