'use client';
import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LockKeyhole, LifeBuoy } from 'lucide-react';

export function SupportInbox(){
  const db=useFirestore();
  const crypto=useSupportEncryption(true);
  const [passphrase,setPassphrase]=useState('');
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets'),orderBy('createdAt','desc'),limit(100)):null,[db]);
  const {data,error,isLoading,retry}=useCollection<SupportChatTicket>(ref);
  return <section className="space-y-5">
    <div><p className="eyebrow text-[#a68a64]">Customer care</p><h2 className="mt-2 text-2xl font-semibold">Support conversations</h2><p className="mt-2 text-sm text-muted-foreground">Real-time, end-to-end encrypted chat with buyers and sellers. The server cannot decrypt new chat messages.</p></div>
    <div className="rounded-2xl border bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4"/> Support team encryption key</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">The team key is encrypted with a shared passphrase. Give it only to authorized support staff through a separate secure channel. The passphrase is not recoverable, and loss makes old encrypted chats unreadable. Each agent who knows this passphrase can read all team chats.</p>
      {!crypto.keys?<p className="mt-3 text-sm">Loading encryption settings…</p>:
      !crypto.privateKey?<form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={e=>{e.preventDefault();void (crypto.keys?.teamKey?crypto.unlock(passphrase):crypto.setup(passphrase));setPassphrase('');}}>
        <label htmlFor="support-team-passphrase" className="text-xs font-semibold">{crypto.keys.teamKey?'Unlock existing team key':'Create team encryption passphrase (12+ characters)'}</label>
        <Input id="support-team-passphrase" type="password" autoComplete="off" required minLength={crypto.keys.teamKey?1:12} value={passphrase} onChange={e=>setPassphrase(e.target.value)}/>
        <Button type="submit" disabled={crypto.busy} className="self-start">{crypto.keys.teamKey?'Unlock inbox':'Enable encrypted support chat'}</Button>
      </form>:<p className="mt-3 text-sm text-emerald-700">Support conversations unlocked for this session.</p>}
      {crypto.error&&<p role="alert" className="mt-3 text-xs text-red-700">{crypto.error}</p>}
    </div>
    {isLoading?<div className="h-36 animate-pulse rounded-2xl bg-[#eee8df]"/>:
    error?<div className="rounded-xl border bg-white p-5"><p role="alert" className="text-sm">Support inbox is unavailable. Check administrator permissions.</p><Button className="mt-4" variant="outline" onClick={retry}>Retry</Button></div>:
    !data?.length?<div className="rounded-2xl border bg-white p-10 text-center"><LifeBuoy className="mx-auto h-8 w-8 text-[#a68a64]"/><p className="mt-4 text-sm">No support conversations yet.</p></div>:
    <div className="space-y-4">{data.map(ticket=><article key={ticket.id} className="rounded-2xl border bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{ticket.encrypted?'Encrypted customer conversation':ticket.subject}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{ticket.category} · {ticket.createdAt?.toDate?.()?.toLocaleString('en-IN')||'Recently'}</p></div><span className="rounded-full bg-[#f4efe7] px-3 py-1 text-xs capitalize">{ticket.status}</span></div>
      <p className="mt-3 break-all text-xs text-muted-foreground">Customer UID: {ticket.ownerUid}{ticket.orderId?' · Order: '+ticket.orderId:''}</p>
      {ticket.encrypted?(crypto.privateKey?<SupportChatThread ticket={ticket} privateKey={crypto.privateKey} role="team"/>:<p className="mt-4 text-sm text-muted-foreground">Unlock the support team key to read and reply.</p>):
      <div className="mt-4 rounded-xl bg-[#f8f6f2] p-4 text-sm"><p className="mb-2 text-xs font-semibold text-amber-800">Legacy unencrypted ticket · view only</p><p className="whitespace-pre-wrap">{ticket.message}</p>{ticket.response&&<p className="mt-3 border-t pt-3"><strong>Previous response:</strong> {ticket.response}</p>}<p className="mt-3 text-xs text-muted-foreground">Ask the customer to start a new secure chat for further messages.</p></div>}
    </article>)}</div>}
  </section>;
}
