import { queueNotification, queueMail, processMailQueue } from '@/lib/server/mail';
import { after } from 'next/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'),
    subject: z.string().trim().min(5).max(140),
    category: z.enum(['order','delivery','payment','seller','account','other']),
    message: z.string().trim().min(15).max(2000),
    orderId: z.string().trim().max(160).default(''),
  }).strict(),
  z.object({ action: z.literal('reply'),
    ticketId: z.string().min(1).max(160), message: z.string().trim().min(5).max(2000),
  }).strict(),
  z.object({ action: z.literal('close'),
    ticketId: z.string().min(1).max(160),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const {uid,db,auth}=await verifiedUser(request);
    if(Number(request.headers.get('content-length')||0)>5000)throw new ApiError(413,'Support message is too large.');
    const raw:unknown=await request.json().catch(()=>{throw new ApiError(400,'Invalid support request.');});
    const parsed=requestSchema.safeParse(raw);
    if(!parsed.success)throw new ApiError(400,'Review the support details.');
    const data=parsed.data;
    if(data.action==='create'){
      const date=new Date(Date.now()+330*60000).toISOString().slice(0,10);
      const result=await db.runTransaction(async tx=>{
        const quotaRef=db.collection('support_limits').doc(uid+'_'+date);
        const orderRef=data.orderId?db.collection('seller_orders').doc(data.orderId):null;
        const [quota,order]=await Promise.all([tx.get(quotaRef),orderRef?tx.get(orderRef):Promise.resolve(null)]);
        if((quota.data()?.count||0)>=5)throw new ApiError(429,'You have reached the daily support request limit.');
        if(orderRef && (!order?.exists || ![order.data()?.buyerUid,order.data()?.sellerId].includes(uid)))
          throw new ApiError(403,'This order is not available to your account.');
        const ref=db.collection('support_tickets').doc();
        const now=Timestamp.now();
        tx.create(ref,{ownerUid:uid,subject:data.subject,category:data.category,
          orderId:data.orderId,message:data.message,status:'open',response:'',createdAt:now,updatedAt:now});
        tx.set(quotaRef,{ownerUid:uid,date,count:(quota.data()?.count||0)+1,updatedAt:now});
        if(process.env.MAIL_SUPPORT_EMAIL)queueMail(tx,db,uid,{title:'New support request',message:`A customer submitted “${data.subject}”. Open the support inbox to review it.`,href:'/admin'},undefined,false,process.env.MAIL_SUPPORT_EMAIL);
        queueNotification(tx,db,uid,{title:'Support request received',message:`We received “${data.subject}”. Open your support requests to track our response.`,href:'/support',kind:'support',createdAt:now,read:false});
        return {ticketId:ref.id,status:'open'};
      });
      after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
      return Response.json(result);
    }
    const adminRef=db.collection('roles_admin').doc(uid);
    const result=await db.runTransaction(async tx=>{
      const ticketRef=db.collection('support_tickets').doc(data.ticketId);
      const [admin,ticket]=await Promise.all([tx.get(adminRef),tx.get(ticketRef)]);
      if(!admin.exists)throw new ApiError(403,'Only administrators can respond to support requests.');
      if(!ticket.exists)throw new ApiError(404,'Support ticket not found.');
      const previous=ticket.data()!;
      if(previous.status==='closed')throw new ApiError(409,'This request is already closed.');
      const now=Timestamp.now();
      tx.update(ticketRef,{status:data.action==='close'?'closed':'responded',
        ...(data.action==='reply'?{response:data.message,respondedBy:uid}:{}),updatedAt:now});
      queueNotification(tx,db,previous.ownerUid,{
        title:data.action==='close'?'Your support request has been closed':'TreatStory support replied to your request',
        message:data.action==='close'?`“${previous.subject}” was marked closed. You can open a new request if you need more help.`:`There is a response to “${previous.subject}”. Open your support request to read it.`,kind:'support',href:'/support',
        orderId:previous.orderId||'',createdAt:now,read:false,
      });
      return {ticketId:data.ticketId,status:data.action==='close'?'closed':'responded'};
    });
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
      return Response.json(result);
  }catch(error){return safeResponse(error);}
}
