'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { collection, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { useAccountRole, useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ActionError, errorToast } from '@/lib/user-notices';
import { Info, Mail, MessageSquareText } from 'lucide-react';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
import { SupportTicketThread, type LegacyTicket } from '@/components/support-ticket-thread';

export default function SupportPage() {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading } = useAccountRole();
  const isSeller = role === 'seller';
  const [targetSellerId, setTargetSellerId] = useState('');
  const [queryOrderId, setQueryOrderId] = useState('');
  // A seller may also be a buyer. An explicitly chosen store takes priority
  // over the account's seller role; the no-target Help route goes to admin.
  const supportToAdmin = isSeller && !targetSellerId;
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setTargetSellerId(query.get('seller') || '');
    setQueryOrderId(query.get('order') || '');
  }, []);
  const db = useFirestore();
  const { toast } = useToast();
  const [category, setCategory] = useState('order');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  useEffect(() => { setOrderId(queryOrderId); }, [queryOrderId]);
  const [busy, setBusy] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const sellerInfoRef = useMemoFirebase(() => db && targetSellerId && /^[A-Za-z0-9_-]{1,128}$/.test(targetSellerId) && !supportToAdmin ? doc(db, 'sellers', targetSellerId) : null, [db, targetSellerId, supportToAdmin]);
  const { data: targetSeller, isLoading: targetSellerLoading } = useDoc<{ id: string; businessName: string; status: string }>(sellerInfoRef);
  const supportSettingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'support') : null, [db]);
  const { data: supportSettings } = useDoc<{ contactEmail?: string; publicNotice?: string }>(supportSettingsRef);
  const ref = useMemoFirebase(() => db && user ? query(collection(db, 'support_tickets'), where('ownerUid', '==', user.uid), limit(50)) : null, [db, user?.uid]);
  const { data, error, isLoading } = useCollection<LegacyTicket>(ref);

  async function requestSupport(payload: Record<string, string>) {
    if (!user) throw new Error('Sign in to contact support.');
    const response = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({})) as { error?: string; ticketId?: string };
    if (!response.ok) throw new ActionError(body.error || 'Unable to send your support message.', response.status);
    return body;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    try {
      const result = await requestSupport({ action: 'create', subject, category, message, orderId, sellerId: supportToAdmin ? '' : targetSellerId });
      if (result.ticketId) setOpenTicketId(result.ticketId);
      toast({ title: 'Support request sent', description: 'Your request is now in the conversation list.' });
      setSubject('');
      setMessage('');
      setOrderId('');
    } catch (cause) { toast(errorToast(cause, 'support')); }
    finally { setBusy(false); }
  }

  async function followUp(ticketId: string, text: string) {
    await requestSupport({ action: 'followup', ticketId, message: text });
    toast({ title: supportToAdmin ? 'Follow-up sent to TreatStory support' : 'Follow-up sent' });
  }

  if (!user) return <div className="min-h-screen bg-[#f8f6f2]"><Header />
    <main className="section-shell flex min-h-[65vh] flex-col items-center justify-center py-16 text-center">
      <MessageSquareText className="h-10 w-10 text-[#a88c69]" />
      <h1 className="mt-5 text-3xl font-semibold">TreatStory support</h1>
      <p className="mt-3 max-w-md text-sm text-[#85796b]">{isUserLoading ? 'Checking your account…' : 'Sign in to view your private support requests and conversations.'}</p>
      {!isUserLoading && <Link href={'/login?next=' + encodeURIComponent('/support' + (targetSellerId ? '?seller=' + encodeURIComponent(targetSellerId) + (queryOrderId ? '&order=' + encodeURIComponent(queryOrderId) : '') : ''))} className="editorial-button mt-7">Sign in to request support</Link>}
    </main>
  </div>;

  // The legacy API is a verified, server-owned plaintext support ticket API,
  // not an end-to-end encrypted chat transport.
  const visibleTickets = (data ?? []).filter(ticket => ticket.encrypted !== true);
  const newConversation = <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#e5dccf] bg-white p-5 shadow-sm sm:p-7">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Customer care</p>
      <h2 className="mt-2 text-xl font-semibold">{supportToAdmin ? 'Contact TreatStory support' : 'Message a seller'}</h2>
      <p className="mt-2 text-xs leading-5 text-[#827568]">{supportToAdmin ? 'Tell our support team what happened. Replies will appear here.' : 'Ask the shop directly about its products, delivery or your order.'}</p>
    </div>
    {!supportToAdmin && <div className="rounded-xl border border-[#e8ded2] bg-[#faf6ef] p-3 text-sm">
      {targetSellerLoading ? 'Checking selected store…' : targetSeller?.status === 'active' && targetSellerId !== user.uid
        ? <>Messaging <strong>{targetSeller.businessName}</strong></>
        : <><p className="font-medium">Select a store to message</p><p className="mt-1 text-xs leading-5 text-[#857565]">Visit a seller's storefront and tap Message seller. Each message goes only to that particular store.</p><Link href="/products" className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold underline">Explore stores and products</Link></>}
    </div>}
    <div className="space-y-2">
      <label htmlFor="support-topic" className="text-xs font-semibold">What is this about?</label>
      <Select value={category} onValueChange={setCategory} disabled={busy}>
        <SelectTrigger id="support-topic" aria-label="Support topic" className="h-12 rounded-xl bg-[#fffdfa]"><SelectValue placeholder="Choose a topic" /></SelectTrigger>
        <SelectContent position="popper" sideOffset={6} className="max-h-[min(24rem,65dvh)]">
          <SelectItem value="order">An order or cancellation</SelectItem>
          <SelectItem value="delivery">Delivery or pickup</SelectItem>
          <SelectItem value="payment">Payment</SelectItem>
          <SelectItem value="seller">A seller or product</SelectItem>
          <SelectItem value="account">My account</SelectItem>
          <SelectItem value="other">Something else</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <label className="block space-y-2 text-xs font-semibold">Subject
      <Input required minLength={5} maxLength={140} value={subject} onChange={event => setSubject(event.target.value)} placeholder="What do you need help with?" className="h-12 rounded-xl" />
    </label>
    <label className="block space-y-2 text-xs font-semibold">Order ID (optional)
      <Input maxLength={160} value={orderId} onChange={event => setOrderId(event.target.value)} placeholder="From your order details" className="h-12 rounded-xl" />
    </label>
    <label className="block space-y-2 text-xs font-semibold">Your message
      <Textarea rows={5} required minLength={15} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Describe your issue and what outcome would help." className="resize-none rounded-xl" />
    </label>
    <Button type="submit" disabled={busy || isRoleLoading || (!supportToAdmin && (targetSellerLoading || targetSeller?.status !== 'active' || targetSellerId === user.uid))} className="h-12 w-full rounded-full">{busy ? 'Sending…' : supportToAdmin ? 'Contact TreatStory' : 'Send to seller'}</Button>
  </form>;
  const topNotice = <div className="mx-auto flex min-w-0 max-w-5xl flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
    <span className="inline-flex min-w-0 items-start gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Messages are not end-to-end encrypted. {supportToAdmin ? 'TreatStory support handles your requests.' : 'Each new message is delivered to the selected seller.'}</span>
    {supportSettings?.publicNotice && <span className="min-w-0 max-w-md [overflow-wrap:anywhere]">{supportSettings.publicNotice}</span>}
    {supportToAdmin && supportSettings?.contactEmail && <a href={'mailto:' + encodeURIComponent(supportSettings.contactEmail)} className="inline-flex min-h-8 items-center gap-1 underline"><Mail className="h-3.5 w-3.5 shrink-0" /> Email support</a>}
  </div>;

  return <SupportChatWorkspace
    tickets={visibleTickets}
    title={supportToAdmin ? 'TreatStory support' : 'Your seller conversations'}
    secure={false}
    backHref="/account"
    backLabel="Back to account"
    isLoading={isLoading || isUserLoading}
    error={!!error}
    openTicketId={openTicketId}
    newConversation={newConversation}
    topNotice={topNotice}
    renderConversation={ticket => {
      const selected = visibleTickets.find(item => item.id === ticket.id);
      return selected ? <SupportTicketThread key={selected.id} ticket={selected} perspective="customer" onSend={followUp} /> : null;
    }}
  />;
}
