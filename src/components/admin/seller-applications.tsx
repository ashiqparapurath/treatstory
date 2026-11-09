'use client';
import { requestSellerMail } from '@/lib/account-mail';
import { errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { collection, doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { SellerApplication } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function SellerApplications() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const applicationsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'seller_applications') : null, [firestore]);
  const { data: applications, isLoading, error: loadError, retry: retryLoad } = useCollection<SellerApplication>(applicationsQuery);
  const [durationDays, setDurationDays] = useState(30);
  const [working, setWorking] = useState<string | null>(null);

  async function review(application: SellerApplication, approved: boolean) {
    if (!firestore || !user || working) return;
    if (approved && !application.ownerUid) {
      toast({ variant: 'destructive', title: 'Account required for activation', description: 'Contact this applicant and ask them to register before granting seller access.' });
      return;
    }
    setWorking(application.id);
    try {
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'seller_applications', application.id), {
        status: approved ? 'approved' : 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });
      if (approved) {
        const now = Date.now();
        const ends = now + Math.max(1, durationDays) * 24 * 60 * 60 * 1000;
        batch.set(doc(firestore, 'sellers', application.ownerUid), {
          ownerUid: application.ownerUid,
          slug: application.ownerUid,
          businessName: application.businessName,
          businessCategory: application.businessCategory,
          contactEmail: application.contactEmail,
          contactPhone: application.contactPhone,
          description: application.description,
          logoUrl: '',
          coverUrl: '',
          isOpen: true,
          status: 'active',
          accessType: 'trial',
          accessStartsAt: Timestamp.fromMillis(now),
          accessEndsAt: Timestamp.fromMillis(ends),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
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
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-2xl font-semibold">Seller applications</h2><p className="text-sm text-muted-foreground">Review new businesses before granting marketplace access.</p></div>
        <div className="space-y-1"><Label htmlFor="trialDays">Trial duration (days)</Label><Input id="trialDays" className="w-40" type="number" min={1} max={365} value={durationDays} onChange={e => setDurationDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} /></div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading applications…</p> :
        pending.length === 0 ? <p className="rounded-2xl border p-8 text-sm text-muted-foreground">No pending seller applications.</p> :
        <div className="grid gap-4">
          {pending.map(application => (
            <article key={application.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{application.businessName}</h3>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{application.businessCategory}</p>
                  <p className="text-sm text-muted-foreground">{application.description}</p>
                  <p className="text-sm">{application.contactEmail} · {application.contactPhone}</p>
                  {!application.ownerUid && <p className="text-xs font-medium text-amber-800">Guest application · Contact applicant to arrange account registration before approval</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" disabled={working !== null} onClick={() => review(application, false)}>Reject</Button>
                  <Button disabled={!application.ownerUid || working !== null} onClick={() => review(application, true)}>{working === application.id ? 'Saving…' : 'Approve trial'}</Button>
                </div>
              </div>
            </article>
          ))}
        </div>}
    </section>
  );
}
