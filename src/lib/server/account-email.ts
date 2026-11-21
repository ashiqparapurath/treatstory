import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiError } from '@/lib/server/firebase-admin';
import { mailId, queueMail, type MailContent } from '@/lib/server/mail';

/** Welcome and verification only; Firebase Auth sends reset emails itself.
 * Quota and durable intent commit together for Apps Script messages.
 */
export async function enqueueAccountEmail(db:Firestore,action:'verify-email'|'welcome',uid:string) {
  const hour=Math.floor(Date.now()/3600_000);
  const ownRef=db.collection('mail_limits').doc(`account_v2_${uid}_${hour}`);
  const globalRef=db.collection('mail_limits').doc(`account_v2_global_${hour}`);
  const id=action==='welcome'?mailId(`welcome/${uid}/once`):undefined;
  const content:MailContent=action==='verify-email'
    ?{template:'verify_email',title:'Verify your email address',message:'Confirm this email address for your TreatStory account.',href:'',label:'Verify email address'}
    :{template:'welcome',title:'Welcome to TreatStory',message:'Your account is ready. Discover handmade finds, build your wishlist and track your orders from your profile.',href:'/account',label:'Open your profile'};
  return db.runTransaction(async tx=>{
    const [own,global,existing]=await Promise.all([tx.get(ownRef),tx.get(globalRef),id?tx.get(db.collection('mail_outbox').doc(id)):Promise.resolve(null)]);
    if(existing?.exists)return id!;
    if((own.data()?.count||0)>=3||(global.data()?.count||0)>=100)
      throw new ApiError(429,'Too many email requests. Please wait before trying again.');
    const jobId=queueMail(tx,db,uid,content,id,action==='verify-email');
    tx.set(ownRef,{count:(own.data()?.count||0)+1,createdAt:Timestamp.now()});
    tx.set(globalRef,{count:(global.data()?.count||0)+1,createdAt:Timestamp.now()});
    return jobId;
  });
}
