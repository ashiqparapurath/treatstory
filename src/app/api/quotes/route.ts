import { quoteFulfillmentSchema } from '@/lib/quote-checkout-schema';
import { convertQuote } from '@/lib/server/quote-order';
import {firestoreDocumentId} from '@/lib/document-id';
import { readJsonBody } from '@/lib/server/request-body';
import { queueNotification, processMailQueue } from '@/lib/server/mail';
import { after } from 'next/server';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const quoteSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), sellerId: firestoreDocumentId().min(10),
    productId: z.union([z.literal(''),firestoreDocumentId()]).default(''),
    occasion: z.string().trim().min(2).max(120), description: z.string().trim().min(15).max(2000),
    budget: z.number().finite().min(0).max(10000000), requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    referenceUrl: z.union([z.literal(''), z.string().regex(/^\/api\/reference-media\/[a-zA-Z0-9_-]+$/)]).default(''),
  }).strict(),
  z.object({ action: z.literal('quote'), id: firestoreDocumentId(), price: z.number().positive().max(10000000),
    note: z.string().trim().min(2).max(800) }).strict(),
  z.object({ action: z.literal('decline'), id: firestoreDocumentId() }).strict(),
  z.object({ action: z.literal('cancel'), id: firestoreDocumentId() }).strict(),
  z.object({ action: z.literal('accept'), id: firestoreDocumentId(), fulfillment:quoteFulfillmentSchema }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const {uid,db,auth} = await verifiedUser(request);
    if (Number(request.headers.get('content-length') || 0)>10_000) throw new ApiError(413,'Quote request is too large.');
    const raw:unknown = await readJsonBody(request,10000);
    const parsed = quoteSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400,'Review the custom order fields.');
    const data = parsed.data;
    if (data.action==='create') {

      const date = Date.parse(data.requestedDate+'T00:00:00Z');
      const today = Date.parse(new Date(Date.now()+330*60_000).toISOString().slice(0,10)+'T00:00:00Z');
      if (!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==data.requestedDate||date<today||date>today+90*86400000) throw new ApiError(400,'Choose a date within the next 90 days.');
      const result = await db.runTransaction(async tx=>{
        const sellerRef=db.collection('sellers').doc(data.sellerId);
        const limitRef=db.collection('quote_limits').doc(uid+'_'+new Date().toISOString().slice(0,10));
        const productRef=data.productId ? db.collection('marketplace_products').doc(data.productId) : null;
        const [sellerSnap,limitSnap,productSnap]=await Promise.all([tx.get(sellerRef),tx.get(limitRef),productRef?tx.get(productRef):Promise.resolve(null)]);
        const [buyerDeletion, sellerDeletion] = await Promise.all([tx.get(db.collection('account_deletions').doc(uid)),tx.get(db.collection('account_deletions').doc(data.sellerId))]);
        if (buyerDeletion.exists || sellerDeletion.exists) throw new ApiError(409,'This account is closing and cannot accept new custom-order requests.');
        const mediaRef=data.referenceUrl?db.doc('media_assets/'+data.referenceUrl.split('/').at(-1)):null;
        const media=mediaRef?await tx.get(mediaRef):null;
        if(mediaRef&&(!media?.exists||media.data()?.ownerUid!==uid||media.data()?.kind!=='reference'||media.data()?.status!=='ready'||media.data()?.quoteId))throw new ApiError(403,'Upload your own new reference photo.');
        const now=Timestamp.now();
        if (!sellerSnap.exists || sellerSnap.data()?.status!=='active' ||
            !sellerSnap.data()?.isOpen || !sellerSnap.data()?.accessEndsAt?.toMillis ||
            sellerSnap.data()!.accessEndsAt.toMillis()<=now.toMillis())
          throw new ApiError(409,'Seller is not accepting new custom requests.');
        if (productRef && (!productSnap?.exists || productSnap.data()?.sellerId!==data.sellerId || productSnap.data()?.status!=='published'))
          throw new ApiError(409,'The selected product is not available from this seller.');
        const count=limitSnap.data()?.count||0;
        if(count>=5)throw new ApiError(429,'Daily limit of five quote requests reached.');
        const ref=db.collection('custom_quotes').doc();
        if(mediaRef)tx.update(mediaRef,{quoteId:ref.id});
        tx.create(ref,{buyerUid:uid,sellerId:data.sellerId,productId:data.productId,sellerName:sellerSnap.data()?.businessName || 'Creator',productName:productSnap?.data()?.name || '',occasion:data.occasion,
          description:data.description,budget:data.budget,requestedDate:data.requestedDate,
          referenceUrl:data.referenceUrl,status:'requested',quotedPrice:null,quotedNote:'',createdAt:now,updatedAt:now});
        tx.set(limitRef,{buyerUid:uid,count:count+1,updatedAt:now});
        queueNotification(tx,db,data.sellerId,
          {template:'quote_requested',title:'New custom-order request',message:`${productSnap?.data()?.name || data.occasion}: review the buyer’s preferences, budget and requested date.`,kind:'quote',href:'/custom-orders',orderId:'',createdAt:now,read:false});
        return {id:ref.id,status:'requested'};
      });
      after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
      return Response.json(result);
    }
    const result=await db.runTransaction(async tx=>{
      const ref=db.collection('custom_quotes').doc(data.id);
      const snap=await tx.get(ref);
      if(!snap.exists)throw new ApiError(404,'Quote request not found.');
      const q=snap.data()!;
      if(data.action==='accept'&&q.orderId){
        if(q.buyerUid!==uid)throw new ApiError(403,'Only the buyer can access this order.');
        return {id:data.id,status:q.status,orderId:q.orderId,repeated:true};
      }
      const now=Timestamp.now();
      // Seller access must remain valid for a new quote or an accepted quote.
      const sellerSnap = data.action==='quote'||data.action==='accept'
        ? await tx.get(db.collection('sellers').doc(q.sellerId)) : null;
      if (sellerSnap && (!sellerSnap.exists || sellerSnap.data()?.status!=='active' ||
          !sellerSnap.data()?.isOpen || !sellerSnap.data()?.accessEndsAt?.toMillis ||
          sellerSnap.data()!.accessEndsAt.toMillis()<=now.toMillis()))
        throw new ApiError(409,'This seller is not currently accepting custom orders.');
      if(data.action==='cancel'){
        if(q.buyerUid!==uid||!(['requested','quoted'].includes(q.status)||(q.status==='accepted'&&!q.orderId)))throw new ApiError(409,'This request cannot be cancelled. Manage placed orders from Orders.');
        tx.update(ref,{status:'cancelled',updatedAt:now});return {id:data.id,status:'cancelled'};
      }
      if(data.action==='quote'){
        if(q.sellerId!==uid)throw new ApiError(403,'Only the seller may quote.');
        if(q.status!=='requested')throw new ApiError(409,'This quote is no longer open.');
        const expiresAt=Timestamp.fromMillis(now.toMillis()+7*86400000);
        tx.update(ref,{status:'quoted',quotedPrice:data.price,quotedNote:data.note,quotedAt:now,expiresAt,updatedAt:now});
        queueNotification(tx,db,q.buyerUid,
          {template:'quote_ready',details:[{label:'Quoted price',value:`₹${data.price.toLocaleString('en-IN')}`}],title:'Your custom quote is ready',message:`${q.productName || q.occasion}: review the seller’s price and included details before accepting.`,kind:'quote',href:'/custom-orders',orderId:'',createdAt:now,read:false});
        return {id:data.id,status:'quoted'};
      }
      if(data.action==='decline'){
        if(q.sellerId!==uid||q.status!=='requested')throw new ApiError(403,'Only the seller may decline an open request.');
        tx.update(ref,{status:'declined',updatedAt:now});
        queueNotification(tx,db,q.buyerUid,{template:'quote_declined',title:'Custom request declined',message:`${q.productName || q.occasion}: this creator cannot take the request. You can ask another creator.`,kind:'quote',href:'/custom-orders',orderId:'',createdAt:now,read:false});
        return {id:data.id,status:'declined'};
      }
      if(q.buyerUid!==uid)throw new ApiError(403,'Only the buyer can accept a quote.');
      if(q.orderId)return {id:data.id,status:q.status,orderId:q.orderId,repeated:true};
      if(q.status!=='quoted'||!q.expiresAt?.toMillis||q.expiresAt.toMillis()<=now.toMillis())
        throw new ApiError(409,'This quote has expired or is no longer available.');
      return convertQuote(tx,db,uid,ref,q,sellerSnap!.data()!,data.fulfillment);
    });
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
      return Response.json(result);
  }catch(error){return safeResponse(error);}
}
