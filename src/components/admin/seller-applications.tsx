'use client';
import { SellerCompliance } from '@/components/seller-compliance';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { ActionError, errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { SellerApplication } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SELLER_APPROVAL_PLANS, type SellerApprovalPlan } from '@/lib/seller-policy';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function SellerApplications() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const applicationsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'seller_applications') : null, [firestore]);
  const { data: applications, isLoading, error: loadError, retry: retryLoad, hasMore, loadingMore, loadMore } = usePagedCollection<SellerApplication>(applicationsQuery);

  const [working, setWorking] = useState<string | null>(null);
  const [reviewIssues, setReviewIssues] = useState<Record<string,string>>({});
  const [selectedApplication, setSelectedApplication] = useState<SellerApplication | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SellerApprovalPlan | ''>('');

  async function review(application: SellerApplication, approved: boolean, plan?: SellerApprovalPlan) {
    if (!firestore || !user || working) return;
    setWorking(application.id);
    setReviewIssues(current => {const next={...current};delete next[application.id];return next;});
    try {
      const response = await fetch('/api/seller-applications', {method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({id:application.id,approved,...(approved ? { plan } : {})})});
      const result = await response.json();
      if(!response.ok) {
        const message = typeof result?.error === 'string' && result.error.trim() ? result.error : 'Review failed.';
        if(response.status === 409) {
          // These are valid server-side safety checks (unverified email, an already
          // reviewed application, existing seller access, or a changed record).
          // Never retry the mutation automatically.
          setReviewIssues(current => ({...current,[application.id]:message}));
          retryLoad();
          toast({ variant:'destructive', title:'Application needs attention', description:message });
          return;
        }
        throw new ActionError(message,response.status);
      }
      retryLoad();
      if (approved) setSelectedApplication(null);
      toast({
        title: approved ? result.awaitingActivation ? 'Approved — awaiting activation' : 'Seller approved' : 'Application rejected',
        description: approved && result.awaitingActivation ? 'The applicant will receive an email to create or verify an account and activate their profile.' : undefined,
      });
      // The review API writes its email to the outbox in the same transaction;
      // do not issue a second browser-triggered request or send duplicates.
    } catch(error) {
      toast(errorToast(error,'seller-application'));
    } finally {
      setWorking(null);
    }
  }

  const pending = (applications || []).filter(item => item.status === 'pending');
  const awaitingActivation = (applications || []).filter(item => item.status === 'approved' && !item.activatedAt);
  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">Creator onboarding</p><h2 className="mt-1 text-lg font-semibold text-[#29251f]">Applications awaiting review</h2><p className="mt-1 text-xs text-[#817568]">Review new businesses before granting marketplace access.</p></div>
        <p className="text-xs text-muted-foreground">Choose access individually when approving</p>
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
                  {(application.businessCity || application.businessState) && <p className="text-xs text-muted-foreground">Based in {[application.businessCity,application.businessState].filter(Boolean).join(', ')}</p>}
                  <p className="text-sm text-muted-foreground">{application.description}</p>
                  <p className="text-sm">{application.contactEmail} · {application.contactPhone}</p>
                  {!application.ownerUid && <p className="text-xs font-medium text-[#796242]">Guest application · You can approve now; seller access activates after email verification</p>}
                  {reviewIssues[application.id] && <p role="alert" className="max-w-xl break-words rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{reviewIssues[application.id]}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" className="h-10 rounded-xl" disabled={working !== null} onClick={() => review(application, false)}>Reject</Button>
                  <Button className="h-10 rounded-xl bg-[#29251f] text-white" disabled={working !== null} onClick={() => { setSelectedApplication(application); setSelectedPlan(''); }}>{working === application.id ? 'Saving…' : 'Review & approve'}</Button>
                </div>
              </div>
            </article>
          ))}
        </div>}
    {awaitingActivation.length > 0 && <section aria-label="Approved applications awaiting activation" className="space-y-3">
      <h3 className="text-sm font-semibold text-[#3a3026]">Approved — awaiting account activation ({awaitingActivation.length})</h3>
      <p className="text-xs text-muted-foreground">These applicants have been approved, but seller access will only start after they sign in with their verified contact email.</p>
      <div className="grid gap-2">{awaitingActivation.map(application => <div key={application.id} className="rounded-xl border border-[#e6dfd5] bg-white px-4 py-3 text-sm">
        <p className="font-semibold">{application.businessName}</p>
        <p className="mt-1 break-all text-xs text-muted-foreground">{application.contactEmail} · {SELLER_APPROVAL_PLANS.find(plan => plan.value === application.approvalPlan)?.label || 'Approved'}</p>
      </div>)}</div>
    </section>}
    <Dialog open={!!selectedApplication} onOpenChange={open => { if (!open && !working) setSelectedApplication(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve seller application</DialogTitle>
          <DialogDescription>Choose the exact access plan for {selectedApplication?.businessName}. A guest will receive an email invitation and must verify the same email before activation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="seller-approval-plan">Seller access plan</Label>
          <Select value={selectedPlan} onValueChange={value => setSelectedPlan(value as SellerApprovalPlan)} disabled={working !== null}>
            <SelectTrigger id="seller-approval-plan" className="min-h-12 rounded-xl"><SelectValue placeholder="Select a plan before approval"/></SelectTrigger>
            <SelectContent position="popper" sideOffset={6}>{SELLER_APPROVAL_PLANS.map(plan =>
              <SelectItem key={plan.value} value={plan.value}>{plan.label}</SelectItem>
            )}</SelectContent>
          </Select>
          {selectedPlan && <p className="text-xs leading-5 text-[#756856]">{SELLER_APPROVAL_PLANS.find(plan => plan.value === selectedPlan)?.description}</p>}
          <p className="text-xs leading-5 text-muted-foreground">Trial periods begin on account activation, not at review. Full access has no trial cutoff and remains subject to admin controls.</p>
        </div>
        {selectedApplication && reviewIssues[selectedApplication.id] && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{reviewIssues[selectedApplication.id]}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={working !== null} onClick={() => setSelectedApplication(null)}>Cancel</Button>
          <Button type="button" className="min-h-11 rounded-full bg-[#29251f] text-white" disabled={!selectedPlan || working !== null} onClick={() => { if (selectedApplication && selectedPlan) void review(selectedApplication, true, selectedPlan); }}>
            {working ? 'Approving…' : 'Approve application'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SellerCompliance admin/>
    <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>
    </section>
  );
}
