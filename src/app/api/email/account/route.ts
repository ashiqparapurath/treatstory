import { after, type NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ApiError, getServerFirebase, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { deliverMailJob, mailConfig, mailId, queueMail, type MailContent } from '@/lib/server/mail';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('reset-password'),email:z.string().trim().email().max(254)}).strict(),
  z.object({action:z.enum(['welcome','verify-email'])}).strict(),
]);
export async function POST(request:NextRequest) {
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Open TreatStory to continue.');
    const text=await request.text();if(text.length>1024)throw new ApiError(413,'Request is too large.');
    const parsed=schema.safeParse(JSON.parse(text));if(!parsed.success)throw new ApiError(400,'Check your account email request.');
    const data=parsed.data;
    const firebase:ReturnType<typeof getServerFirebase>&{uid?:string}=data.action==='reset-password'?getServerFirebase():await verifiedUser(request);
    const {db,auth}=firebase;
    let config:ReturnType<typeof mailConfig>;
    try{config=mailConfig();}catch{throw new ApiError(503,'Account emails are temporarily unavailable. Please contact support.');}
    const hour=Math.floor(Date.now()/3600_000);
    const identity=data.action==='reset-password'?mailId(data.email.toLowerCase()):firebase.uid!;
    const allowed=await db.runTransaction(async tx=>{
      const ownRef=db.collection('mail_limits').doc(`${identity}_${hour}`);
      const globalRef=db.collection('mail_limits').doc(`account_global_${hour}`);
      const [own,global]=await Promise.all([tx.get(ownRef),tx.get(globalRef)]);
      if((own.data()?.count||0)>=3||(global.data()?.count||0)>=100)return false;
      tx.set(ownRef,{count:(own.data()?.count||0)+1,createdAt:Timestamp.now()});
      tx.set(globalRef,{count:(global.data()?.count||0)+1,createdAt:Timestamp.now()});return true;
    });
    const neutral=()=>Response.json({ok:true,message:'If an account uses this email, a reset link will arrive shortly.'},{headers:{'Cache-Control':'no-store'}});
    if(!allowed){if(data.action==='reset-password')return neutral();throw new ApiError(429,'Please wait before requesting another account email.');}
    let user;
    if(data.action==='reset-password') {
      try{user=await auth.getUserByEmail(data.email);}
      catch(error){if((error as {code?:string})?.code!=='auth/user-not-found')console.error('Account email lookup unavailable');return neutral();}
      if(user.disabled||!user.email)return neutral();
    }else{
      user=await auth.getUser(firebase.uid!);
      if(user.disabled||!user.email)throw new ApiError(400,'This account cannot receive email.');
      if(data.action==='verify-email'&&user.emailVerified)return Response.json({ok:true,alreadyVerified:true});
    }
    let jobId='';
    try {
      let content:MailContent;
      if(data.action==='reset-password')content={template:'password_reset',title:'Reset your password',message:'Use the secure link below to choose a new password for your TreatStory account. If you did not request this, you can ignore this email.',href:await auth.generatePasswordResetLink(user.email,{url:`${config.origin}/login`}),label:'Reset password'};
      else if(data.action==='verify-email')content={template:'verify_email',title:'Verify your email address',message:'Confirm this email address for your TreatStory account. This helps keep your account details up to date.',href:await auth.generateEmailVerificationLink(user.email,{url:`${config.origin}/account`}),label:'Verify email address'};
      else content={template:'welcome',title:'Welcome to TreatStory',message:'Your account is ready. Discover handmade finds, keep your favourites and track your orders from your profile.',href:'/account',label:'Open your profile'};
      const id=data.action==='welcome'?mailId(`welcome/${user.uid}/once`):undefined;
      await db.runTransaction(async tx=>{
        if(id){const existing=await tx.get(db.collection('mail_outbox').doc(id));if(existing.exists){jobId=id;return;}}
        jobId=queueMail(tx,db,user.uid,content,id,data.action!=='welcome',user.email);
      });
    }catch(error){
      if(data.action!=='reset-password')throw error;
      // Do not reveal an existing account via a different error response.
      console.error('Password reset email could not be queued');return neutral();
    }
    // Account links get a targeted attempt instead of waiting behind the business-email backlog.
    after(async()=>{try{await deliverMailJob(db,auth,jobId);}catch{console.error('Account mail worker unavailable');}});
    return data.action==='reset-password'?neutral():Response.json({ok:true,queued:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(error instanceof SyntaxError)return safeResponse(new ApiError(400,'Invalid account request.'));return safeResponse(error);}
}
