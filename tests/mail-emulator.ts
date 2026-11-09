import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import type {Auth} from 'firebase-admin/auth';
import {queueMail,deliverMailJob} from '@/lib/server/mail';
async function run(){
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Refusing mail tests outside emulator');
  const db=getFirestore(initializeApp({projectId:'demo-treatstory'},'mail-tests'));
  process.env.RESEND_API_KEY='fixture-only';process.env.RESEND_FROM_EMAIL='TreatStory <test@example.com>';process.env.APP_URL='https://shop.example.com';
  let email='buyer@example.com';const auth={getUser:async()=>({email,disabled:false})} as unknown as Auth;
  const original=global.fetch;const calls:{key:string|null;body:string}[]=[];let responseStatus=503;
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://api.resend.com/emails');calls.push({key:new Headers(options?.headers).get('Idempotency-Key'),body:String(options?.body)});
    return Response.json(responseStatus===200?{id:'fixture-provider-id'}:{message:'unavailable'},{status:responseStatus});
  };
  try{
    let id='';await db.runTransaction(async tx=>{id=queueMail(tx,db,'buyer',{title:'Order request received',message:'Cake: awaiting seller review.',href:'/orders'},randomUUID());});
    const outcomes=await Promise.all([deliverMailJob(db,auth,id),deliverMailJob(db,auth,id)]);
    assert.equal(calls.length,1,'only one concurrent worker sends');assert.ok(outcomes.includes('retry'));
    let job=(await db.collection('mail_outbox').doc(id).get()).data()!;assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.payload.to[0],'buyer@example.com');
    email='changed@example.com';responseStatus=200;await db.collection('mail_outbox').doc(id).update({nextAttemptAt:Timestamp.fromMillis(0)});
    assert.equal(await deliverMailJob(db,auth,id),'accepted');assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.equal(calls[0].body,calls[1].body,'retry preserves payload despite account changes');
    job=(await db.collection('mail_outbox').doc(id).get()).data()!;assert.equal(job.status,'accepted');assert.equal(job.payload,undefined);assert.equal(job.href,undefined);assert.equal(job.nextAttemptAt,undefined);
    await deliverMailJob(db,auth,id);assert.equal(calls.length,2,'accepted emails are not resent');
    let expired='';await db.runTransaction(async tx=>{expired=queueMail(tx,db,'buyer',{title:'Verify',message:'Private link',href:'https://example.com/?oobCode=secret'},randomUUID(),true,'original@example.com');});
    await db.collection('mail_outbox').doc(expired).update({expiresAt:Timestamp.fromMillis(0)});assert.equal(await deliverMailJob(db,auth,expired),'skipped');
    const expiredJob=(await db.collection('mail_outbox').doc(expired).get()).data()!;assert.equal(expiredJob.status,'expired');assert.equal(expiredJob.href,undefined);assert.equal(expiredJob.recipient,undefined);assert.equal(calls.length,2);
    let failed='';await db.runTransaction(async tx=>{failed=queueMail(tx,db,'buyer',{title:'Update',message:'Hello',href:'/orders'},randomUUID());});responseStatus=422;
    assert.equal(await deliverMailJob(db,auth,failed),'failed');assert.equal((await db.collection('mail_outbox').doc(failed).get()).data()?.payload,undefined);
    console.log('PASS mail outbox: concurrency leases, transient retry, frozen payload/idempotency, expiry, cleanup and permanent failure; no live email sent');
  }finally{global.fetch=original;await db.terminate();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
