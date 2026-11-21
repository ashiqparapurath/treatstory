'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccountRole, useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ActionError, errorToast } from '@/lib/user-notices';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
import { SupportTicketThread, type LegacyTicket } from '@/components/support-ticket-thread';
import { Info } from 'lucide-react';

export function SellerMessageInbox() {
  const db = useFirestore();
  const { user } = useUser();
  const { role, roleError, isRoleLoading } = useAccountRole();
  const { toast } = useToast();
  const [requestedQuoteId, setRequestedQuoteId] = useState('');
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const startedQuote = useRef('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('quote') || '';
    setRequestedQuoteId(/^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : '');
    const ticket = params.get('ticket') || '';
    if (/^[A-Za-z0-9_-]{1,160}$/.test(ticket)) setOpenTicketId(ticket);
  }, []);
  useEffect(() => {
    if (!requestedQuoteId || !user || role !== 'seller' || startedQuote.current === requestedQuoteId) return;
    startedQuote.current = requestedQuoteId;
    let active = true;
    setQuoteError('');
    (async () => {
      try {
        const response = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
          body: JSON.stringify({ action: 'open_quote_chat', quoteId: requestedQuoteId }),
        });
        const result = await response.json().catch(() => ({})) as { error?: string; ticketId?: string };
        if (!response.ok || !result.ticketId)
          throw new ActionError(result.error || 'Unable to open this quotation chat.', response.status);
        if (active) setOpenTicketId(result.ticketId);
      } catch (cause) {
        if (active) {
          setQuoteError(cause instanceof Error ? cause.message : 'Unable to open this quotation chat.');
          startedQuote.current = '';
        }
      }
    })();
    return () => { active = false; };
  }, [requestedQuoteId, user?.uid, role]);
  const listRef = useMemoFirebase(
    () => db && user && role === 'seller'
      ? query(collection(db, 'support_tickets'), where('sellerId', '==', user.uid), where('route', '==', 'seller'), orderBy('updatedAt', 'desc'), limit(100))
      : null,
    [db, user?.uid, role],
  );
  const { data, isLoading, error, retry } = useCollection<LegacyTicket>(listRef);
  const tickets = (data ?? []).filter(ticket => ticket.route === 'seller' && ticket.sellerId === user?.uid && ticket.encrypted !== true);

  async function reply(ticketId: string, action: 'reply' | 'close', message?: string) {
    if (!user || role !== 'seller') throw new Error('Seller access required.');
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
        body: JSON.stringify({ action, ticketId, ...(action === 'reply' ? { message } : {}) }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new ActionError(body.error || 'Unable to update this conversation.', response.status);
      toast({ title: action === 'close' ? 'Conversation closed' : 'Reply sent to customer' });
    } catch (cause) {
      toast(errorToast(cause, 'support'));
      throw cause;
    }
  }

  if (isRoleLoading) return <p role="status" className="p-6">Checking seller access…</p>;
  if (roleError) return <p role="alert" className="p-6">Unable to verify seller access.</p>;
  if (!user || role !== 'seller')
    return <main className="mx-auto max-w-xl p-6 text-center"><h1 className="text-xl font-semibold">Seller inbox</h1><p className="mt-3 text-sm">Sign in with an approved seller account to access customer messages.</p><Button asChild className="mt-4"><Link href="/login?next=%2Fseller%2Fmessages">Seller sign in</Link></Button></main>;

  return <SupportChatWorkspace
    tickets={tickets}
    openTicketId={openTicketId}
    title="Customer messages"
    secure={false}
    backHref="/seller/dashboard"
    backLabel="Back to seller dashboard"
    isLoading={isLoading}
    error={!!error}
    topNotice={<div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2"><Info className="h-4 w-4" /><span>Messages sent to your store only. These conversations are private, but not end-to-end encrypted.</span>{quoteError && <span role="alert" className="text-red-700">{quoteError} <Link href="/custom-orders?view=received" className="underline">Back to quotations</Link></span>}{error && <Button size="sm" variant="outline" onClick={retry}>Retry</Button>}</div>}
    renderConversation={ticket => {
      const selected = tickets.find(item => item.id === ticket.id);
      return selected ? <SupportTicketThread key={selected.id} ticket={selected} perspective="support"
        onSend={(id, text) => reply(id, 'reply', text)}
        onClose={id => reply(id, 'close')} /> : null;
    }}
  />;
}
