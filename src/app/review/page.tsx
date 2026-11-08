'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { doc } from 'firebase/firestore';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Star } from 'lucide-react';

type Order = {productName:string;buyerUid:string;status:string};
function ReviewContent(){
  const {user,isUserLoading}=useUser();
  const db=useFirestore();
  const params=useSearchParams();
  const orderId=params.get('order')||'';
  const ref=useMemoFirebase(()=>db&&orderId&&user?doc(db,'seller_orders',orderId):null,[db,user?.uid,orderId]);
  const {data:order,isLoading,error}=useDoc<Order>(ref);
  const [rating,setRating]=useState(5);
  const [comment,setComment]=useState('');
  const [busy,setBusy]=useState(false);
  const [complete,setComplete]=useState(false);
  const {toast}=useToast();
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!user||busy)return;
    setBusy(true);
    try{
      const response=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},
        body:JSON.stringify({action:'submit',orderId,rating,comment:comment.trim()})});
      const result=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(result.error||'Could not submit review.');
      setComplete(true);toast({title:'Review submitted',description:'Reviews are checked by TreatStory before appearing publicly.'});
    }catch(error){toast({variant:'destructive',title:'Review not sent',description:error instanceof Error?error.message:'Please retry.'});}
    finally{setBusy(false);}
  }
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell max-w-2xl py-12"><p className="eyebrow text-[#a68a64]">Share your experience</p><h1 className="mt-3 text-4xl font-medium">Write a product review</h1><p className="mt-3 text-sm text-muted-foreground">Reviews are available for delivered orders only. Every published review is tied to a verified TreatStory purchase.</p>
    {!user&&!isUserLoading?<Link href="/login" className="editorial-button mt-6">Sign in to review</Link>:isLoading||isUserLoading?<div className="mt-8 h-36 animate-pulse rounded-xl bg-[#e9e2d8]"/>:
    error||!order||order.buyerUid!==user?.uid||order.status!=='completed'?<div className="mt-8 rounded-xl border bg-white p-8 text-sm">This order isn't eligible for a review yet. <Link href="/orders" className="underline">See your orders</Link>.</div>:
    complete?<div className="mt-8 rounded-2xl border bg-white p-8"><h2 className="text-xl font-semibold">Thanks for your review.</h2><p className="mt-2 text-sm text-muted-foreground">Your feedback will appear when approved.</p><Link className="mt-4 inline-block underline" href="/orders">Back to orders</Link></div>:
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border bg-white p-6 sm:p-8"><h2 className="text-lg font-semibold">{order.productName}</h2><div><p className="mb-3 text-sm font-semibold">Your rating</p><div role="group" aria-label="Product rating" className="flex gap-2">{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setRating(n)} aria-label={`Rate ${n} stars`} aria-pressed={n===rating} className="rounded-lg p-2"><Star className={`h-7 w-7 ${n<=rating?'fill-amber-400 text-amber-500':'text-gray-300'}`}/></button>)}</div></div>
      <label className="block space-y-2 text-sm font-semibold">Tell other buyers about your experience<Textarea required minLength={10} maxLength={1000} rows={5} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Describe product quality, accuracy, and fulfillment."/></label><Button type="submit" disabled={busy||comment.trim().length<10} className="h-12 w-full rounded-full">{busy?'Submitting…':'Submit review'}</Button></form>}
  </main></div>;
}
export default function ReviewPage(){return <Suspense fallback={<div>Loading review…</div>}><ReviewContent/></Suspense>;}
