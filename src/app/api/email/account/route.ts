import { after, type NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ApiError, getServerFirebase, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { mailConfig, mailId, processMailQueue, queueMail } from '@/lib/server/mail';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('reset-password'),email:z.string().trim().email().max(254)}).strict(),
  z.object({action:z.enum(['welcome','verify-email'])}).strict(),
]);
export async function POST(request:NextRequest) {
  try {
    let config:ReturnType<typeof mailConfig>;
    try{config=mailConfig();}catch{throw new ApiError(503,'Account emails are temporarily unavailable. Please contact support.');}
    // Only our own form may initiate account messages; no public arbitrary-recipient mail endpoint.
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Open TreatStory to continue.');
    const text=await request.text();if(text.length>1024)throw new ApiError(413,'Request is too large.');
    const data=schema.safeParse(JSON.parse(text));if(!data.success)throw new ApiError(400,'Check your email address and try again.');
    const firebase:ReturnType<typeof getServerFirebase>&{uid?:string}=data.data.action==='reset-password'?getServerFirebase():await verifiedUser(request);
    const {db,auth}=firebase;
    const hour=Math.floor(Date.now()/3600_000);
    const identity=data.data.action==='reset-password'?mailId(data.data.email.toLowerCase()):firebase.uid!;
    const quota=db.collection('mail_limits').doc(`${identity}_${hour}`);
    // Public reset responses intentionally do not reveal whether an account exists or reached its limit.
    const allowed=await db.runTransaction(async tx=>{
      const globalRef=db.collection('mail_limits').doc(`global_${hour}`);
      const [own,global]=await Promise.all([tx.get(quota),tx.get(globalRef)]);
      if((own.data()?.count||0)>=3||(global.data()?.count||0)>=100)return false;
      tx.set(quota,{count:(own.data()?.count||0)+1,createdAt:Timestamp.now()});
      tx.set(globalRef,{count:(global.data()?.count||0)+1,createdAt:Timestamp.now()});return true;
    });
    const neutral=()=>Response.json({ok:true,message:'If an account uses this email, a reset link will arrive shortly.'},{headers:{'Cache-Control':'no-store'}});
    if(!allowed){if(data.data.action==='reset-password')return neutral();throw new ApiError(429,'Please wait before requesting another account email.');}
    const action=data.data.action;
    if(action==='reset-password') {
      try {
        const user=await auth.getUserByEmail(data.data.email);
        if(!user.disabled){
          const link=await auth.generatePasswordResetLink(user.email!,{url:`${config.origin}/login`});
          await db.runTransaction(async tx=>{queueMail(tx,db,user.uid,{title:'Reset your password',message:'Use this link to choose a new password. If you did not request a reset, you can ignore this email. Your current password stays unchanged.',href:link,label:'Reset password'},undefined,true,user.email!);});
        }
      }catch(error){if((error as {code?:string})?.code!=='auth/user-not-found')console.error('Account reset email could not be queued');}
      after(async()=>{try{await processMailQueue(db,auth,5);}catch{console.error('Account mail worker unavailable');}});
      return neutral();
    }
    const user=await auth.getUser(firebase.uid!);
    if(!user.email||user.disabled)throw new ApiError(400,'This account cannot receive email.');
    if(action==='verify-email'&&user.emailVerified)return Response.json({ok:true,alreadyVerified:true});
    const id=mailId(`${action}/${user.uid}/${action==='welcome'?'once':hour}`);
    const ref=db.collection('mail_outbox').doc(id);
    // Generate outside transaction; retry the transaction without generating extra action links.
    const link=!user.emailVerified?await auth.generateEmailVerificationLink(user.email,{url:`${config.origin}/account`}):`${config.origin}/account`;
    await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists)return;
      queueMail(tx,db,user.uid,{title:action==='welcome'?'Welcome to TreatStory':'Verify your email address',
        message:!user.emailVerified?'Thanks for joining TreatStory. Confirm this email address to keep your account details up to date. If you did not create this account, you can ignore this email.':'Your TreatStory account is ready. Explore handmade finds and manage your orders from your profile.',
        href:link,label:!user.emailVerified?'Verify email address':'Open your profile'},id,true,user.email);
    });
    after(async()=>{try{await processMailQueue(db,auth,5);}catch{console.error('Account mail worker unavailable');}});
    return Response.json({ok:true,queued:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(error instanceof SyntaxError)return safeResponse(new ApiError(400,'Invalid account request.'));return safeResponse(error);}
}
