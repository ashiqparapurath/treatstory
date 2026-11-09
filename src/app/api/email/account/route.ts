import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, getServerFirebase, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { deliverMailJob, mailConfig } from '@/lib/server/mail';
import { enqueueAccountEmail } from '@/lib/server/account-email';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const FLOW='outbox-v2';
const headers={'Cache-Control':'no-store','X-TreatStory-Email-Flow':FLOW};
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('reset-password'),email:z.string().trim().email().max(254)}).strict(),
  z.object({action:z.enum(['welcome','verify-email'])}).strict(),
]);
/** Public deployment marker only: no credentials, addresses, quota state or database reads. */
export async function GET(){return Response.json({ok:true,flow:FLOW},{headers});}
export async function POST(request:NextRequest) {
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Open TreatStory to continue.');
    const text=await request.text();if(text.length>1024)throw new ApiError(413,'Request is too large.');
    const parsed=schema.safeParse(JSON.parse(text));if(!parsed.success)throw new ApiError(400,'Check your account email request.');
    const data=parsed.data;
    const firebase:ReturnType<typeof getServerFirebase>&{uid?:string}=data.action==='reset-password'?getServerFirebase():await verifiedUser(request);
    const {db,auth}=firebase;
    try{mailConfig();}catch{throw new ApiError(503,'Account emails are temporarily unavailable. Please contact support.');}
    const jobId=await enqueueAccountEmail(db,data.action,data.action==='reset-password'?'':firebase.uid!,data.action==='reset-password'?data.email:undefined);
    after(async()=>{try{await deliverMailJob(db,auth,jobId);}catch{console.error('Account mail worker unavailable');}});
    // Success is returned only after the durable job transaction has committed.
    return Response.json({ok:true,...(data.action==='reset-password'?{message:'If an account uses this email, a reset link will arrive shortly.'}:{queued:true})},{headers});
  }catch(error){
    const response=safeResponse(error instanceof SyntaxError?new ApiError(400,'Invalid account request.'):error);
    response.headers.set('X-TreatStory-Email-Flow',FLOW);return response;
  }
}
