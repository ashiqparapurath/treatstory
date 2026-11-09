const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const secret='fixture-secret-that-is-at-least-32-characters';
function fixture(){
  const properties=new Map([['MAIL_WEBHOOK_SECRET',secret],['APP_URL','https://treatstory.vercel.app'],['CRON_SECRET','fixture-cron-secret'],['AUTH_ACTION_HOST','fixture.firebaseapp.com']]);
  const sent=[],triggers=[];let locked=false,quota=10,throwSend=false,lastFetch;
  const store={getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),deleteProperty:key=>properties.delete(key),getProperties:()=>Object.fromEntries(properties)};
  const bytes=buffer=>Array.from(buffer).map(value=>value>127?value-256:value);
  const context={console,PropertiesService:{getScriptProperties:()=>store},Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeHmacSha256Signature:(data,key)=>bytes(crypto.createHmac('sha256',key).update(data).digest()),computeDigest:(_algorithm,data)=>bytes(crypto.createHash('sha256').update(data).digest())},
    HtmlService:{createHtmlOutput:html=>({setTitle:()=>html})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:mail=>{sent.push(mail);if(throwSend)throw Error('Ambiguous send');}},
    UrlFetchApp:{fetch:(url,options)=>{lastFetch={url,options};return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({configured:true})};}},
    ScriptApp:{getProjectTriggers:()=>triggers.slice(),deleteTrigger:trigger=>triggers.splice(triggers.indexOf(trigger),1),newTrigger:handler=>({timeBased:()=>({everyMinutes:minutes=>({create:()=>triggers.push({minutes,getHandlerFunction:()=>handler})})})})},
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  const envelope=(id='event-a',overrides={})=>{
    const request={version:1,id,timestamp:Date.now(),payload:JSON.stringify({to:['buyer@example.com'],template:'order_ready_pickup',data:{title:'കേക്ക് is ready',message:'Your cake is ready',href:'https://treatstory.vercel.app/orders'}}),...overrides};
    request.signature=crypto.createHmac('sha256',secret).update(`${request.timestamp}.${request.id}.${request.payload}`).digest('hex');return request;
  };
  return {context,envelope,sent,properties,triggers,post:request=>context.doPost({postData:{contents:JSON.stringify(request)}}),set quota(value){quota=value;},set throwSend(value){throwSend=value;},get fetch(){return lastFetch;}};
}
test('complete Code.gs accepts signed UTF-8 messages once and rejects tampering/replay',()=>{
  const f=fixture();const request=f.envelope();assert.equal(f.post(request).ok,true);assert.equal(f.sent.length,1);assert.equal(f.sent[0].name,'TreatStory');assert.equal(f.sent[0].to,'buyer@example.com');
  assert.equal(f.post(request).duplicate,true);assert.equal(f.sent.length,1);
  assert.equal(f.post({...request,payload:request.payload.replace('buyer@example.com','attacker@example.com')}).code,'UNAUTHORIZED');
  assert.equal(f.post(f.envelope('old',{timestamp:Date.now()-6*60_000})).code,'UNAUTHORIZED');
  assert.equal(f.post(f.envelope('event-a',{payload:JSON.stringify({to:['other@example.com'],template:'update',data:{title:'x',message:'x',href:'https://treatstory.vercel.app/account'}})})).code,'ID_CONFLICT');assert.equal(f.sent.length,1);
});
test('complete Code.gs validates recipients, handles quota and stops ambiguous sends',()=>{
  const f=fixture();assert.equal(f.post(f.envelope('bad',{payload:JSON.stringify({to:['a@example.com','b@example.com'],template:'update',data:{title:'x',message:'x',href:'https://treatstory.vercel.app/account'}})})).code,'INVALID_REQUEST');
  f.quota=0;const limited=f.envelope('quota');assert.equal(f.post(limited).code,'QUOTA_EXCEEDED');assert.equal(f.sent.length,0);
  f.quota=10;assert.equal(f.post(limited).ok,true);
  f.throwSend=true;const uncertain=f.envelope('uncertain');assert.equal(f.post(uncertain).code,'DELIVERY_UNCERTAIN');assert.equal(f.sent.length,2);assert.equal(f.post(uncertain).code,'DELIVERY_UNCERTAIN');assert.equal(f.sent.length,2,'uncertain sends must never be retried automatically');
});
test('server signing interoperates with the actual Code.gs relay and interprets duplicate receipts',async()=>{
  const f=fixture();const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/server/mail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require,URL,AbortSignal,fetch:async(_url,options)=>Response.json(f.post(JSON.parse(options.body)))});
  const payload={to:['buyer@example.com'],template:'order_ready_pickup',data:{title:'കേക്ക്',message:'Cake ready',href:'https://treatstory.vercel.app/orders'}};
  const config={endpoint:'https://script.google.com/macros/s/fixture/exec',secret};
  assert.equal(await module.exports.sendAppsScript(payload,config,'real-protocol'),'real-protocol');assert.equal(await module.exports.sendAppsScript(payload,config,'real-protocol'),'real-protocol');assert.equal(f.sent.length,1);
});
test('Apps Script installs one retry trigger and sends its cron secret only to this app',()=>{
  const f=fixture();f.context.installRetryTrigger();f.context.installRetryTrigger();assert.equal(f.triggers.length,1);assert.equal(f.triggers[0].minutes,5);
  f.context.processEmailQueue();assert.equal(f.fetch.url,'https://treatstory.vercel.app/api/email/process');assert.equal(f.fetch.options.headers.Authorization,'Bearer fixture-cron-secret');assert.equal(f.fetch.options.followRedirects,false);
  f.properties.set('APP_URL','https://attacker.example');assert.throws(()=>f.context.processEmailQueue());
});

