'use client';

import { useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LifeBuoy } from 'lucide-react';

type Ticket = { id:string;ownerUid:string;subject:string;category:string;orderId:string;
  message:string;status:'open'|'responded'|'closed';response?:string;createdAt?:{toDate?:()=>Date} };

export function SupportInbox(){
  const db=useFirestore();
  const {user}=useUser();
  const {toast}=useToast();
  const [busy,setBusy]=useState<string|null>(null);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const ref=useMemoFirebase(()=>db?query(collection(db,'support_tickets'),orderBy('createdAt','desc'),limit(100)):null,[db]);
  const {data,error,isLoading,retry}=useCollection<Ticket>(ref);
  async function change(ticketId:string,action:'reply'|'close'){
    if(!user||busy)return;setBusy(ticketId);
    try{
      const response=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},
        body:JSON.stringify({action,ticketId,...(action==='reply'?{message:answers[ticketId]?.trim()}: {})})});
      const body=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(body.error||'Unable to update the ticket.');
      toast({title:action==='close'?'Support ticket closed':'Reply sent to customer'});
      setAnswers(p=>({...p,[ticketId]:''}));
    }catch(error){toast({variant:'destructive',title:'Support update failed',description:error instanceof Error?error.message:'Please retry.'});}
    finally{setBusy(null);}
  }
  return <section className="space-y-5"><div><p className="eyebrow text-[#a68a64]">Customer care</p><h2 className="mt-2 text-2xl font-semibold">Support inbox</h2><p className="mt-2 text-sm text-muted-foreground">Only verified administrators can read and respond to customer requests. Up to the most recent 100 tickets are shown.</p></div>
    {isLoading?<div className="h-36 animate-pulse rounded-2xl bg-[#eee8df]"/>:
    error?<div className="rounded-xl border bg-white p-5"><p role="alert" className="text-sm">Support inbox is unavailable. Check admin permissions.</p><Button className="mt-4" variant="outline" onClick={retry}>Retry</Button></div>:
    !data?.length?<div className="rounded-2xl border bg-white p-10 text-center"><LifeBuoy className="mx-auto h-8 w-8 text-[#a68a64]"/><p className="mt-4 text-sm">No support tickets yet.</p></div>:
    <div className="space-y-4">{data.map(ticket=><article key={ticket.id} className="rounded-2xl border bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{ticket.subject}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{ticket.category} · {ticket.createdAt?.toDate?.()?.toLocaleString('en-IN')||'Recently'}</p></div><span className="rounded-full bg-[#f4efe7] px-3 py-1 text-xs capitalize">{ticket.status}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6">{ticket.message}</p><p className="mt-4 break-all text-xs text-muted-foreground">Customer UID: {ticket.ownerUid}{ticket.orderId? ` · Order: ${ticket.orderId}`:''}</p>{ticket.response&&<div className="mt-4 rounded-xl bg-[#f7f5f0] p-4 text-sm"><strong>Latest response</strong><p className="mt-2 whitespace-pre-wrap">{ticket.response}</p></div>}
      {ticket.status!=='closed'&&<div className="mt-5 space-y-3 border-t pt-5"><label className="block text-xs font-semibold">Reply to customer<Textarea rows={3} maxLength={2000} className="mt-2" placeholder="Write a clear response to this request." value={answers[ticket.id]||''} onChange={e=>setAnswers(p=>({...p,[ticket.id]:e.target.value}))}/></label><div className="flex flex-wrap gap-2"><Button disabled={busy!==null||(answers[ticket.id]?.trim().length||0)<5} onClick={()=>void change(ticket.id,'reply')}>{busy===ticket.id?'Saving…':'Send reply'}</Button><Button variant="outline" disabled={busy!==null} onClick={()=>void change(ticket.id,'close')}>Close ticket</Button></div></div>}</article>)}</div>}
  </section>;
}
