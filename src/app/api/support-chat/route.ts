import { readJsonBody } from '@/lib/server/request-body';
import { queueNotification } from '@/lib/server/mail';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const lockedKey = z.object({
  publicKey: z.object({kty:z.literal('RSA'),alg:z.string().optional(),e:z.string(),n:z.string(),ext:z.boolean().optional(),key_ops:z.array(z.string()).optional()}).passthrough(),
  lockedPrivateKey:z.string().min(100).max(12000),salt:z.string().min(10).max(128),
  iv:z.string().min(10).max(128),version:z.literal(1),
}).strict();
const encrypted = z.object({
  ciphertext:z.string().min(10).max(6000),iv:z.string().min(10).max(40),
  ownerKey:z.string().min(100).max(2000),teamKey:z.string().min(100).max(2000),
  version:z.literal(1),
}).strict();
const payload = z.discriminatedUnion('action',[
  z.object({action:z.literal('registerUserKey'),key:lockedKey}).strict(),
  z.object({action:z.literal('registerTeamKey'),key:lockedKey}).strict(),
  z.object({action:z.literal('create'),category:z.enum(['order','delivery','payment','seller','account','other']),encrypted,orderId:z.string().max(160).default('')}).strict(),
  z.object({action:z.literal('send'),ticketId:z.string().min(1).max(160),encrypted}).strict(),
  z.object({action:z.literal('close'),ticketId:z.string().min(1).max(160)}).strict(),
]);
async function isAdmin(db: any,uid:string){return (await db.collection('roles_admin').doc(uid).get()).exists;}
const checkId=(value:string)=>{if(value.includes('/')||value==='.'||value==='..')throw new ApiError(400,'Invalid conversation identifier.');return value;};

export async function GET(request:NextRequest){
  try {
    const {uid,db}=await verifiedUser(request);
    const admin=await isAdmin(db,uid);
    const [team,own]=await Promise.all([
      db.collection('support_chat_keys').doc('team').get(),
      db.collection('support_chat_keys').doc('user_'+uid).get(),
    ]);
    const keys:Record<string,unknown>={teamPublicKey:team.data()?.publicKey??null,ownKey:own.exists?own.data():null};
    if(admin)keys.teamKey=team.exists?team.data():null;
    return Response.json(keys,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return safeResponse(e);}
}

export async function POST(request:NextRequest){
  try {
    const {uid,db}=await verifiedUser(request);
    const raw=await readJsonBody(request,20000);
    const result=payload.safeParse(raw);
    if(!result.success)throw new ApiError(400,'Invalid encrypted support request.');
    const data=result.data;
    const admin=await isAdmin(db,uid);
    if(data.action==='registerTeamKey'){
      if(!admin)throw new ApiError(403,'Administrator access required.');
      const ref=db.collection('support_chat_keys').doc('team');
      await db.runTransaction(async tx=>{
        if((await tx.get(ref)).exists)throw new ApiError(409,'Support team encryption key already exists.');
        tx.create(ref,{...data.key,createdAt:Timestamp.now(),createdBy:uid});
      });
      return Response.json({ok:true});
    }
    if(data.action==='registerUserKey'){
      const ref=db.collection('support_chat_keys').doc('user_'+uid);
      await db.runTransaction(async tx=>{
        if((await tx.get(ref)).exists)throw new ApiError(409,'Your support encryption key already exists.');
        tx.create(ref,{...data.key,createdAt:Timestamp.now()});
      });
      return Response.json({ok:true});
    }
    if(data.action==='create'){
      const now=Timestamp.now();
      const date=new Date(Date.now()+330*60000).toISOString().slice(0,10);
      const output=await db.runTransaction(async tx=>{
        const keyRef=db.collection('support_chat_keys').doc('user_'+uid);
        const teamRef=db.collection('support_chat_keys').doc('team');
        const quotaRef=db.collection('support_limits').doc(uid+'_'+date);
        const orderRef=data.orderId?db.collection('seller_orders').doc(checkId(data.orderId)):null;
        const [ownerKey,teamKey,quota,order]=await Promise.all([
          tx.get(keyRef),tx.get(teamRef),tx.get(quotaRef),orderRef?tx.get(orderRef):Promise.resolve(null),
        ]);
        if(!ownerKey.exists||!teamKey.exists)throw new ApiError(409,'Encryption keys are not configured yet.');
        if((quota.data()?.count||0)>=5)throw new ApiError(429,'Daily support conversation limit reached.');
        if(orderRef&&(!order?.exists||![order.data()?.buyerUid,order.data()?.sellerId].includes(uid)))throw new ApiError(403,'Order unavailable.');
        const ref=db.collection('support_tickets').doc();
        tx.create(ref,{ownerUid:uid,subject:'Encrypted support conversation',category:data.category,
          orderId:data.orderId,status:'open',encrypted:true,ownerPublicKey:ownerKey.data()!.publicKey,
          teamPublicKey:teamKey.data()!.publicKey,createdAt:now,updatedAt:now,lastSenderUid:uid});
        tx.create(ref.collection('messages').doc(),{...data.encrypted,senderUid:uid,createdAt:now});
        tx.set(quotaRef,{ownerUid:uid,date,count:(quota.data()?.count||0)+1,updatedAt:now});
        return {ticketId:ref.id};
      });
      return Response.json(output);
    }
    const ticketRef=db.collection('support_tickets').doc(checkId(data.ticketId));
    await db.runTransaction(async tx=>{
      const ticket=await tx.get(ticketRef);
      if(!ticket.exists||ticket.data()?.encrypted!==true)throw new ApiError(404,'Encrypted conversation unavailable.');
      const ticketData=ticket.data()!;
      if(!admin&&ticketData.ownerUid!==uid)throw new ApiError(403,'Conversation is private.');
      if(ticketData.status==='closed')throw new ApiError(409,'This conversation is closed.');
      const now=Timestamp.now();
      if(data.action==='close'){
        tx.update(ticketRef,{status:'closed',updatedAt:now});
      }else{
        if(data.action!=='send')throw new ApiError(400,'Invalid action.');
        tx.create(ticketRef.collection('messages').doc(),{...data.encrypted,senderUid:uid,createdAt:now});
        tx.update(ticketRef,{status:admin?'responded':'open',updatedAt:now,lastSenderUid:uid});
        if(admin)queueNotification(tx,db,ticketData.ownerUid,{
          template:'support_reply',title:'New encrypted support reply',
          message:'TreatStory support sent you a private message. Unlock your support chat to read it.',
          kind:'support',href:'/support',orderId:ticketData.orderId||'',createdAt:now,read:false,
        });
      }
    });
    return Response.json({ok:true});
  }catch(e){return safeResponse(e);}
}
