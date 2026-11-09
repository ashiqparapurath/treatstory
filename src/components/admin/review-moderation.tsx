'use client';
import { ActionError } from '@/lib/user-notices';
import { errorToast } from '@/lib/user-notices';
import { useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';

type Review = {id:string;orderId:string;productId:string;buyerUid:string;rating:number;comment:string;createdAt?:{toDate?:()=>Date}};
export function ReviewModeration(){
  const {user}=useUser(), db=useFirestore(), {toast}=useToast();
  const ref=useMemoFirebase(()=>db?query(collection(db,'product_reviews'),where('status','==','pending'),limit(100)):null,[db]);
  const {data,isLoading,error,retry}=useCollection<Review>(ref);
  const [busy,setBusy]=useState<string|null>(null);
  async function change(review:Review,action:'publish'|'reject'){
    if(!user||busy)return;setBusy(review.id);
    try{
      const response=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({action,orderId:review.orderId})});
      const result=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new ActionError(result.error||'Unable to moderate review.',response.status);
      toast({title:action==='publish'?'Review published':'Review rejected'});
    }catch(error){toast(errorToast(error, 'review'));}
    finally{setBusy(null);}
  }
  return <section className="space-y-5"><div><h2 className="text-2xl font-semibold">Product review moderation</h2><p className="mt-2 text-sm text-muted-foreground">Publish or reject reviews from completed, verified TreatStory purchases. A review doesn't appear publicly until approved.</p></div>
    {isLoading?<div className="h-28 animate-pulse rounded-2xl bg-[#eee8df]"/>:error?<div className="rounded-2xl border bg-white p-5"><p role="alert" className="text-sm">Unable to load pending reviews.</p><Button variant="outline" className="mt-3" onClick={retry}>Retry</Button></div>:!data?.length?<div className="rounded-2xl border bg-white p-10 text-center text-sm">No pending product reviews.</div>:<div className="space-y-4">{data.map(review=><article key={review.id} className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-amber-600">{Array.from({length:5},(_,n)=><Star key={n} className={`h-4 w-4 ${n<review.rating?'fill-current':''}`}/>)}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{review.comment}</p><p className="mt-3 break-all text-xs text-muted-foreground">Product: {review.productId} · Order: {review.orderId} · Buyer UID: {review.buyerUid}</p><div className="mt-4 flex gap-2"><Button size="sm" disabled={busy!==null} onClick={()=>void change(review,'publish')}>Publish review</Button><Button variant="outline" size="sm" disabled={busy!==null} onClick={()=>void change(review,'reject')}>Reject</Button></div></article>)}</div>}
  </section>;
}
