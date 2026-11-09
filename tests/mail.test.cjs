const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:id=>id in mocks?mocks[id]:require(id),URL,Response,Buffer,console,AbortSignal,...globals});return module.exports;}
test('mail template escapes user content and uses absolute HTTPS links',()=>{
  const {renderMail}=load('src/lib/server/mail.ts');const mail=renderMail({title:'Cake <script>\nUpdate',message:'<img onerror="bad"> & welcome',href:'/orders'},'https://shop.example.com');
  assert.doesNotMatch(mail.html,/<script>|<img/);assert.match(mail.html,/&lt;img/);assert.match(mail.html,/https:\/\/shop.example.com\/orders/);assert.doesNotMatch(mail.subject,/\n/);
  assert.throws(()=>renderMail({title:'x',message:'x',href:'javascript:alert(1)'},'https://example.com'));
});
const crypto=require('node:crypto');
const relayConfig={endpoint:'https://script.google.com/macros/s/fixture/exec',secret:'fixture-secret-that-is-at-least-32-characters'};
test('Apps Script requests sign exact payload bytes and reject HTTP-200 relay failures',async()=>{
  let sent,result={ok:true,id:'event-id'};
  const {sendAppsScript}=load('src/lib/server/mail.ts',{}, {fetch:async(url,options)=>{sent={url,...options};return Response.json(result);}});
  assert.equal(await sendAppsScript({to:['buyer@example.com'],subject:'Hello',html:'Hi',text:'Hi'},relayConfig,'event-id'),'event-id');
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
test('reset and verification use built-in authentication delivery without the email server or relay',async()=>{
  const calls=[];let code='';const user={emailVerified:false};
  const {requestAccountMail}=load('src/lib/account-mail.ts',{
    'firebase/auth':{sendPasswordResetEmail:async(...args)=>{calls.push(['reset',...args]);if(code)throw {code};},sendEmailVerification:async(...args)=>calls.push(['verify',...args])},
    '@/lib/user-notices':{ActionError:class extends Error{}},
  },{window:{location:{origin:'https://treatstory.vercel.app'}},fetch:()=>{throw Error('Account links must not use the relay');}});
  await requestAccountMail('reset-password',{auth:'auth',email:' buyer@example.com '});assert.equal(calls[0][2],'buyer@example.com');assert.equal(calls[0][3].url,'https://treatstory.vercel.app/login');
  code='auth/user-not-found';assert.equal((await requestAccountMail('reset-password',{auth:'auth',email:'missing@example.com'})).ok,true);
  code='auth/too-many-requests';await assert.rejects(()=>requestAccountMail('reset-password',{auth:'auth',email:'buyer@example.com'}),e=>e.code===code);
  await requestAccountMail('verify-email',{user});assert.equal(calls.at(-1)[0],'verify');assert.equal(calls.at(-1)[2].url,'https://treatstory.vercel.app/account');
  user.emailVerified=true;assert.equal((await requestAccountMail('verify-email',{user})).alreadyVerified,true);
});
test('welcome endpoint requires a session, accepts no recipient/content overrides, and deduplicates',async()=>{
  let queued=0,existing=false,authenticated=true;
  class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
  const db={collection:()=>({doc:()=>({})}),runTransaction:async fn=>fn({get:async()=>({exists:existing})})};
  const {POST}=load('src/app/api/email/account/route.ts',{
    'next/server':{after(){}},
    '@/lib/server/firebase-admin':{ApiError,verifiedUser:async()=>{if(!authenticated)throw new ApiError(401,'Sign in');return {uid:'buyer',db,auth:{getUser:async()=>({email:'buyer@example.com'})}};},safeResponse:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/server/mail':{mailConfig(){},mailId:()=> 'hash',queueMail:(_tx,_db,uid,content)=>{assert.equal(uid,'buyer');assert.equal(content.href,'/account');queued++;},processMailQueue:async()=>{}},
  });
  const request=body=>POST({url:'https://shop.example.com/api/email/account',headers:new Headers({origin:'https://shop.example.com'}),text:async()=>JSON.stringify(body)});
  authenticated=false;assert.equal((await request({action:'welcome'})).status,401);
  authenticated=true;assert.equal((await request({action:'welcome',to:'attacker@example.com'})).status,400);
  assert.equal((await request({action:'reset-password',email:'buyer@example.com'})).status,400);
  assert.equal((await request({action:'welcome'})).status,200);assert.equal(queued,1);existing=true;await request({action:'welcome'});assert.equal(queued,1);
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
