'use client';
import { ActionError } from '@/lib/user-notices';
import { errorToast } from '@/lib/user-notices';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { collection, doc, query, where, limit } from 'firebase/firestore';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { LifeBuoy, Mail, Info } from 'lucide-react';

type Ticket = { id:string;subject:string;category:string;message:string;status:string;response?:string;orderId?:string;createdAt?:{toDate?:()=>Date};updatedAt?:{toDate?:()=>Date} };
export default function SupportPage(){
  const {user,isUserLoading}=useUser();
  const db=useFirestore();
  const {toast}=useToast();
  const [category,setCategory]=useState('order');
  const [subject,setSubject]=useState('');
  const [message,setMessage]=useState('');
  const [orderId,setOrderId]=useState('');
  const [busy,setBusy]=useState(false);
  const supportSettingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'support') : null, [db]);
  const { data: supportSettings } = useDoc<{contactEmail?:string;publicNotice?:string}>(supportSettingsRef);
  const ref=useMemoFirebase(()=>db&&user?query(collection(db,'support_tickets'),where('ownerUid','==',user.uid),limit(50)):null,[db,user?.uid]);
  const {data,error,isLoading}=useCollection<Ticket>(ref);
  async function submit(e:FormEvent){
    e.preventDefault();if(!user||busy)return;setBusy(true);
    try{
      const response=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},
        body:JSON.stringify({action:'create',subject,category,message,orderId})});
      const body=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new ActionError(body.error||'Could not submit your request.',response.status);
      toast({title:'Support request sent',description:'You can follow the reply in this page and notifications.'});
      setSubject('');setMessage('');setOrderId('');
    }catch(error){toast(errorToast(error, 'support'));}
    finally{setBusy(false);}
  }
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell pb-24 pt-12"><div className="flex items-start gap-3"><LifeBuoy className="mt-1 h-8 w-8 text-[#a68a64]"/><div><p className="eyebrow text-[#a68a64]">We are here to help</p><h1 className="mt-3 text-4xl font-medium">TreatStory support</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">For orders, delivery, cancellations, payments or account questions, contact the TreatStory team. Your ticket is private to you and administrators.</p></div></div>
    {(supportSettings?.publicNotice || supportSettings?.contactEmail) && <aside aria-label="Support contact information" className="mt-6 max-w-3xl space-y-3 rounded-2xl border border-[#e6dfd5] bg-white p-4 sm:p-5">
      {supportSettings.publicNotice && <p className="flex items-start gap-2 text-sm leading-6 text-[#594c3e]"><Info className="mt-1 h-4 w-4 shrink-0 text-[#a68a64]" /><span className="whitespace-pre-wrap break-words">{supportSettings.publicNotice}</span></p>}
      {supportSettings.contactEmail && <a className="inline-flex min-h-10 items-center gap-2 break-all text-sm font-semibold text-[#806747] underline underline-offset-4" href={`mailto:${encodeURIComponent(supportSettings.contactEmail)}`}><Mail className="h-4 w-4 shrink-0" />Email TreatStory support: {supportSettings.contactEmail}</a>}
    </aside>}
    {!user&&!isUserLoading?<Link href="/login" className="editorial-button mt-7">Sign in to request support</Link>:<div className="mt-9 grid gap-8 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-5 sm:p-8">
        <h2 className="text-xl font-semibold">New support request</h2>
        <div className="space-y-2">
          <label htmlFor="support-topic" className="block text-xs font-semibold text-[#4b4034]">What is this about?</label>
          <Select value={category} onValueChange={setCategory} disabled={busy}>
            <SelectTrigger id="support-topic" aria-label="Support topic" className="h-12 bg-[#fffdfa] text-left text-sm">
              <SelectValue placeholder="Choose a topic" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={6} align="start" className="max-h-[min(22rem,65dvh)] w-[var(--radix-select-trigger-width)]">
              <SelectItem value="order">An order or cancellation</SelectItem>
              <SelectItem value="delivery">Delivery or pickup</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="seller">A seller or product</SelectItem>
              <SelectItem value="account">My account</SelectItem>
              <SelectItem value="other">Something else</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="block space-y-2 text-xs font-semibold">Subject<Input required minLength={5} maxLength={140} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="A short description of your issue"/></label>
        <label className="block space-y-2 text-xs font-semibold">Order ID (optional)<Input maxLength={160} value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Paste an order ID from your order details"/></label>
        <label className="block space-y-2 text-xs font-semibold">How can we help?<Textarea required minLength={15} maxLength={2000} rows={6} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Explain what happened and what outcome you would prefer."/></label>
        <Button type="submit" className="h-12 w-full rounded-full" disabled={busy||!user}>{busy?'Sending…':'Submit request'}</Button>
      </form>
      <section className="rounded-3xl border bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Your support requests</h2>
        {isLoading||isUserLoading?<div className="mt-5 h-24 animate-pulse rounded-xl bg-[#eee8df]"/>:error?<p role="alert" className="mt-5 text-sm text-red-700">Unable to load support tickets. Check that you are signed in and try again.</p>:!data?.length?<p className="mt-5 text-sm text-muted-foreground">No support requests yet.</p>:<div className="mt-5 space-y-4">{[...data].sort((a,b)=>(b.createdAt?.toDate?.()?.getTime()||0)-(a.createdAt?.toDate?.()?.getTime()||0)).map(item=><article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{item.subject}</h3><span className="rounded-full bg-[#f4eee5] px-3 py-1 text-xs capitalize">{item.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>{item.response&&<div className="mt-4 rounded-xl bg-[#f5f3ee] p-3"><p className="text-xs font-semibold">TreatStory support response</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.response}</p></div>}{item.orderId&&<p className="mt-3 break-all text-xs text-muted-foreground">Order: {item.orderId}</p>}</article>)}</div>}
      </section></div>}
  </main></div>;
}
