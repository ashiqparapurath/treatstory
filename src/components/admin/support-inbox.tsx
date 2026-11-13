'use client';
import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LifeBuoy, LockKeyhole } from 'lucide-react';

export function SupportInbox(){
  const db=useFirestore();
  const crypto=useSupportEncryption(true);
  const [showLegacy,setShowLegacy]=useState(false);
  const [legacyPassphrase,setLegacyPassphrase]=useState('');
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets'),orderBy('createdAt','desc'),limit(100)):null,[db]);
  const {data,error,isLoading,retry}=useCollection<SupportChatTicket>(ref);
  const legacyConversations=(data??[]).filter(item=>item.encrypted&&item.teamKeyVersion!==2);
  return <section className="space-y-5">
    <div><p className="eyebrow text-[#a68a64]">Customer care</p><h2 className="mt-2 text-2xl font-semibold">Support conversations</h2><p className="mt-2 text-sm text-muted-foreground">Reply to buyers and sellers. New conversations automatically encrypt message contents on each device.</p></div>
    <div className="rounded-2xl border bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4"/> Secure support inbox</p>
      {!crypto.keys?<p className="mt-3 text-sm text-muted-foreground">Preparing secure messaging…</p>:
        crypto.privateKey?<p className="mt-3 text-sm text-emerald-700">This administrator device is ready for encrypted support chats.</p>:
        <p role={crypto.error?'alert':undefined} className="mt-3 text-sm text-muted-foreground">{crypto.error||'Configuring secure messaging on this administrator device…'}</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">This browser holds your private encryption key. Clearing site data or switching devices can make messages inaccessible; secure device transfer is not available yet.</p>
      {legacyConversations.length>0&&crypto.keys?.teamKey&&<div className="mt-4 border-t pt-4">
        <Button type="button" variant="outline" onClick={()=>setShowLegacy(v=>!v)}>{showLegacy?'Hide older chat access':'Access older encrypted conversations'}</Button>
        {showLegacy&&<div className="mt-3 max-w-lg space-y-3">
          <p className="text-xs leading-5 text-amber-800">Earlier conversations used a shared team passphrase. Entering it is optional and only needed to open those older messages. The new inbox does not use it.</p>
          {crypto.legacyPrivateKey?<p className="text-sm text-emerald-700">Older conversations unlocked for this session.</p>:
          <form onSubmit={e=>{e.preventDefault();void crypto.unlockLegacy(legacyPassphrase);setLegacyPassphrase('');}} className="space-y-3">
            <label htmlFor="legacy-support-passphrase" className="block text-xs font-semibold">Previous team passphrase</label>
            <Input id="legacy-support-passphrase" type="password" autoComplete="off" value={legacyPassphrase} onChange={e=>setLegacyPassphrase(e.target.value)} required/>
            <Button type="submit" disabled={crypto.busy||!legacyPassphrase}>Unlock older chats</Button>
          </form>}
        </div>}
      </div>}
      {crypto.error&&<p role="alert" className="mt-3 text-sm text-red-700">{crypto.error}</p>}
    </div>
    {isLoading?<div className="h-36 animate-pulse rounded-2xl bg-[#eee8df]"/>:
    error?<div className="rounded-xl border bg-white p-5"><p role="alert" className="text-sm">Support inbox is unavailable. Check administrator permissions.</p><Button className="mt-4" variant="outline" onClick={retry}>Retry</Button></div>:
    !data?.length?<div className="rounded-2xl border bg-white p-10 text-center"><LifeBuoy className="mx-auto h-8 w-8 text-[#a68a64]"/><p className="mt-4 text-sm">No support conversations yet.</p></div>:
    <div className="space-y-4">{data.map(ticket=>{
      const old=ticket.encrypted&&ticket.teamKeyVersion!==2;
      const key=old?crypto.legacyPrivateKey:crypto.privateKey;
      return <article key={ticket.id} className="rounded-2xl border bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{ticket.encrypted?'Private customer conversation':ticket.subject}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{ticket.category} · {ticket.createdAt?.toDate?.()?.toLocaleString('en-IN')||'Recently'}</p></div><span className="rounded-full bg-[#f4efe7] px-3 py-1 text-xs capitalize">{ticket.status}</span></div>
        <p className="mt-3 break-all text-xs text-muted-foreground">Customer UID: {ticket.ownerUid}{ticket.orderId?' · Order: '+ticket.orderId:''}</p>
        {ticket.encrypted?(key?<SupportChatThread ticket={ticket} privateKey={key} role="team"/>:<p className="mt-4 text-sm text-muted-foreground">{old?'This older conversation requires the previous team passphrase. Use “Access older encrypted conversations” above.':'This conversation requires the administrator device that was paired with secure support.'}</p>):
        <div className="mt-4 rounded-xl bg-[#f8f6f2] p-4 text-sm"><p className="mb-2 text-xs font-semibold text-amber-800">Legacy unencrypted ticket · view only</p><p className="whitespace-pre-wrap">{ticket.message}</p>{ticket.response&&<p className="mt-3 border-t pt-3"><strong>Previous response:</strong> {ticket.response}</p>}<p className="mt-3 text-xs text-muted-foreground">Ask the customer to start a new secure chat for further messages.</p></div>}
      </article>;
    })}</div>}
  </section>;
}
