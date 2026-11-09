import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import type {Auth} from 'firebase-admin/auth';
import {queueMail,deliverMailJob} from '@/lib/server/mail';
async function run(){
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Refusing mail tests outside emulator');
  const db=getFirestore(initializeApp({projectId:'demo-treatstory'},'mail-tests'));
  process.env.APPS_SCRIPT_MAIL_SECRET='fixture-secret-that-is-at-least-32-characters';process.env.APPS_SCRIPT_MAIL_URL='https://script.google.com/macros/s/fixture/exec';process.env.APP_URL='https://shop.example.com';
  let email='buyer@example.com';const auth={getUser:async()=>({email,disabled:false})} as unknown as Auth;
  const original=global.fetch;const calls:{id:string;payload:string}[]=[];let responseCode='TEMPORARILY_UNAVAILABLE';
  global.fetch=async(url,options)=>{
    assert.equal(url,process.env.APPS_SCRIPT_MAIL_URL);const envelope=JSON.parse(String(options?.body));calls.push({id:envelope.id,payload:envelope.payload});
    return Response.json(responseCode==='OK'?{ok:true,id:envelope.id}:{ok:false,code:responseCode});
  };
  try{
    let id='';await db.runTransaction(async tx=>{id=queueMail(tx,db,'buyer',{title:'Order request received',message:'Cake: awaiting seller review.',href:'/orders'},randomUUID());});
    const outcomes=await Promise.all([deliverMailJob(db,auth,id),deliverMailJob(db,auth,id)]);
    assert.equal(calls.length,1,'only one concurrent worker sends');assert.ok(outcomes.includes('retry'));
    let job=(await db.collection('mail_outbox').doc(id).get()).data()!;assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.payload.to[0],'buyer@example.com');
    email='changed@example.com';responseCode='OK';await db.collection('mail_outbox').doc(id).update({nextAttemptAt:Timestamp.fromMillis(0)});
    assert.equal(await deliverMailJob(db,auth,id),'accepted');assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert.equal(calls[0].payload,calls[1].payload,'retry preserves payload despite account changes');
    job=(await db.collection('mail_outbox').doc(id).get()).data()!;assert.equal(job.status,'accepted');assert.equal(job.payload,undefined);assert.equal(job.href,undefined);assert.equal(job.nextAttemptAt,undefined);
    await deliverMailJob(db,auth,id);assert.equal(calls.length,2,'accepted emails are not resent');
    let expired='';await db.runTransaction(async tx=>{expired=queueMail(tx,db,'buyer',{title:'Verify',message:'Private link',href:'https://example.com/?oobCode=secret'},randomUUID(),true,'original@example.com');});
    await db.collection('mail_outbox').doc(expired).update({expiresAt:Timestamp.fromMillis(0)});assert.equal(await deliverMailJob(db,auth,expired),'skipped');
    const expiredJob=(await db.collection('mail_outbox').doc(expired).get()).data()!;assert.equal(expiredJob.status,'expired');assert.equal(expiredJob.href,undefined);assert.equal(expiredJob.recipient,undefined);assert.equal(calls.length,2);
    let failed='';await db.runTransaction(async tx=>{failed=queueMail(tx,db,'buyer',{title:'Update',message:'Hello',href:'/orders'},randomUUID());});responseCode='INVALID_REQUEST';
    assert.equal(await deliverMailJob(db,auth,failed),'failed');assert.equal((await db.collection('mail_outbox').doc(failed).get()).data()?.payload,undefined);
    let uncertain='';await db.runTransaction(async tx=>{uncertain=queueMail(tx,db,'buyer',{title:'Update',message:'Hello',href:'/orders'},randomUUID());});responseCode='DELIVERY_UNCERTAIN';
    assert.equal(await deliverMailJob(db,auth,uncertain),'review');assert.equal((await db.collection('mail_outbox').doc(uncertain).get()).data()?.status,'review');
    console.log('PASS mail outbox: concurrency leases, transient retry, frozen payload/idempotency, expiry, cleanup and permanent failure; no live email sent');
  }finally{global.fetch=original;await db.terminate();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
