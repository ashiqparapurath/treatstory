import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Timestamp, FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

export const MAIL_TEMPLATES = [
  'welcome','verify_email','password_reset','order_received','new_order','order_accepted',
  'order_preparing','order_ready_pickup','order_ready_delivery','order_out_for_delivery',
  'order_collected','order_delivered','order_cancel_requested','order_cancel_declined',
  'order_cancelled','order_declined','payment_recorded','quote_requested','quote_ready',
  'quote_accepted','quote_declined','support_received','support_reply','support_closed','support_new',
  'seller_application_received','seller_application_approved','seller_application_declined',
  'seller_application_new','seller_access_updated','update',
] as const;
export type MailTemplate = typeof MAIL_TEMPLATES[number];
export type MailContent = { title:string; message:string; href:string; label?:string; reference?:string; template?:MailTemplate; details?:Array<{label:string;value:string}> };
type MailJob = MailContent & {uid:string; createdAt:Timestamp; expiresAt:Timestamp; nextAttemptAt:Timestamp; attempts:number; status:string; recipient?:string; payload?:MailPayload};
export type MailPayload = {to:string[];template:MailTemplate;data:{title:string;message:string;href:string;label?:string;reference?:string;details?:Array<{label:string;value:string}>};reply_to?:string};
const collection='mail_outbox';
export function mailConfig() {
  const secret=process.env.APPS_SCRIPT_MAIL_SECRET?.trim();
  const endpoint=process.env.APPS_SCRIPT_MAIL_URL?.trim();
  const raw=process.env.APP_URL?.trim();
  if(!secret||secret.length<32||!endpoint||!raw)throw new Error('MAIL_NOT_CONFIGURED');
  const script=new URL(endpoint),url=new URL(raw);
  if(script.protocol!=='https:'||script.hostname!=='script.google.com'||script.username||script.password||script.search||script.hash||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(script.pathname))throw new Error('MAIL_NOT_CONFIGURED');
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('MAIL_NOT_CONFIGURED');
  return {secret,endpoint,origin:url.origin,replyTo:process.env.MAIL_REPLY_TO?.trim()};
}

