const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:id=>id in mocks?mocks[id]:require(id),URL,Response,Buffer,console,AbortSignal,...globals});return module.exports;}
test('structured mail data sanitizes subject headers and restricts links to app or configured account handler',()=>{
  const {renderMail}=load('src/lib/server/mail.ts',{}, {process:{env:{NEXT_PUBLIC_FIREBASE_PROJECT_ID:'fixture'}}});
  const mail=renderMail({title:'Cake\nUpdate',message:'Fresh cake',href:'/orders',template:'order_received'},'https://shop.example.com');
  assert.equal(mail.template,'order_received');assert.equal(mail.data.href,'https://shop.example.com/orders');assert.doesNotMatch(mail.data.title,/\n/);
  assert.throws(()=>renderMail({title:'x',message:'x',href:'javascript:alert(1)'},'https://example.com'));
  assert.throws(()=>renderMail({title:'x',message:'x',href:'https://attacker.example/__/auth/action',template:'password_reset'},'https://example.com'));
  assert.equal(renderMail({title:'Reset',message:'Reset password',href:'https://fixture.firebaseapp.com/__/auth/action?oobCode=secret',template:'password_reset'},'https://example.com').template,'password_reset');
});
const crypto=require('node:crypto');
const relayConfig={endpoint:'https://script.google.com/macros/s/fixture/exec',secret:'fixture-secret-that-is-at-least-32-characters'};
test('Apps Script requests sign exact payload bytes and reject HTTP-200 relay failures',async()=>{
  let sent,result={ok:true,id:'event-id'};
  const {sendAppsScript}=load('src/lib/server/mail.ts',{}, {fetch:async(url,options)=>{sent={url,...options};return Response.json(result);}});
  assert.equal(await sendAppsScript({to:['buyer@example.com'],template:'welcome',data:{title:'Hello',message:'Hi',href:'https://treatstory.vercel.app/account'}},relayConfig,'event-id'),'event-id');
  assert.equal(sent.url,relayConfig.endpoint);const envelope=JSON.parse(sent.body);
  assert.equal(envelope.signature,crypto.createHmac('sha256',relayConfig.secret).update(`${envelope.timestamp}.${envelope.id}.${envelope.payload}`).digest('hex'));
  assert.equal(JSON.parse(envelope.payload).to[0],'buyer@example.com');assert.ok(!sent.body.includes(relayConfig.secret));
  result={ok:false,code:'QUOTA_EXCEEDED'};await assert.rejects(()=>sendAppsScript({},relayConfig,'event-id'),e=>e.status===429);
  result={ok:false,code:'DELIVERY_UNCERTAIN'};await assert.rejects(()=>sendAppsScript({},relayConfig,'event-id'),e=>e.code==='DELIVERY_UNCERTAIN');
  result={ok:true,id:'other-id'};await assert.rejects(()=>sendAppsScript({},relayConfig,'event-id'),e=>e.code==='INVALID_RELAY_RESPONSE');
});
test('relay configuration rejects endpoints that could receive the signing secret outside Apps Script',()=>{
  for(const endpoint of ['https://evil.example/exec','http://script.google.com/macros/s/id/exec','https://script.google.com/macros/s/id/dev','https://script.google.com/macros/s/id/exec?x=1']){
    const {mailConfig}=load('src/lib/server/mail.ts',{}, {process:{env:{APP_URL:'https://treatstory.vercel.app',APPS_SCRIPT_MAIL_SECRET:relayConfig.secret,APPS_SCRIPT_MAIL_URL:endpoint}}});assert.throws(mailConfig);
  }
});
test('account client sends only actions/email and bearer tokens to its own server',async()=>{
  const calls=[];let status=200;
  class ActionError extends Error{constructor(message,status){super(message);this.status=status;}}
  const {requestAccountMail}=load('src/lib/account-mail.ts',{'@/lib/user-notices':{ActionError}}, {fetch:async(url,options)=>{calls.push({url,...options});return Response.json(status===200?{ok:true}:{error:'Please wait'},{status});}});
  await requestAccountMail('reset-password',{email:' buyer@example.com '});assert.equal(calls[0].url,'/api/email/account');assert.deepEqual(JSON.parse(calls[0].body),{action:'reset-password',email:'buyer@example.com'});
  await requestAccountMail('verify-email',{user:{getIdToken:async()=> 'fixture-token'}});assert.equal(calls[1].headers.Authorization,'Bearer fixture-token');assert.deepEqual(JSON.parse(calls[1].body),{action:'verify-email'});
  status=429;await assert.rejects(()=>requestAccountMail('reset-password',{email:'buyer@example.com'}),e=>e.status===429);
});
function accountFixture(){
  let queued=0,existing=false,authenticated=true,known=true,limited=false,disabled=false;const jobs=[];
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const db={collection:name=>({doc:id=>({path:`${name}/${id}`})}),runTransaction:async fn=>fn({get:async ref=>ref.path.startsWith('mail_limits/')?{data:()=>({count:limited?3:0})}:{exists:existing},set(){}})};
  const user=()=>({uid:'buyer',email:'buyer@example.com',disabled,emailVerified:false});
  const auth={getUser:async()=>user(),getUserByEmail:async()=>{if(!known)throw {code:'auth/user-not-found'};return user();},generatePasswordResetLink:async()=> 'https://fixture.firebaseapp.com/__/auth/action?oobCode=reset',generateEmailVerificationLink:async()=> 'https://fixture.firebaseapp.com/__/auth/action?oobCode=verify'};
  const {POST}=load('src/app/api/email/account/route.ts',{
    'next/server':{after(){}},'firebase-admin/firestore':{Timestamp:{now:()=>0}},
    '@/lib/server/firebase-admin':{ApiError,verifiedUser:async()=>{if(!authenticated)throw new ApiError(401,'Sign in');return {uid:'buyer',db,auth};},getServerFirebase:()=>({db,auth}),safeResponse:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/server/mail':{mailConfig:()=>({origin:'https://treatstory.vercel.app'}),mailId:s=>s,queueMail:(...args)=>{jobs.push(args);queued++;return 'job-id';},deliverMailJob(){}},
  });
  const request=(body,origin='https://treatstory.vercel.app')=>POST({url:'https://treatstory.vercel.app/api/email/account',headers:new Headers({origin}),text:async()=>JSON.stringify(body)});
  return {request,jobs,get queued(){return queued;},set existing(v){existing=v;},set authenticated(v){authenticated=v;},set known(v){known=v;},set limited(v){limited=v;},set disabled(v){disabled=v;}};
}
test('welcome and verification require a session and queue private intents before account lookup',async()=>{
  const f=accountFixture();f.authenticated=false;assert.equal((await f.request({action:'welcome'})).status,401);
  f.authenticated=true;assert.equal((await f.request({action:'welcome',to:'attacker@example.com'})).status,400);
  assert.equal((await f.request({action:'welcome'})).status,200);assert.equal(f.queued,1);assert.equal(f.jobs[0][3].template,'welcome');
  f.existing=true;await f.request({action:'welcome'});assert.equal(f.queued,1);f.existing=false;
  await f.request({action:'verify-email'});assert.equal(f.jobs.at(-1)[2],'buyer');assert.equal(f.jobs.at(-1)[3].template,'verify_email');assert.equal(f.jobs.at(-1)[3].href,'');assert.equal(f.jobs.at(-1)[5],true);assert.equal(f.jobs.at(-1)[6],undefined);
});
test('password reset gives identical responses for known, missing, disabled and rate-limited accounts',async()=>{
  const f=accountFixture();const body=await (await f.request({action:'reset-password',email:'buyer@example.com'})).json();assert.equal(f.jobs[0][3].template,'password_reset');assert.equal(f.jobs[0][5],true);
  f.known=false;assert.deepEqual(await (await f.request({action:'reset-password',email:'missing@example.com'})).json(),body);
  f.known=true;f.disabled=true;assert.deepEqual(await (await f.request({action:'reset-password',email:'buyer@example.com'})).json(),body);
  f.disabled=false;f.limited=true;assert.deepEqual(await (await f.request({action:'reset-password',email:'buyer@example.com'})).json(),body);assert.equal(f.queued,3);
  assert.equal((await f.request({action:'reset-password',email:'buyer@example.com'},'https://evil.example')).status,403);
});

test('seller email content and recipients come from authorized committed records',async()=>{
  let admin=false,owner='other-user',queued=0,existing=false,last;
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const db={collection:name=>({doc:id=>({path:`${name}/${id}`})}),runTransaction:async fn=>fn({get:async ref=>ref.path.startsWith('roles_admin/')?{exists:admin}:ref.path.startsWith('mail_outbox/')?{exists:existing}:ref.path.startsWith('mail_limits/')?{data:()=>({count:0})}:{exists:true,data:()=>({ownerUid:owner,status:'pending',businessName:'Bakery',submittedAt:{toMillis:()=>1000}})},set(){}})};
  const {POST}=load('src/app/api/email/seller/route.ts',{
    'next/server':{after(){}},'@/lib/server/firebase-admin':{ApiError,verifiedUser:async()=>({uid:'caller',db,auth:{}}),safeResponse:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/server/mail':{mailId:()=> 'stable-key',queueMail:(...args)=>{queued++;last=args;},processMailQueue:async()=>{}},
  },{process:{env:{}}});
  const request=body=>POST({text:async()=>JSON.stringify(body)});
  assert.equal((await request({kind:'application',id:'application-a'})).status,403);assert.equal(queued,0);
  owner='caller';assert.equal((await request({kind:'application',id:'application-a'})).status,200);assert.equal(last[2],'caller');assert.match(last[3].message,/Bakery/);assert.equal(queued,1);
  existing=true;assert.equal((await request({kind:'application',id:'application-a'})).status,200);assert.equal(queued,1,'same committed event cannot queue twice');
  assert.equal((await request({kind:'application',id:'application-a',to:'attacker@example.com'})).status,400);
});

test('retry worker rejects missing or incorrect cron credentials',async()=>{
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  let calls=0;
  const {GET}=load('src/app/api/email/process/route.ts',{
    '@/lib/server/firebase-admin':{ApiError,getServerFirebase:()=>({db:{},auth:{}}),safeResponse:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/server/mail':{processMailQueue:async()=>{calls++;return {configured:true,processed:0};}},
  },{process:{env:{CRON_SECRET:'fixture-only-secret'}}});
  assert.equal((await GET({headers:new Headers()})).status,401);assert.equal((await GET({headers:new Headers({authorization:'Bearer wrong'})})).status,401);assert.equal(calls,0);
  assert.equal((await GET({headers:new Headers({authorization:'Bearer fixture-only-secret'})})).status,200);assert.equal(calls,1);
});

test('order email snapshots preserve amount precision and delivery details while keeping a stable display ID',()=>{
  const {orderEmail,orderReference}=load('src/lib/server/order-email.ts');
  const order={productName:'Cake',quantity:2,subtotal:1000.5,deliveryFee:50,deliveryMode:'delivery',deliveryAddress:'Sample address',requestedDate:'2026-11-15',requestedSlot:'10–12',advancePaymentRequired:true,status:'pending',customerName:'Buyer',customerPhone:'9876543210',selectedWeight:{value:500,unit:'g'}};
  const buyer=orderEmail('private-buyer_checkout_0',order,'buyer'),seller=orderEmail('private-buyer_checkout_0',order,'seller');
  assert.equal(buyer.reference,seller.reference);assert.equal(buyer.reference,orderReference('private-buyer_checkout_0'));assert.notEqual(buyer.reference,orderReference('private-buyer_checkout_1'));assert.doesNotMatch(buyer.reference,/private-buyer/);
  assert.match(buyer.details.find(row=>row.label==='Order total').value,/1,050.50/);assert.equal(buyer.details.find(row=>row.label==='Delivery address').value,'Sample address');assert.equal(buyer.details.find(row=>row.label==='Payment').value,'Advance arranged with seller');assert.match(buyer.details.find(row=>row.label==='Product').value,/500 g/);
  assert.equal(buyer.details.some(row=>row.label==='Contact phone'),false);assert.equal(seller.details.find(row=>row.label==='Contact phone').value,'9876543210');assert.match(seller.href,/section=orders/);assert.ok(seller.details.length<=12);
  const pickup=orderEmail('pickup',{...order,deliveryMode:'pickup',paymentStatus:'collected'},'buyer');assert.equal(pickup.details.some(row=>row.label==='Delivery fee'||row.label==='Delivery address'),false);assert.match(pickup.details.find(row=>row.label==='Payment').value,/Seller recorded/);
});
