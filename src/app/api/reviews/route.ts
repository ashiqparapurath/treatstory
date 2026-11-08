import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('submit'),orderId:z.string().min(1).max(160),
    rating:z.number().int().min(1).max(5),comment:z.string().trim().min(10).max(1000)}).strict(),
  z.object({action:z.enum(['publish','reject']),orderId:z.string().min(1).max(160)}).strict(),
]);

export async function POST(request:NextRequest){
  try{
    const {uid,db}=await verifiedUser(request);
    if(Number(request.headers.get('content-length')||0)>3000)throw new ApiError(413,'Review is too large.');
    const raw:unknown=await request.json().catch(()=>{throw new ApiError(400,'Invalid review request.');});
    const parsed=schema.safeParse(raw);
    if(!parsed.success)throw new ApiError(400,'Check your review and rating.');
    const data=parsed.data;
    const ref=db.collection('product_reviews').doc(data.orderId);
    const result=await db.runTransaction(async tx=>{
      const orderRef=db.collection('seller_orders').doc(data.orderId);
      const [orderSnap,reviewSnap,adminSnap]=await Promise.all([
        tx.get(orderRef),tx.get(ref),tx.get(db.collection('roles_admin').doc(uid)),
      ]);
      const order=orderSnap.data();
      if(!orderSnap.exists)throw new ApiError(404,'Order no longer exists.');
      const now=Timestamp.now();
      if(data.action==='submit'){
        if(order!.buyerUid!==uid)throw new ApiError(403,'Only the buyer may review this purchase.');
        if(order!.status!=='completed')throw new ApiError(409,'You can review an order after delivery is completed.');
        if(reviewSnap.exists)throw new ApiError(409,'This order already has a review.');
        tx.create(ref,{buyerUid:uid,orderId:data.orderId,productId:order!.productId,
          sellerId:order!.sellerId,rating:data.rating,comment:data.comment,
          status:'pending',verifiedPurchase:true,createdAt:now,updatedAt:now});
        return {reviewId:ref.id,status:'pending'};
      }
      if(!adminSnap.exists)throw new ApiError(403,'Only administrators can moderate reviews.');
      if(!reviewSnap.exists||reviewSnap.data()?.status!=='pending')throw new ApiError(409,'Review is not awaiting moderation.');
      const status=data.action==='publish'?'published':'rejected';
      tx.update(ref,{status,moderatedAt:now,moderatedBy:uid,updatedAt:now});
      tx.create(db.collection('notifications').doc(reviewSnap.data()!.buyerUid).collection('items').doc(),{
        title:data.action==='publish'?'Your product review is published':'Your product review was not published',
        orderId:data.orderId,createdAt:now,read:false,
      });
      return {reviewId:ref.id,status};
    });
    return Response.json(result);
  }catch(error){return safeResponse(error);}
}
