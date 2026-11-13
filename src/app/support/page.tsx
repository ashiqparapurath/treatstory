'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { collection, doc, limit, query, where } from 'firebase/firestore';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { encryptSupportMessage } from '@/lib/support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { Info, Mail } from 'lucide-react';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';


export default function SupportPage(){
  const {user,isUserLoading}=useUser();const db=useFirestore();
  const crypto=useSupportEncryption(false);
  const supportSettingsRef=useMemoFirebase(()=>db?doc(db, 'settings', 'support'):null,[db]);
  const {data:supportSettings}=useDoc<{contactEmail?:string;publicNotice?:string}>(supportSettingsRef);
  const [category,setCategory]=useState('order');
  const [message,setMessage]=useState('');const [orderId,setOrderId]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [openTicketId,setOpenTicketId]=useState<string|null>(null);
  const ref=useMemoFirebase(()=>db&&user?query(collection(db,'support_tickets'),where('ownerUid','==',user.uid),limit(50)):null,[db,user?.uid]);
  const {data,isLoading,error:loadError}=useCollection<SupportChatTicket>(ref);
  async function start(e:FormEvent){
    e.preventDefault();if(!user||!crypto.privateKey||!crypto.keys?.ownKey||!crypto.keys.teamPublicKey||busy)return;
    setBusy(true);setError('');
    try{
      const encrypted=await encryptSupportMessage(message,crypto.keys.ownKey.publicKey,crypto.keys.teamPublicKey);
      const res=await fetch('/api/support-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'create',category,encrypted,orderId})});
      const result=await res.json().catch(()=>({})) as {error?:string;ticketId?:string};
      if(!res.ok)throw new Error(result.error||'Could not start chat.');
      setMessage('');setOrderId('');if(result.ticketId)setOpenTicketId(result.ticketId);
    }catch(e){setError(e instanceof Error?e.message:'Unable to start conversation.');}
    finally{setBusy(false);}
  }
  const settingsNotice=(supportSettings?.publicNotice||supportSettings?.contactEmail)?
    <div aria-label="Support contact information" className="flex flex-wrap items-center justify-center gap-3">
      {supportSettings.publicNotice&&<span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5"/>{supportSettings.publicNotice}</span>}
      {supportSettings.contactEmail&&<a className="inline-flex items-center gap-1 underline" href={`mailto:${encodeURIComponent(supportSettings.contactEmail)}`}><Mail className="h-3.5 w-3.5"/>{supportSettings.contactEmail}</a>}
    </div>:null;
  if(!user&&!isUserLoading)return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell py-20"><h1 className="text-3xl font-semibold">TreatStory support</h1><p className="mt-3 text-sm text-muted-foreground">Sign in to contact the team.</p><Link href="/login" className="editorial-button mt-7">Sign in to chat with support</Link></main></div>;
  const newConversation=<div className="space-y-5">
    {!crypto.keys?.teamPublicKey?<p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Support chat is temporarily unavailable while the support team completes setup.</p>:
      !crypto.privateKey?<p role={crypto.error?'alert':undefined} className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">{crypto.error||'Preparing secure messaging on this device…'}</p>:null}
    {crypto.privateKey&&crypto.keys?.teamPublicKey&&crypto.keys.ownKey&&<form onSubmit={start} className="space-y-4 rounded-2xl border border-[#e7dfd5] bg-white p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Start a conversation</h2>
      <p className="text-sm leading-6 text-[#877b6d]">Tell us what happened. We'll keep your messages together in this chat.</p>
      <label htmlFor="support-topic" className="block text-xs font-semibold">Topic</label>
      <Select value={category} onValueChange={setCategory} disabled={busy}>
        <SelectTrigger id="support-topic" aria-label="Support topic" className="h-12 rounded-xl"><SelectValue/></SelectTrigger>
        <SelectContent position="popper" sideOffset={6} className="max-h-[min(22rem,65dvh)]">
          <SelectItem value="order">An order or cancellation</SelectItem>
          <SelectItem value="delivery">Delivery or pickup</SelectItem>
          <SelectItem value="payment">Payment</SelectItem>
          <SelectItem value="seller">A seller or product</SelectItem>
          <SelectItem value="account">My account</SelectItem>
          <SelectItem value="other">Something else</SelectItem>
        </SelectContent>
      </Select>
      <label className="block space-y-2 text-xs font-semibold">Order ID (optional)<Input value={orderId} maxLength={160} onChange={e=>setOrderId(e.target.value)} placeholder="Add an order reference"/></label>
      <label className="block space-y-2 text-xs font-semibold">Your message<textarea className="flex min-h-36 w-full resize-none rounded-xl border border-[#e7dfd5] bg-[#fcfaf7] p-4 text-sm" value={message} minLength={1} maxLength={2000} required onChange={e=>setMessage(e.target.value)} placeholder="Describe what happened and how we can help…"/></label>
      <Button type="submit" className="h-12 w-full rounded-full" disabled={busy||!message.trim()}>{busy?'Starting…':'Start secure chat'}</Button>
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>}
  </div>;
  return <SupportChatWorkspace title="Support messages" backHref="/account" backLabel="Back to account"
    tickets={data??[]} isLoading={isLoading||isUserLoading} error={!!loadError} openTicketId={openTicketId}
    topNotice={settingsNotice} newConversation={newConversation}
    renderConversation={ticket=>ticket.encrypted
      ?crypto.privateKey?<SupportChatThread ticket={ticket} privateKey={crypto.privateKey} role="owner"/>
        :<div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">This chat's encrypted history requires the original device. It cannot be recovered if its browser data was erased.</div>
      :<div className="h-full overflow-y-auto p-6 sm:p-10"><div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6">
        <p className="mb-3 text-xs font-semibold text-amber-800">Legacy ticket — not end-to-end encrypted</p>
        <p className="whitespace-pre-wrap text-sm">{ticket.message}</p>
        {ticket.response&&<p className="mt-5 border-t pt-5 text-sm"><strong>Support response:</strong> {ticket.response}</p>}
      </div></div>}/>;
}
