'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { ActionError, errorToast } from '@/lib/user-notices';
import { Button } from '@/components/ui/button';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
import { SupportTicketThread, type LegacyTicket } from '@/components/support-ticket-thread';
import { Info } from 'lucide-react';

export function SupportLegacyInbox() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  // Query platform tickets separately. Customer-to-seller traffic must never
  // displace new seller-to-admin requests from the 100-ticket admin window.
  const ref = useMemoFirebase(() => db ? query(collection(db, 'support_tickets'), where('route', '==', 'admin'), orderBy('updatedAt', 'desc'), limit(100)) : null, [db]);
  const { data: platformTickets, error: platformError, isLoading: platformLoading, retry: retryPlatform } = useCollection<LegacyTicket>(ref);
  // Older tickets have no route field. Preserve them while upgrading gradually,
  // without reclassifying or exposing buyer-to-seller conversations in the inbox.
  const historicalRef = useMemoFirebase(() => db ? query(collection(db, 'support_tickets'), orderBy('updatedAt', 'desc'), limit(100)) : null, [db]);
  const { data: historical, error: historicalError, isLoading: historicalLoading, retry: retryHistorical } = useCollection<LegacyTicket>(historicalRef);
  const visibleTickets = [...new Map([
    ...(platformTickets ?? []).filter(ticket => ticket.encrypted !== true && ticket.route === 'admin'),
    ...(historical ?? []).filter(ticket => ticket.encrypted !== true && !ticket.route),
  ].map(ticket => [ticket.id, ticket] as const)).values()];
  const error = platformError || historicalError;
  const isLoading = platformLoading || historicalLoading;
  const retry = () => { retryPlatform(); retryHistorical(); };

  async function change(ticketId: string, action: 'reply' | 'close', message?: string) {
    if (!user) throw new Error('Sign in as an administrator to respond.');
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
        body: JSON.stringify({ action, ticketId, ...(action === 'reply' ? { message } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new ActionError(body.error || 'Unable to update the support request.', response.status);
      toast({ title: action === 'close' ? 'Support ticket closed' : 'Reply sent to customer' });
    } catch (cause) {
      toast(errorToast(cause, 'support'));
      throw cause;
    }
  }

  const notice = <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
    <span className="inline-flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Plaintext support tickets · private to the customer and authorized administrators · not end-to-end encrypted</span>
    {error && <Button variant="outline" size="sm" onClick={retry}>Retry loading</Button>}
  </div>;

  return <SupportChatWorkspace
    tickets={visibleTickets}
    title="TreatStory support inbox"
    secure={false}
    backHref="/admin?tab=overview"
    backLabel="Back to admin overview"
    isLoading={isLoading}
    error={!!error}
    topNotice={notice}
    renderConversation={ticket => {
      const selected = visibleTickets.find(item => item.id === ticket.id);
      return selected ? <SupportTicketThread key={selected.id} ticket={selected} perspective="support"
        onSend={(id, text) => change(id, 'reply', text)}
        onClose={id => change(id, 'close')} /> : null;
    }}
  />;
}
