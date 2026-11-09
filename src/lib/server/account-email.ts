import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiError } from '@/lib/server/firebase-admin';
import { mailId, queueMail, type MailContent } from '@/lib/server/mail';

/** Quota and durable intent commit together; no Auth lookup or network call precedes the write. */
export async function enqueueAccountEmail(db:Firestore,action:'reset-password'|'verify-email'|'welcome',uid:string,email?:string) {
  const hour=Math.floor(Date.now()/3600_000);
  const identity=action==='reset-password'?mailId(email!.trim().toLowerCase()):uid;
  // Versioned key: older, pre-queue failures must not exhaust this flow's quota.
  const ownRef=db.collection('mail_limits').doc(`account_v2_${identity}_${hour}`);
  const globalRef=db.collection('mail_limits').doc(`account_v2_global_${hour}`);
  const id=action==='welcome'?mailId(`welcome/${uid}/once`):undefined;
  const content:MailContent=action==='reset-password'
    ?{template:'password_reset',title:'Reset your password',message:'Use the secure link below to choose a new password for your TreatStory account. If you did not request this, you can ignore this email.',href:'',label:'Reset password'}
    :action==='verify-email'
    ?{template:'verify_email',title:'Verify your email address',message:'Confirm this email address for your TreatStory account.',href:'',label:'Verify email address'}
    :{template:'welcome',title:'Welcome to TreatStory',message:'Your account is ready. Discover handmade finds, build your wishlist and track your orders from your profile.',href:'/account',label:'Open your profile'};
  return db.runTransaction(async tx=>{
    const [own,global,existing]=await Promise.all([tx.get(ownRef),tx.get(globalRef),id?tx.get(db.collection('mail_outbox').doc(id)):Promise.resolve(null)]);
    if(existing?.exists)return id!;
    // Limits depend on requests, never whether the address belongs to an account.
    if((own.data()?.count||0)>=3||(global.data()?.count||0)>=100)
      throw new ApiError(429,'Too many email requests. Please wait before trying again.');
    const jobId=queueMail(tx,db,uid,content,id,action!=='welcome',action==='reset-password'?email?.trim():undefined);
    tx.set(ownRef,{count:(own.data()?.count||0)+1,createdAt:Timestamp.now()});
    tx.set(globalRef,{count:(global.data()?.count||0)+1,createdAt:Timestamp.now()});
    return jobId;
  });
}