test('all event templates render safe HTML and useful plain text with event-specific actions',()=>{
  const f=fixture();const store={getProperty:key=>f.properties.get(key)};
  for(const key of Object.keys(f.context.EMAIL_TEMPLATES)){
    const href=key==='verify_email'||key==='password_reset'?'https://fixture.firebaseapp.com/__/auth/action?oobCode=secret&mode=verifyEmail':'https://treatstory.vercel.app/account';
    const mail={to:['buyer@example.com'],template:key,data:{title:'Title <script>',message:'Hello <img onerror="bad"> & friends',href,details:[{label:'<label>',value:'<value>'}]}};
    assert.equal(f.context.validMail_(mail),true,key);const rendered=f.context.renderEmail_(mail,store);
    assert.doesNotMatch(rendered.html,/<script>|<img/);assert.match(rendered.html,/&lt;img/);assert.match(rendered.html,/&lt;label&gt;/);assert.ok(rendered.text.includes(f.context.EMAIL_TEMPLATES[key].note));assert.ok(rendered.html.includes(f.context.EMAIL_TEMPLATES[key].button));
  }
  const gallery=f.context.doGet({parameter:{preview:'1'}});assert.match(gallery,/Sample messages only/);assert.ok(gallery.includes('seller_access_updated'));assert.equal(f.sent.length,0);
});
test('relay rejects unknown templates and external account-link hosts',()=>{
  const f=fixture();for(const [template,href] of [['unknown','https://treatstory.vercel.app/account'],['password_reset','https://evil.example/__/auth/action?oobCode=x'],['welcome','https://fixture.firebaseapp.com/__/auth/action?oobCode=x'],['password_reset','https://fixture.firebaseapp.com.attacker.example/__/auth/action?oobCode=x']]){
    assert.equal(f.post(f.envelope('blocked',{payload:JSON.stringify({to:['buyer@example.com'],template,data:{title:'Hello',message:'Hello',href}})})).code,template==='password_reset'?'AUTH_HOST_MISMATCH':'INVALID_REQUEST');
  }assert.equal(f.sent.length,0);
});

test('server and complete Code.gs support exactly the same template catalog',()=>{
  const f=fixture();const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/server/mail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require});
  assert.deepEqual(Array.from(module.exports.MAIL_TEMPLATES).sort(),Object.keys(f.context.EMAIL_TEMPLATES).sort());
});

test('account link validation tolerates copied HTTPS host values and diagnoses missing/mismatched configuration',()=>{
  const f=fixture();const payload=JSON.stringify({to:['buyer@example.com'],template:'password_reset',data:{title:'Reset',message:'Choose a password',href:'https://fixture.firebaseapp.com/__/auth/action?oobCode=private'}});
  f.properties.set('AUTH_ACTION_HOST',' "https://fixture.firebaseapp.com/" ');assert.equal(f.post(f.envelope('normalized',{payload})).ok,true);
  f.properties.delete('AUTH_ACTION_HOST');assert.equal(f.post(f.envelope('missing-host',{payload})).code,'AUTH_HOST_NOT_CONFIGURED');
  f.properties.set('AUTH_ACTION_HOST','other.firebaseapp.com');assert.equal(f.post(f.envelope('wrong-host',{payload})).code,'AUTH_HOST_MISMATCH');
});
test('clean order template includes a searchable reference, totals and schedule in HTML, subject and plain text',()=>{
  const f=fixture();const mail={template:'order_received',data:{title:'Order received',reference:'TS-A1B2C3D4E5F6',message:'Seller confirmation pending.',href:'https://treatstory.vercel.app/orders?order=private-order-id',details:[{label:'Product',value:'Cake'},{label:'Order total',value:'₹550.50'},{label:'Requested for',value:'15 Nov 2026 · 10 AM–12 PM'}]}};
  const rendered=f.context.renderEmail_(mail,{getProperty:key=>f.properties.get(key)});assert.match(rendered.subject,/TS-A1B2C3D4E5F6/);assert.match(rendered.html,/ORDER ID/);assert.match(rendered.html,/₹550.50/);assert.match(rendered.text,/Order ID: TS-A1B2C3D4E5F6/);assert.match(rendered.text,/15 Nov 2026/);assert.doesNotMatch(rendered.html,/copy this secure link/);
});
