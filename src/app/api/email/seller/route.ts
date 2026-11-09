import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { mailId, processMailQueue, queueMail } from '@/lib/server/mail';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({kind:z.enum(['application','access']),id:z.string().min(1).max(128).regex(/^[^/]+$/)}).strict();
export async function POST(request:NextRequest) {
  try {
    const {uid,db,auth}=await verifiedUser(request);
    const raw=await request.text();if(raw.length>512)throw new ApiError(413,'Request too large.');
    const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)throw new ApiError(400,'Invalid seller update.');
    const {kind,id}=parsed.data;
    await db.runTransaction(async tx=>{
      const target=db.collection(kind==='access'?'sellers':'seller_applications').doc(id);
      const [snap,admin]=await Promise.all([tx.get(target),tx.get(db.collection('roles_admin').doc(uid))]);
      if(!snap.exists)throw new ApiError(404,'Seller information not found.');
      const data=snap.data()!;
      if(!admin.exists&&!(kind==='application'&&data.ownerUid===uid&&data.status==='pending'))throw new ApiError(403,'This account cannot send that update.');
      // Content, recipient and dedupe key always come from committed server data, never the browser.
      const owner=data.ownerUid;if(typeof owner!=='string'||!owner)return;
      const stamp=(kind==='access'?data.updatedAt:data.reviewedAt||data.submittedAt)?.toMillis?.();
      if(!stamp)throw new ApiError(409,'Save the seller change before sending its update.');
      const key=mailId(`${kind}/${id}/${data.status}/${stamp}`);
      const existing=await tx.get(db.collection('mail_outbox').doc(key));if(existing.exists)return;
      if(!admin.exists){
        const quotaRef=db.collection('mail_limits').doc(`seller_${uid}_${Math.floor(Date.now()/3600_000)}`);
        const quota=await tx.get(quotaRef);
        if((quota.data()?.count||0)>=3)throw new ApiError(429,'Please wait before requesting another application email.');
        tx.set(quotaRef,{count:(quota.data()?.count||0)+1});
      }
      const expiry=data.accessEndsAt?.toDate?.()?.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'});
      const title=kind==='access'?'Your seller access was updated':data.status==='approved'?'Seller application approved':data.status==='rejected'?'Seller application declined':'Seller application received';
      const message=kind==='access'?`${data.businessName}: status ${data.status}; ${data.accessType} access${expiry?` until ${expiry}`:''}. Open your seller studio to review your access.`:data.status==='pending'?`${data.businessName}: your application is awaiting review. We will update you when it has been reviewed.`:`${data.businessName}: your application was ${data.status==='approved'?'approved. Open your seller studio to review your trial access.':'declined. Contact support if you need help.'}`;
      // Stable outbox ID makes repeated browser delivery requests harmless.
      queueMail(tx,db,owner,{details:[{label:'Business',value:String(data.businessName).slice(0,200)},...(kind==='access'?[{label:'Plan',value:String(data.accessType)},{label:'Status',value:String(data.status)},...(expiry?[{label:'Access until',value:expiry}]:[])]:[])],template:kind==='access'?'seller_access_updated':data.status==='approved'?'seller_application_approved':data.status==='rejected'?'seller_application_declined':'seller_application_received',title,message,href:kind==='application'&&data.status!=='approved'?'/become-a-seller':'/seller/dashboard'},key);
      if(kind==='application'&&data.status==='pending'&&process.env.MAIL_SUPPORT_EMAIL)queueMail(tx,db,owner,{template:'seller_application_new',title:'New seller application',message:`${data.businessName} submitted an application. Review it in your admin workspace.`,href:'/admin'},`${key}-team`,false,process.env.MAIL_SUPPORT_EMAIL);
    });
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Seller mail worker unavailable');}});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(error instanceof SyntaxError)return safeResponse(new ApiError(400,'Invalid seller update.'));return safeResponse(error);}
}
