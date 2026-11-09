import { after, type NextRequest } from 'next/server';
import { ApiError, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { mailConfig, mailId, processMailQueue, queueMail } from '@/lib/server/mail';

export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Welcome mail only. Reset/verification use the client authentication SDK's built-in email. */
export async function POST(request:NextRequest) {
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Open TreatStory to continue.');
    const {uid,db,auth}=await verifiedUser(request);
    const text=await request.text();if(text.length>256)throw new ApiError(413,'Request is too large.');
    const data=JSON.parse(text);
    if(!data||data.action!=='welcome'||Object.keys(data).length!==1)throw new ApiError(400,'Invalid account email request.');
    try{mailConfig();}catch{throw new ApiError(503,'Welcome emails are temporarily unavailable. Your account is ready to use.');}
    const user=await auth.getUser(uid);
    if(!user.email||user.disabled)throw new ApiError(400,'This account cannot receive email.');
    const id=mailId(`welcome/${uid}/once`);
    await db.runTransaction(async tx=>{
      const existing=await tx.get(db.collection('mail_outbox').doc(id));if(existing.exists)return;
      queueMail(tx,db,uid,{title:'Welcome to TreatStory',message:'Your account is ready. Discover handmade finds, keep your favourites and track your orders from your profile.',href:'/account',label:'Open your profile'},id);
    });
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Welcome mail worker unavailable');}});
    return Response.json({ok:true,queued:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(error instanceof SyntaxError)return safeResponse(new ApiError(400,'Invalid account request.'));return safeResponse(error);}
}
