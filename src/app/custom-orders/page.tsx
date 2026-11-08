'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, query, where } from 'firebase/firestore';
import { useAccountRole, useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Quote = { id:string;buyerUid:string;sellerId:string;productId?:string;occasion:string;description:string;budget:number;requestedDate:string;referenceUrl?:string;status:'requested'|'quoted'|'declined'|'accepted';quotedPrice?:number;quotedNote?:string;expiresAt?:{toDate?:()=>Date} };
const money = (v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v);

function CustomOrderContent(){
  const {user,isUserLoading}=useUser();
  const {role}=useAccountRole();
  const db=useFirestore();
  const params=useSearchParams();
  const {toast}=useToast();
  const [sellerId,setSellerId]=useState(params.get('seller')||'');
  const [productId,setProductId]=useState(params.get('product')||'');
  const [occasion,setOccasion]=useState('');
  const [description,setDescription]=useState('');
  const [budget,setBudget]=useState('');
  const [date,setDate]=useState('');
  const [referenceUrl,setReferenceUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [quotePrice,setQuotePrice]=useState<Record<string,string>>({});
  const [quoteNote,setQuoteNote]=useState<Record<string,string>>({});
  const buyerQuery=useMemoFirebase(()=>db&&user?query(collection(db,'custom_quotes'),where('buyerUid','==',user.uid)):null,[db,user?.uid]);
  const sellerQuery=useMemoFirebase(()=>db&&user&&role==='seller'?query(collection(db,'custom_quotes'),where('sellerId','==',user.uid)):null,[db,user?.uid,role]);
  const {data:buyerQuotes,error:buyerError}=useCollection<Quote>(buyerQuery);
  const {data:sellerQuotes,error:sellerError}=useCollection<Quote>(sellerQuery);
  const api=async(data:Record<string,unknown>)=>{
    if(!user)throw new Error('Sign in to continue.');
    const response=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({})) as {error?:string};
    if(!response.ok)throw new Error(result.error||'Unable to send custom request.');
    return result;
  };
  async function submit(e:FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      await api({action:'create',sellerId:sellerId.trim(),productId:productId.trim(),occasion:occasion.trim(),description:description.trim(),budget:Number(budget),requestedDate:date,referenceUrl:referenceUrl.trim()});
      toast({title:'Custom request sent',description:'The creator can review your request and send a quote.'});
      setOccasion('');setDescription('');setBudget('');setDate('');setReferenceUrl('');
    }catch(error){toast({variant:'destructive',title:'Could not send request',description:error instanceof Error?error.message:'Please retry.'});}
    finally{setBusy(false);}
  }
  async function action(data:Record<string,unknown>){
    if(busy)return;setBusy(true);
    try{await api(data);toast({title:'Custom quote updated'});}
    catch(error){toast({variant:'destructive',title:'Unable to update quote',description:error instanceof Error?error.message:'Please retry.'});}
    finally{setBusy(false);}
  }
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell pb-24 pt-10"><p className="eyebrow text-[#a68a64]">Made just for you</p><h1 className="mt-3 text-4xl font-medium">Custom creations & quotes</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Planning a birthday cake, custom painting or handmade gift? Ask a creator for a tailored price. Quotes are requests, not confirmed purchases or online payments.</p>
    {!user&&!isUserLoading?<Link href="/login" className="editorial-button mt-7">Sign in to request a quote</Link>:<div className="mt-9 grid gap-8 lg:grid-cols-2">
      <section className="rounded-3xl border bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Request a custom creation</h2><form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block space-y-1 text-xs font-semibold">Creator ID<Input required maxLength={128} minLength={10} value={sellerId} onChange={e=>setSellerId(e.target.value)} placeholder="Select a creator from their product page"/></label>
        <label className="block space-y-1 text-xs font-semibold">Product ID (optional)<Input maxLength={128} value={productId} onChange={e=>setProductId(e.target.value)}/></label>
        <label className="block space-y-1 text-xs font-semibold">Occasion<Input required minLength={2} maxLength={120} value={occasion} onChange={e=>setOccasion(e.target.value)} placeholder="Birthday, anniversary, wedding..."/></label>
        <label className="block space-y-1 text-xs font-semibold">Describe what you need<Textarea required minLength={15} maxLength={2000} rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Size, ingredients, colours, materials, personalization..."/></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs font-semibold">Approximate budget (₹)<Input required type="number" min={0} max={10000000} value={budget} onChange={e=>setBudget(e.target.value)}/></label><label className="block space-y-1 text-xs font-semibold">Preferred date<Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
        <label className="block space-y-1 text-xs font-semibold">Reference photo HTTPS URL (optional)<Input type="url" value={referenceUrl} maxLength={2048} onChange={e=>setReferenceUrl(e.target.value)} placeholder="https://..."/></label>
        <Button type="submit" disabled={busy||!user} className="h-12 w-full rounded-full">{busy?'Sending request…':'Send to creator'}</Button>
      </form></section>
      <div className="space-y-6"><section className="rounded-3xl border bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Your requests</h2>{buyerError?<p role="alert" className="mt-4 text-xs text-red-700">Unable to load requests.</p>:!buyerQuotes?.length?<p className="mt-4 text-sm text-muted-foreground">No requests yet.</p>:<div className="mt-5 space-y-4">{buyerQuotes.map(q=><article key={q.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{q.occasion}</p><span className="rounded-full bg-[#f4efe7] px-3 py-1 text-xs capitalize">{q.status}</span></div><p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{q.description}</p><p className="mt-3 text-xs">Requested: {q.requestedDate} · Budget {money(q.budget)}</p>{q.status==='quoted'&&<div className="mt-3 rounded-lg bg-[#f7f3ec] p-3"><p className="font-semibold">Creator quote: {money(q.quotedPrice||0)}</p><p className="mt-1 text-xs">{q.quotedNote}</p><p className="mt-1 text-xs">Valid until {q.expiresAt?.toDate?.()?.toLocaleDateString('en-IN')||'7 days after issue'}</p><Button className="mt-3" size="sm" disabled={busy} onClick={()=>void action({action:'accept',id:q.id})}>Accept this quote</Button></div>}{q.status==='accepted'&&<p className="mt-3 text-xs text-green-800">Quote accepted. Confirm the final order and payment arrangements with the creator; accepting a quote does not create an order.</p>}</article>)}</div>}</section>
        {role==='seller'&&<section className="rounded-3xl border bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Creator quote requests</h2>{sellerError?<p role="alert" className="mt-4 text-xs text-red-700">Could not load creator quotes.</p>:!sellerQuotes?.length?<p className="mt-4 text-sm text-muted-foreground">No customer requests yet.</p>:<div className="mt-4 space-y-4">{sellerQuotes.map(q=><article key={q.id} className="rounded-xl border p-4"><h3 className="font-semibold">{q.occasion} <span className="text-xs font-normal capitalize text-muted-foreground">· {q.status}</span></h3><p className="mt-2 whitespace-pre-wrap text-xs">{q.description}</p><p className="mt-2 text-xs text-muted-foreground">Budget {money(q.budget)} · Requested date {q.requestedDate}</p>{q.referenceUrl&&<a href={q.referenceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs underline">Reference photo</a>}{q.status==='requested'&&<div className="mt-3 space-y-2"><Input type="number" min={1} max={10000000} placeholder="Your quoted price (₹)" value={quotePrice[q.id]||''} onChange={e=>setQuotePrice(p=>({...p,[q.id]:e.target.value}))}/><Textarea maxLength={800} placeholder="What this quote includes, timing, delivery..." value={quoteNote[q.id]||''} onChange={e=>setQuoteNote(p=>({...p,[q.id]:e.target.value}))} rows={2}/><div className="flex flex-wrap gap-2"><Button disabled={busy||Number(quotePrice[q.id])<=0||!quoteNote[q.id]?.trim()} size="sm" onClick={()=>void action({action:'quote',id:q.id,price:Number(quotePrice[q.id]),note:quoteNote[q.id]})}>Send quote</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>void action({action:'decline',id:q.id})}>Decline</Button></div></div>}</article>)}</div>}</section>}
      </div></div>}
  </main></div>;
}
export default function CustomOrdersPage(){return <Suspense fallback={<div>Loading custom requests…</div>}><CustomOrderContent/></Suspense>;}
