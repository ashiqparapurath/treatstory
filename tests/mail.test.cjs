const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:id=>id in mocks?mocks[id]:require(id),URL,Response,Buffer,console,AbortSignal,...globals});return module.exports;}
test('mail template escapes user content and uses absolute HTTPS links',()=>{
  const {renderMail}=load('src/lib/server/mail.ts');const mail=renderMail({title:'Cake <script>\nUpdate',message:'<img onerror="bad"> & welcome',href:'/orders'},'https://shop.example.com');
  assert.doesNotMatch(mail.html,/<script>|<img/);assert.match(mail.html,/&lt;img/);assert.match(mail.html,/https:\/\/shop.example.com\/orders/);assert.doesNotMatch(mail.subject,/\n/);
  assert.throws(()=>renderMail({title:'x',message:'x',href:'javascript:alert(1)'},'https://example.com'));
});
test('Resend uses server auth, stable idempotency key and detects HTTP failure',async()=>{
  let sent;let status=200;
  const {sendResend}=load('src/lib/server/mail.ts',{}, {fetch:async(url,options)=>{sent={url,...options};return Response.json(status===200?{id:'message-id'}:{},{status});}});
  assert.equal(await sendResend({to:['buyer@example.com'],from:'shop@example.com',subject:'Hello',html:'Hi',text:'Hi'},'fixture-secret','event-id'),'message-id');
  assert.equal(sent.url,'https://api.resend.com/emails');assert.equal(sent.headers.Authorization,'Bearer fixture-secret');assert.equal(sent.headers['Idempotency-Key'],'treatstory/event-id');
  status=429;await assert.rejects(()=>sendResend({},'fixture-secret','event-id'),e=>e.status===429);
});
function accountFixture(){
  let lookup=0,queued=0,known=true,allowed=true,verified=0;const jobs=[];
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const db={collection:()=>({doc:()=>({})}),runTransaction:async fn=>fn({get:async()=>({exists:false,data:()=>({count:allowed?0:3})}),set(){},create(){}})};
  const auth={getUserByEmail:async()=>{lookup++;if(!known)throw {code:'auth/user-not-found'};return {uid:'buyer',email:'buyer@example.com'};},generatePasswordResetLink:async()=> 'https://auth.example.com/?oobCode=secret',getUser:async()=>({uid:'buyer',email:'buyer@example.com',emailVerified:false}),generateEmailVerificationLink:async()=> 'https://auth.example.com/?oobCode=verify'};
  const {POST}=load('src/app/api/email/account/route.ts',{
    'next/server':{after(){}},'firebase-admin/firestore':{Timestamp:{now:()=>0}},
    '@/lib/server/firebase-admin':{ApiError,getServerFirebase:()=>({db,auth}),verifiedUser:async()=>{verified++;return {db,auth,uid:'buyer'};},safeResponse:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/server/mail':{mailConfig:()=>({origin:'https://shop.example.com'}),mailId:()=> 'hash',queueMail:(...args)=>{queued++;jobs.push(args);},processMailQueue:async()=>{}},
  });
  const request=(body,origin='https://shop.example.com')=>POST({url:'https://shop.example.com/api/email/account',headers:new Headers({origin}),text:async()=>JSON.stringify(body)});
  return {request,jobs,get lookup(){return lookup;},get queued(){return queued;},get verified(){return verified;},set known(v){known=v;},set allowed(v){allowed=v;}};
}
test('password reset is private, rate limited and cannot accept arbitrary mail content',async()=>{
  const f=accountFixture();const known=await f.request({action:'reset-password',email:'buyer@example.com'});assert.equal(known.status,200);const body=await known.json();assert.equal(f.queued,1);assert.equal(f.jobs[0][2],'buyer');assert.equal(f.jobs[0][5],true);assert.equal(f.jobs[0][6],'buyer@example.com');
  f.known=false;const missing=await f.request({action:'reset-password',email:'missing@example.com'});assert.deepEqual(await missing.json(),body);assert.equal(f.queued,1);
  f.allowed=false;assert.deepEqual(await (await f.request({action:'reset-password',email:'buyer@example.com'})).json(),body);
  assert.equal((await f.request({action:'reset-password',email:'buyer@example.com',html:'arbitrary'})).status,400);
  assert.equal((await f.request({action:'reset-password',email:'buyer@example.com'},'https://evil.example')).status,403);
});
test('verification and welcome use the verified session identity without accepting another recipient',async()=>{
  const f=accountFixture();assert.equal((await f.request({action:'verify-email'})).status,200);assert.equal(f.verified,1);assert.equal(f.jobs[0][2],'buyer');assert.match(f.jobs[0][3].href,/oobCode=verify/);
  assert.equal((await f.request({action:'welcome',email:'other@example.com'})).status,400);
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
