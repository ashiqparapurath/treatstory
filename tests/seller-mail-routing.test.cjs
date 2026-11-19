const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const read=path=>fs.readFileSync(path,'utf8');

function load(file,mocks,globals={}) {
  const module={exports:{}};
  const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:id=>id in mocks?mocks[id]:require(id),Response,Request,URL,console,...globals},{filename:file});
  return module.exports;
}

test('seller submission queues receipt and admin email inside transaction for guest, password and Google',async()=>{
  let currentUid='',processCount=0;
  const receipts=[],writes=[],afterTasks=[];
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const tx={
    get:async()=>({exists:false,data:()=>({count:0})}),
    create:(ref,data)=>writes.push({path:ref.path,data}),
    set:(ref,data)=>writes.push({path:ref.path,data}),
  };
  const db={
    collection:name=>({doc:id=>({path:name+'/'+id})}),
    doc:path=>({path}),
    runTransaction:async fn=>fn(tx),
  };
  const auth={getUser:async()=>({email:currentUid+'@example.com',emailVerified:true,disabled:false})};
  const mocks={
    'next/server':{after:cb=>afterTasks.push(cb)},
    '@/lib/server/firebase-admin':{
      ApiError,getServerFirebase:()=>({db,auth}),
      verifiedUser:async()=>({uid:currentUid,db,auth}),
      safeResponse:error=>Response.json({error:error.message},{status:error.status||503}),
    },
    '@/lib/server/request-body':{readJsonBody:async r=>r.json()},
    '@/lib/server/seller-activation':{activateApprovedSeller:async()=>{}},
    '@/lib/server/mail':{queueNotification(){},processMailQueue:async()=>{processCount++;return {configured:true,processed:2};}},
    '@/lib/server/seller-application-email':{
      sellerAdminMailRecipient:()=> 'admin@example.com',
      queueNewSellerApplicationMails:(active,database,application,adminEmail)=>{
        assert.equal(active,tx,'emails must be queued before transaction commit');
        assert.equal(database,db);
        receipts.push({application,adminEmail});
      },
      queueRejectedSellerApplicationMail(){},
      queueApprovedSellerApplicationMail(){},
    },
  };
  const {POST}=load('src/app/api/seller-applications/route.ts',mocks);
  const body={
    businessName:'Studio',businessCategory:'handmade',businessCity:'Pune',
    businessState:'Maharashtra',contactEmail:'creator@example.com',
    contactPhone:'9876543210',description:'Handcrafted gifts',website:'',
  };
  for(const [method,uid] of [['guest',''],['email-password','password-user'],['google','google-user']]){
    currentUid=uid;
    const request=new Request('https://treatstory.vercel.app/api/seller-applications',{
      method:'POST',headers:{'content-type':'application/json',...(uid?{authorization:'Bearer fixture-token'}:{})},
      body:JSON.stringify({...body,contactEmail:method+'@example.com'}),
    });
    const result=await POST(request);
    assert.equal(result.status,200,method);
    assert.equal((await result.json()).submitted,true);
    assert.equal(receipts.at(-1).application.contactEmail,method+'@example.com');
    assert.equal(receipts.at(-1).adminEmail,'admin@example.com');
    assert.equal(receipts.at(-1).application.submittedAt.toMillis instanceof Function,true);
  }
  assert.equal(receipts.length,3);
  assert.equal(afterTasks.length,3);
  assert.equal(writes.filter(item=>item.path.startsWith('seller_applications/')).length,3);
  for(const callback of afterTasks)await callback();
  assert.equal(processCount,3,'post-commit background delivery requested for each application');
});

test('seller review queue is server-driven; browser cannot duplicate a review email',()=>{
  const api=read('src/app/api/seller-applications/route.ts');
  const ui=read('src/components/admin/seller-applications.tsx');
  assert.ok(api.includes('queueRejectedSellerApplicationMail(tx,db,{'))
  assert.ok(api.includes('contactEmail:String(application.contactEmail)'))
  assert.match(api,/queueApprovedSellerApplicationMail\(tx, db/);
  assert.match(api,/processMailQueue\(db,auth,3\)/);
  assert.match(api,/queueNewSellerApplicationMails\(tx,db,\{id,\.\.\.data,submittedAt\},adminEmail\)/);
  assert.doesNotMatch(ui,/requestSellerMail\(user,'application'/);
  assert.match(ui,/retryLoad\(\)/);
});

test('the admin recipient is configured server-side, with the prior team email as fallback',()=>{
  const original=process.env.MAIL_ADMIN_EMAIL, fallback=process.env.MAIL_SUPPORT_EMAIL;
  const helper=load('src/lib/server/seller-application-email.ts',{'@/lib/server/mail':{mailId:x=>x,queueMail:()=>{}}},{process,console});
  try {
    process.env.MAIL_ADMIN_EMAIL='ADMIN@EXAMPLE.COM';
    process.env.MAIL_SUPPORT_EMAIL='support@example.com';
    assert.equal(helper.sellerAdminMailRecipient(),'admin@example.com');
    delete process.env.MAIL_ADMIN_EMAIL;
    assert.equal(helper.sellerAdminMailRecipient(),'support@example.com');
    process.env.MAIL_ADMIN_EMAIL='not-an-email';
    assert.equal(helper.sellerAdminMailRecipient(),null,'do not send to invalid external addresses');
  }finally{
    if(original===undefined)delete process.env.MAIL_ADMIN_EMAIL;else process.env.MAIL_ADMIN_EMAIL=original;
    if(fallback===undefined)delete process.env.MAIL_SUPPORT_EMAIL;else process.env.MAIL_SUPPORT_EMAIL=fallback;
  }
});
