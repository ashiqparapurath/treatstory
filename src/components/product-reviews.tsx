'use client';
import { collection, query, where, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Star, BadgeCheck } from 'lucide-react';

type Review = {id:string;rating:number;comment:string;verifiedPurchase:boolean;createdAt?:{toDate?:()=>Date}};
export function ProductReviews({ productId }: { productId: string }){
  const db=useFirestore();
  const ref=useMemoFirebase(()=>db&&productId?query(collection(db,'product_reviews'),
    where('productId','==',productId),where('status','==','published'),limit(30)):null,[db,productId]);
  const {data,isLoading,error}=useCollection<Review>(ref);
  const sorted=[...(data||[])].sort((a,b)=>(b.createdAt?.toDate?.()?.getTime()||0)-(a.createdAt?.toDate?.()?.getTime()||0));
  const average=sorted.length?sorted.reduce((s,r)=>s+r.rating,0)/sorted.length:0;
  return <section className="mt-7 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">Verified purchase reviews</h2><p className="mt-1 text-xs text-muted-foreground">Feedback from completed TreatStory orders. Reviews are moderated before publication.</p>
    {isLoading?<div className="mt-4 h-20 animate-pulse rounded-xl bg-[#f0ece7]"/>:error?<p role="alert" className="mt-4 text-sm text-muted-foreground">Reviews are unavailable right now.</p>:!sorted.length?<p className="mt-4 text-sm text-muted-foreground">No customer reviews yet.</p>:<><p className="mt-4 text-base font-semibold">{average.toFixed(1)} / 5 <span className="ml-1 text-xs font-normal text-muted-foreground">from {sorted.length} reviews</span></p><div className="mt-4 space-y-4">{sorted.map(r=><article key={r.id} className="border-t pt-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-1 text-amber-500">{Array.from({length:5},(_,i)=><Star key={i} className={`h-4 w-4 ${i<r.rating?'fill-current':''}`}/>)}</div>{r.verifiedPurchase&&<span className="inline-flex items-center gap-1 text-[11px] text-[#667d56]"><BadgeCheck className="h-4 w-4"/>Verified TreatStory purchase</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{r.comment}</p><p className="mt-2 text-xs text-muted-foreground">{r.createdAt?.toDate?.()?.toLocaleDateString('en-IN')||'Recently'}</p></article>)}</div></>}
  </section>;
}

/** Show a star only when real, published reviews exist. No placeholder ratings. */
export function ProductRatingBadge({ productId }: { productId: string }) {
  const db = useFirestore();
  const ref = useMemoFirebase(() => db && productId ? query(collection(db, 'product_reviews'),
    where('productId', '==', productId), where('status', '==', 'published'), limit(30)) : null, [db, productId]);
  const { data, isLoading, error } = useCollection<Review>(ref);
  const reviews = (data ?? []).filter(review => Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5);
  if (isLoading || error || reviews.length === 0) return null;
  const average = reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
  return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#8c7e71]" aria-label={`Rated ${average.toFixed(1)} out of 5 from ${reviews.length} published reviews`}>
    <Star aria-hidden="true" className="h-4 w-4 fill-[#e8ad49] text-[#e8ad49]" />{average.toFixed(1)}
  </span>;
}
