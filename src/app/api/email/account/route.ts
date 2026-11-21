import { readJsonBody } from '@/lib/server/request-body';
import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { deliverMailJob, mailConfig } from '@/lib/server/mail';
import { enqueueAccountEmail } from '@/lib/server/account-email';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const FLOW='outbox-v2';
const headers={'Cache-Control':'no-store','X-TreatStory-Email-Flow':FLOW};
// Password resets now go directly from the sign-in page to Firebase Auth.
// The mail worker still completes any reset messages queued before migration.
const schema=z.object({action:z.enum(['welcome','verify-email'])}).strict();
/** Public deployment marker only: no credentials, addresses, quota state or database reads. */
export async function GET(){return Response.json({ok:true,flow:FLOW},{headers});}
export async function POST(request:NextRequest) {
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Open TreatStory to continue.');
    const raw=await readJsonBody(request,1024);
    const parsed=schema.safeParse(raw);if(!parsed.success)throw new ApiError(400,'Check your account email request.');
    const data=parsed.data;
    const {db,auth,uid}=await verifiedUser(request);
    // Google sign-in normally provides an already verified email address.
    if(data.action==='verify-email' && (await auth.getUser(uid)).emailVerified)
      return Response.json({ok:true,alreadyVerified:true},{headers});
    try{mailConfig();}catch{throw new ApiError(503,'Account emails are temporarily unavailable. Please contact support.');}
    const jobId=await enqueueAccountEmail(db,data.action,uid);
    after(async()=>{try{await deliverMailJob(db,auth,jobId);}catch{console.error('Account mail worker unavailable');}});
    return Response.json({ok:true,queued:true},{headers});
  }catch(error){
    const response=safeResponse(error instanceof SyntaxError?new ApiError(400,'Invalid account request.'):error);
    response.headers.set('X-TreatStory-Email-Flow',FLOW);return response;
  }
}
