import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Timestamp, FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

export type MailContent = { title:string; message:string; href:string; label?:string };
type MailJob = MailContent & {uid:string; createdAt:Timestamp; expiresAt:Timestamp; nextAttemptAt:Timestamp; attempts:number; status:string; recipient?:string; payload?:MailPayload};
export type MailPayload = {from?:string;to:string[];subject:string;html:string;text:string;reply_to?:string};
const collection='mail_outbox';
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
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

export function renderMail(content:MailContent,origin:string) {
  const url=new URL(content.href,origin);
  // Account action links use built-in authentication delivery, never the mail relay.
  if(url.protocol!=='https:'||url.origin!==new URL(origin).origin)throw new Error('Invalid mail link');
  const title=content.title.replace(/[\r\n]/g,' ').slice(0,160);
  const label=content.label||'View update';
  return {subject:`TreatStory · ${title}`,text:`${title}\n\n${content.message}\n\n${label}: ${url.href}\n\nTreatStory · Little finds, lovely stories.`,
    html:`<!doctype html><html><body style="margin:0;background:#f8f6f2;font-family:Arial,sans-serif;color:#29251f"><div style="max-width:560px;margin:32px auto;padding:28px;background:#ffffff;border:1px solid #e5dacb;border-radius:20px"><p style="font-size:26px;margin:0 0 28px">TreatStory</p><h1 style="font-size:22px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.7;white-space:pre-line">${escapeHtml(content.message)}</p><a href="${escapeHtml(url.href)}" style="display:inline-block;margin:16px 0;padding:14px 22px;border-radius:28px;background:#29251f;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a><p style="font-size:12px;color:#756b60">Little finds, lovely stories.</p></div></body></html>`};
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
  const body=JSON.stringify({to:payload.to,subject:payload.subject,html:payload.html,text:payload.text,...(payload.reply_to?{reply_to:payload.reply_to}:{})});
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
  try {
    let payload=job.payload;
    if(!payload) {
      const user=await auth.getUser(job.uid);
      if(!user.email||user.disabled) {
        await ref.update({status:'skipped',nextAttemptAt:FieldValue.delete(),payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete()});return 'skipped';
      }
      payload={to:[job.recipient||user.email],...renderMail(job,config.origin),...(config.replyTo?{reply_to:config.replyTo}:{})};
      // Persist before sending: retries must use exactly the same recipient, sender and content.
      await ref.update({payload});
    }
    // Do not resend an ambiguous job attempted through the previous provider.
    if(payload.from)throw new MailSendError(409,'MIGRATION_REVIEW');
    const providerId=await sendAppsScript(payload,config,id);
    await ref.update({status:'accepted',nextAttemptAt:FieldValue.delete(),providerId,acceptedAt:Timestamp.now(),payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete(),lease:FieldValue.delete()});
    return 'accepted'; // MailApp accepted is not proof of inbox delivery.
  } catch(error) {
    const status=error instanceof MailSendError?error.status:0;
    const code=error instanceof MailSendError?error.code:'DELIVERY_UNAVAILABLE';
    const review=['DELIVERY_UNCERTAIN','MIGRATION_REVIEW','ID_CONFLICT'].includes(code);
    const permanent=review||(status>=400&&status<500&&![408,409,429].includes(status))||(error as {code?:string})?.code==='auth/user-not-found';
    await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease!==lease)return;
      tx.update(ref,{status:review?'review':permanent?'failed':'pending',lastError:code,lease:FieldValue.delete(),
        nextAttemptAt:permanent?FieldValue.delete():Timestamp.fromMillis(Date.now()+Math.min(3600_000,60_000*2**Math.min(job.attempts,6))),
        ...(permanent?{payload:FieldValue.delete(),href:FieldValue.delete(),recipient:FieldValue.delete()}:{})});});
    return review?'review':permanent?'failed':'retry';
  }
}
export async function processMailQueue(db:Firestore,auth:Auth,limit=10) {
  try{mailConfig();}catch{return {configured:false,processed:0};}
  // One indexed inequality, no composite index needed. Sent/failed jobs have no nextAttemptAt.
  const jobs=await db.collection(collection).where('nextAttemptAt','<=',Timestamp.now()).orderBy('nextAttemptAt').limit(limit).get();
  let processed=0;
  for(const job of jobs.docs){if(job.data().status!=='pending'){await job.ref.update({nextAttemptAt:FieldValue.delete()});continue;}await deliverMailJob(db,auth,job.id);processed++;}
  return {configured:true,processed};
}

export function queueNotification(tx:Transaction,db:Firestore,uid:string,notice:{title:string;message:string;href:string;[key:string]:unknown}) {
  const ref=db.collection('notifications').doc(uid).collection('items').doc();
  tx.create(ref,notice);
  queueMail(tx,db,uid,{title:notice.title,message:notice.message,href:notice.href},ref.id);
}