/** Send structured event data; the complete HTML/plain-text templates live in Code.gs. */
export function renderMail(content:MailContent,origin:string) {
  const url=new URL(content.href,origin);
  const account=content.template==='verify_email'||content.template==='password_reset';
  const project=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const hosts=[`${project}.firebaseapp.com`,`${project}.web.app`,process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim().replace(/^https:\/\//,'').replace(/\/$/,'').toLowerCase()];
  const allowedAuth=account&&hosts.includes(url.hostname)&&url.pathname==='/__/auth/action'&&!url.username&&!url.password&&!url.port;
  if(url.protocol!=='https:'||(url.origin!==new URL(origin).origin&&!allowedAuth))throw new MailSendError(503,account?'AUTH_ACTION_HOST_MISMATCH':'INVALID_MESSAGE_LINK');
  return {template:content.template||'update' as MailTemplate,data:{
    title:content.title.replace(/[\r\n]/g,' ').slice(0,160),message:content.message,href:url.href,
    ...(content.label?{label:content.label}:{}),...(content.reference?{reference:content.reference}:{}),...(content.details?{details:content.details}:{}),
  }};
}
export const mailId=(event:string)=>createHash('sha256').update(event).digest('hex');
/** Queue inside the same transaction as the business event. No network call in a transaction. */
export function queueMail(tx:Transaction,db:Firestore,uid:string,content:MailContent,id?:string,account=false,recipient?:string) {
  const now=Timestamp.now();
  const ref=id?db.collection(collection).doc(id):db.collection(collection).doc();
  tx.create(ref,{...content,uid,...(recipient?{recipient}:{}),status:'pending',attempts:0,createdAt:now,nextAttemptAt:now,
    expiresAt:Timestamp.fromMillis(now.toMillis()+(account?45*60_000:47*3600_000))});
  return ref.id;
}
export class MailSendError extends Error {
  constructor(public status:number,public code='RELAY_UNAVAILABLE'){super('Email service request failed');}
}
export async function sendAppsScript(payload:MailPayload,config:ReturnType<typeof mailConfig>,id:string) {
  // Payload is a string so Apps Script verifies the exact UTF-8 bytes that were signed.
  const timestamp=Date.now();
  const body=JSON.stringify({to:payload.to,template:payload.template,data:payload.data,...(payload.reply_to?{reply_to:payload.reply_to}:{})});
  const signature=createHmac('sha256',config.secret).update(`${timestamp}.${id}.${body}`).digest('hex');
  const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({version:1,timestamp,id,payload:body,signature}),redirect:'follow',signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new MailSendError(response.status);
  // Apps Script ContentService returns HTTP 200 even for application-level failures.
  const result=await response.json().catch(()=>null) as {ok?:boolean;id?:string;code?:string}|null;
  if(result?.ok===true&&result.id===id)return result.id;
  const code=result?.code||'INVALID_RELAY_RESPONSE';
  const status=code==='UNAUTHORIZED'?401:code==='INVALID_REQUEST'?400:code==='ID_CONFLICT'?409:code==='QUOTA_EXCEEDED'?429:503;
  throw new MailSendError(status,code);
}
/** Leases protect concurrent workers; frozen payloads plus relay receipts protect crash/retry. */
export async function deliverMailJob(db:Firestore,auth:Auth,id:string) {
  const config=mailConfig();const ref=db.collection(collection).doc(id);const lease=randomUUID();
  const job=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);const data=snap.data() as MailJob|undefined;const now=Date.now();
    if(!data||data.status!=='pending'||data.nextAttemptAt.toMillis()>now)return null;
    if(data.expiresAt.toMillis()<=now){tx.update(ref,{status:'expired',nextAttemptAt:FieldValue.delete(),payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete()});return null;}
    tx.update(ref,{lease,nextAttemptAt:Timestamp.fromMillis(now+120_000),attempts:data.attempts+1});return data;
  });
  if(!job)return 'skipped';
  let stage='account-lookup';
  try {
    let payload=job.payload;
    if(!payload) {
      const account=job.template==='password_reset'||job.template==='verify_email';
      const user=job.template==='password_reset'&&!job.uid&&job.recipient
        ?await auth.getUserByEmail(job.recipient):await auth.getUser(job.uid);
      if(!user.email||user.disabled) {
        await ref.update({status:'skipped',nextAttemptAt:FieldValue.delete(),payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete()});return 'skipped';
      }
      let href=job.href;
      // Queue the intent before any account lookup/link generation, so failures remain retryable.
      if(account&&!href){
        stage='link-generation';
        href=job.template==='password_reset'
          ?await auth.generatePasswordResetLink(user.email,{url:`${config.origin}/login`})
          :await auth.generateEmailVerificationLink(user.email,{url:`${config.origin}/account`});
      }
      stage='prepare-message';
      payload={to:[account?user.email:job.recipient||user.email],...renderMail({...job,href},config.origin),...(config.replyTo?{reply_to:config.replyTo}:{})};
      // Persist before sending: retries must use exactly the same recipient, sender and content.
      await ref.update({payload,...(account?{uid:user.uid}:{} )});
    }
    stage='relay';
    const providerId=await sendAppsScript(payload,config,id);
    await ref.update({status:'accepted',lastError:FieldValue.delete(),lastStage:FieldValue.delete(),nextAttemptAt:FieldValue.delete(),providerId,acceptedAt:Timestamp.now(),payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete(),lease:FieldValue.delete()});
    return 'accepted'; // MailApp accepted is not proof of inbox delivery.
  } catch(error) {
    const status=error instanceof MailSendError?error.status:0;
    const authCode=(error as {code?:unknown})?.code;
    const code=error instanceof MailSendError?error.code:typeof authCode==='string'&&/^auth\/[a-z-]+$/.test(authCode)?authCode:'DELIVERY_UNAVAILABLE';
    const skipped=code==='auth/user-not-found';
    const review=['DELIVERY_UNCERTAIN','ID_CONFLICT'].includes(code);
    const permanent=skipped||review||(status>=400&&status<500&&![408,409,429].includes(status));
    await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease!==lease)return;
      tx.update(ref,{status:skipped?'skipped':review?'review':permanent?'failed':'pending',lastError:code,lastStage:stage,lease:FieldValue.delete(),
        nextAttemptAt:permanent?FieldValue.delete():Timestamp.fromMillis(Date.now()+Math.min(3600_000,60_000*2**Math.min(job.attempts,6))),
        ...(permanent?{payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete()}:{})});});
    return skipped?'skipped':review?'review':permanent?'failed':'retry';
  }
}
const activeQueueRuns=new WeakMap<Firestore,Promise<{configured:boolean;processed:number}>>();
export async function processMailQueue(db:Firestore,auth:Auth,limit=10) {
  const active=activeQueueRuns.get(db);if(active)return {configured:true,processed:0};
  const run=drainMailQueue(db,auth,limit);activeQueueRuns.set(db,run);
  try{return await run;}finally{if(activeQueueRuns.get(db)===run)activeQueueRuns.delete(db);}
}
async function drainMailQueue(db:Firestore,auth:Auth,limit:number) {
  try{mailConfig();}catch{return {configured:false,processed:0};}
  // One indexed inequality, no composite index needed. Sent/failed jobs have no nextAttemptAt.
  const jobs=await db.collection(collection).where('nextAttemptAt','<=',Timestamp.now()).orderBy('nextAttemptAt').limit(limit).get();
  let processed=0;
  for(const job of jobs.docs){if(job.data().status!=='pending'){await job.ref.update({nextAttemptAt:FieldValue.delete()});continue;}await deliverMailJob(db,auth,job.id);processed++;}
  return {configured:true,processed};
}

export function queueNotification(tx:Transaction,db:Firestore,uid:string,notice:{title:string;message:string;href:string;template?:MailTemplate;details?:MailContent['details'];[key:string]:unknown}) {
  const ref=db.collection('notifications').doc(uid).collection('items').doc();
  const {template,details,...notification}=notice;
  tx.create(ref,notification);
  queueMail(tx,db,uid,{title:notice.title,message:notice.message,href:notice.href,...(template?{template}:{}),...(details?{details}:{})},ref.id);
}
