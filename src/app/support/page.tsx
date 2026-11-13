'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { collection, limit, query, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupportEncryption } from '@/hooks/use-support-encryption';
import { encryptSupportMessage } from '@/lib/support-encryption';
import { SupportChatThread, type SupportChatTicket } from '@/components/support-chat-thread';
import { LockKeyhole, LifeBuoy } from 'lucide-react';

const categories=[['order','Orders or cancellations'],['delivery','Delivery or pickup'],['payment','Payments'],['seller','Seller or product'],['account','My account'],['other','Other questions']] as const;
export default function SupportPage(){
  const {user,isUserLoading}=useUser();const db=useFirestore();
  const crypto=useSupportEncryption(false);
  const [passphrase,setPassphrase]=useState('');
  const [category,setCategory]=useState('order');
  const [message,setMessage]=useState('');const [orderId,setOrderId]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const ref=useMemoFirebase(()=>db&&user?query(collection(db,'support_tickets'),where('ownerUid','==',user.uid),limit(50)):null,[db,user?.uid]);
  const {data,isLoading,error:loadError}=useCollection<SupportChatTicket>(ref);
  async function start(e:FormEvent){
    e.preventDefault();if(!user||!crypto.privateKey||!crypto.keys?.ownKey||!crypto.keys.teamPublicKey||busy)return;
    setBusy(true);setError('');
    try{
      const encrypted=await encryptSupportMessage(message,crypto.keys.ownKey.publicKey,crypto.keys.teamPublicKey);
      const res=await fetch('/api/support-chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'create',category,message:undefined,encrypted,orderId})});
      const result=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(result.error||'Could not start chat.');
      setMessage('');setOrderId('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to start conversation.');}
    finally{setBusy(false);}
  }
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell pb-24 pt-12">
    <div className="flex items-start gap-3"><LifeBuoy className="mt-1 h-8 w-8 text-[#a68a64]"/><div><p className="eyebrow text-[#a68a64]">We are here to help</p><h1 className="mt-3 text-3xl font-medium sm:text-4xl">Private support chat</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Message the TreatStory team about orders, deliveries or your account. New chats use end-to-end encryption.</p></div></div>
    {!user&&!isUserLoading?<Link href="/login" className="editorial-button mt-7">Sign in to chat with support</Link>:
    <div className="mt-8 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <div className="rounded-2xl border bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4"/> Your encryption key</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Your private key is encrypted with a passphrase that only you know. It is never sent to our server unlocked. Losing this passphrase means losing access to encrypted history; TreatStory cannot reset it.</p>
          {!crypto.keys?<p className="mt-4 text-sm">Loading secure chat…</p>:!crypto.keys.teamPublicKey?<p className="mt-4 text-sm text-amber-800">Secure support chat is being set up by the support team. Please try again later.</p>:
          !crypto.privateKey?<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void (crypto.keys?.ownKey?crypto.unlock(passphrase):crypto.setup(passphrase));setPassphrase('');}}>
            <label className="block text-xs font-semibold" htmlFor="support-passphrase">{crypto.keys.ownKey?'Enter your encryption passphrase':'Create an encryption passphrase (12+ characters)'}</label>
            <Input id="support-passphrase" type="password" autoComplete="off" required minLength={crypto.keys.ownKey?1:12} value={passphrase} onChange={e=>setPassphrase(e.target.value)}/>
            <Button type="submit" disabled={crypto.busy} className="w-full">{crypto.keys.ownKey?'Unlock conversations':'Set up secure chat'}</Button>
          </form>:<p className="mt-3 text-sm text-emerald-700">Encryption unlocked for this session.</p>}
          {crypto.error&&<p role="alert" className="mt-3 text-xs text-red-700">{crypto.error}</p>}
        </div>
        {crypto.privateKey&&crypto.keys?.teamPublicKey&&crypto.keys.ownKey&&<form onSubmit={start} className="space-y-4 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Start a conversation</h2>
          <label className="block text-xs font-semibold" htmlFor="support-topic">Topic</label>
          <Select value={category} onValueChange={setCategory}><SelectTrigger id="support-topic" className="h-12"><SelectValue/></SelectTrigger><SelectContent>{categories.map(([id,title])=><SelectItem key={id} value={id}>{title}</SelectItem>)}</SelectContent></Select>
          <label className="block space-y-2 text-xs font-semibold">Order ID (optional)<Input value={orderId} maxLength={160} onChange={e=>setOrderId(e.target.value)}/></label>
          <label className="block space-y-2 text-xs font-semibold">Your message<textarea className="flex min-h-32 w-full rounded-xl border bg-white p-3 text-sm" value={message} minLength={1} maxLength={2000} required onChange={e=>setMessage(e.target.value)} placeholder="Describe what happened and how we can help…"/></label>
          <Button type="submit" className="w-full" disabled={busy||!message.trim()}>{busy?'Starting…':'Start secure chat'}</Button>
          {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
        </form>}
      </aside>
      <section className="min-w-0 space-y-4"><h2 className="text-xl font-semibold">Your conversations</h2>
        {isLoading||isUserLoading?<div className="h-32 animate-pulse rounded-2xl bg-white"/>:loadError?<p role="alert">Unable to load support conversations.</p>:
        !data?.length?<div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">No conversations yet. Start a secure chat to contact the team.</div>:
        [...data].sort((a,b)=>(b.updatedAt?.toDate?.()?.getTime()||0)-(a.updatedAt?.toDate?.()?.getTime()||0)).map(ticket=><article key={ticket.id} className="rounded-2xl border bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{ticket.encrypted?'Secure conversation':ticket.subject||'Support request'}</h3><span className="rounded-full bg-[#f4eee5] px-3 py-1 text-xs capitalize">{ticket.status}</span></div>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{ticket.category}{ticket.orderId?' · Order: '+ticket.orderId:''}</p>
          {ticket.encrypted?(crypto.privateKey?<SupportChatThread ticket={ticket} privateKey={crypto.privateKey} role="owner"/>:<p className="mt-3 text-sm text-muted-foreground">Unlock your encryption key to read and reply.</p>):
          <div className="mt-4 rounded-xl bg-[#f8f6f2] p-4 text-sm"><p className="mb-2 text-xs font-semibold text-amber-800">Legacy ticket — not end-to-end encrypted</p><p className="whitespace-pre-wrap">{ticket.message}</p>{ticket.response&&<p className="mt-3 border-t pt-3"><strong>Team response:</strong> {ticket.response}</p>}</div>}
        </article>)}
      </section>
    </div>}
  </main></div>;
}
