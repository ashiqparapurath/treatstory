'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Clock3, Info, MessageCircle, XCircle } from 'lucide-react';
import type { SupportChatTicket } from '@/lib/support-conversation-types';

type TicketTimestamp = { toDate?: () => Date };
export type TicketMessage = {
  id: string;
  sender: 'customer' | 'support';
  body: string;
  sentAt?: TicketTimestamp;
};
export type LegacyTicket = SupportChatTicket & {
  ownerUid: string;
  subject: string;
  message: string;
  response?: string;
  thread?: TicketMessage[];
  createdAt?: TicketTimestamp;
  updatedAt?: TicketTimestamp;
};
type Props = {
  ticket: LegacyTicket;
  perspective: 'customer' | 'support';
  onSend: (ticketId: string, message: string) => Promise<void>;
  onClose?: (ticketId: string) => Promise<void>;
};

function time(value?: TicketTimestamp) {
  try { return value?.toDate?.()?.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) || ''; }
  catch { return ''; }
}

export function SupportTicketThread({ ticket, perspective, onSend, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const history: TicketMessage[] = [
    { id: 'initial-request', sender: 'customer', body: ticket.message, sentAt: ticket.createdAt },
    ...(ticket.thread || []),
  ];
  // The pre-thread ticket model stored only the latest administrator response.
  if (!ticket.thread?.length && ticket.response) {
    history.push({ id: 'historical-reply', sender: 'support', body: ticket.response, sentAt: ticket.updatedAt });
  }
  useEffect(() => {
    const el = viewport.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.id, history.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (busy || ticket.status === 'closed' || trimmed.length < 5 || trimmed.length > 2000) return;
    setBusy(true);
    setError('');
    try { await onSend(ticket.id, trimmed); setMessage(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send your message.'); }
    finally { setBusy(false); }
  }
  async function close() {
    if (!onClose || busy) return;
    setBusy(true);
    setError('');
    try { await onClose(ticket.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to close this request.'); }
    finally { setBusy(false); }
  }

  return <div className="flex h-full min-h-0 flex-col bg-[#fbf9f5]">
    <div ref={viewport} aria-label="Support message history" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#ebe2d6] bg-white p-4 text-center sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a805d]">TreatStory customer care</p>
          <h3 className="mt-2 break-words text-base font-semibold text-[#302a24]">{ticket.subject}</h3>
          <p className="mt-2 text-xs capitalize text-[#867a6c]">{ticket.category} · {ticket.status === 'closed' ? 'Closed' : ticket.status === 'responded' ? 'Replied' : 'Open'}{ticket.orderId ? ' · Order linked' : ''}</p>
          {ticket.orderId && <p className="mt-2 break-all text-xs text-[#887b6c]">Order reference: {ticket.orderId}</p>}
          {perspective === 'support' && <p className="mt-2 break-all text-[11px] text-[#9b8e80]">Customer UID: {ticket.ownerUid}</p>}
        </div>
        <p className="mx-auto flex max-w-xl items-start gap-2 text-xs leading-5 text-[#857566]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Support tickets are not end-to-end encrypted. Do not share passwords, payment card numbers or recovery codes.</p>
        {history.map(item => {
          const mine = item.sender === perspective;
          return <div key={item.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[90%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ' + (mine ? 'rounded-br-md bg-[#302a24] text-white' : 'rounded-bl-md border border-[#e8e1d7] bg-white text-[#332d27]')}>
              <div className={'flex items-center gap-2 text-[11px] font-semibold ' + (mine ? 'text-[#ecdbc8]' : 'text-[#866d52]')}>
                <MessageCircle className="h-3 w-3" />{mine ? 'You' : item.sender === 'support' ? 'TreatStory support' : 'Customer'}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
              {time(item.sentAt) && <p className={'mt-2 text-right text-[10px] ' + (mine ? 'text-[#d1c1af]' : 'text-[#988b7d]')}>{time(item.sentAt)}</p>}
            </div>
          </div>;
        })}
        {ticket.status === 'closed' && <p className="mx-auto flex items-center gap-2 text-center text-xs text-[#8e7f6c]"><XCircle className="h-4 w-4" /> This request is closed. Start a new request if you still need help.</p>}
        {ticket.status !== 'closed' && <p className="mx-auto flex items-center gap-2 text-center text-xs text-[#8e7f6c]"><Clock3 className="h-4 w-4" /> Support replies are handled by the team and may not arrive immediately.</p>}
      </div>
    </div>
    <form onSubmit={submit} className="shrink-0 border-t border-[#e9e1d6] bg-white px-4 py-3 sm:px-8">
      <div className="mx-auto max-w-3xl">
        {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
        {ticket.status === 'closed' ? <p className="py-2 text-center text-sm text-[#877866]">This conversation is closed.</p> : <>
          <label htmlFor={'support-message-' + ticket.id} className="sr-only">Message</label>
          <div className="flex items-end gap-2 rounded-2xl border border-[#ded5c9] bg-[#fbf9f6] p-2">
            <textarea id={'support-message-' + ticket.id} aria-label="Message" rows={2} maxLength={2000} minLength={5} required value={message} onChange={e => setMessage(e.target.value)} placeholder={perspective === 'support' ? 'Write a reply to this customer…' : 'Send a follow-up message…'} className="max-h-40 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-[#a69888]" />
            <button type="submit" aria-label="Send message" disabled={busy || message.trim().length < 5} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#302a24] text-white transition hover:bg-[#524537] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp className="h-5 w-5" /></button>
          </div>
          {perspective === 'support' && <div className="mt-2 flex justify-end"><button type="button" onClick={() => void close()} disabled={busy || !onClose} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#8a7160] hover:bg-[#f5eee7] disabled:opacity-40">Close ticket</button></div>}
        </>}
      </div>
    </form>
  </div>;
}
