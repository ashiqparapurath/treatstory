const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const secret='fixture-secret-that-is-at-least-32-characters';
function fixture(){
  const properties=new Map([['MAIL_WEBHOOK_SECRET',secret],['APP_URL','https://treatstory.vercel.app'],['CRON_SECRET','fixture-cron-secret']]);
  const sent=[],triggers=[];let locked=false,quota=10,throwSend=false,lastFetch;
  const store={getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),deleteProperty:key=>properties.delete(key),getProperties:()=>Object.fromEntries(properties)};
  const bytes=buffer=>Array.from(buffer).map(value=>value>127?value-256:value);
  const context={console,PropertiesService:{getScriptProperties:()=>store},Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeHmacSha256Signature:(data,key)=>bytes(crypto.createHmac('sha256',key).update(data).digest()),computeDigest:(_algorithm,data)=>bytes(crypto.createHash('sha256').update(data).digest())},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:mail=>{sent.push(mail);if(throwSend)throw Error('Ambiguous send');}},
    UrlFetchApp:{fetch:(url,options)=>{lastFetch={url,options};return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({configured:true})};}},
    ScriptApp:{getProjectTriggers:()=>triggers.slice(),deleteTrigger:trigger=>triggers.splice(triggers.indexOf(trigger),1),newTrigger:handler=>({timeBased:()=>({everyMinutes:minutes=>({create:()=>triggers.push({minutes,getHandlerFunction:()=>handler})})})})},
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  const envelope=(id='event-a',overrides={})=>{
    const request={version:1,id,timestamp:Date.now(),payload:JSON.stringify({to:['buyer@example.com'],subject:'TreatStory · കേക്ക്',text:'Your cake is ready',html:'<p>Your cake is ready</p>'}),...overrides};
    request.signature=crypto.createHmac('sha256',secret).update(`${request.timestamp}.${request.id}.${request.payload}`).digest('hex');return request;
  };
  return {context,envelope,sent,properties,triggers,post:request=>context.doPost({postData:{contents:JSON.stringify(request)}}),set quota(value){quota=value;},set throwSend(value){throwSend=value;},get fetch(){return lastFetch;}};
}
test('complete Code.gs accepts signed UTF-8 messages once and rejects tampering/replay',()=>{
  const f=fixture();const request=f.envelope();assert.equal(f.post(request).ok,true);assert.equal(f.sent.length,1);assert.equal(f.sent[0].name,'TreatStory');assert.equal(f.sent[0].to,'buyer@example.com');
  assert.equal(f.post(request).duplicate,true);assert.equal(f.sent.length,1);
  assert.equal(f.post({...request,payload:request.payload.replace('buyer@example.com','attacker@example.com')}).code,'UNAUTHORIZED');
  assert.equal(f.post(f.envelope('old',{timestamp:Date.now()-6*60_000})).code,'UNAUTHORIZED');
  assert.equal(f.post(f.envelope('event-a',{payload:JSON.stringify({to:['other@example.com'],subject:'x',text:'x',html:'x'})})).code,'ID_CONFLICT');assert.equal(f.sent.length,1);
});
test('complete Code.gs validates recipients, handles quota and stops ambiguous sends',()=>{
  const f=fixture();assert.equal(f.post(f.envelope('bad',{payload:JSON.stringify({to:['a@example.com','b@example.com'],subject:'x',text:'x',html:'x'})})).code,'INVALID_REQUEST');
  f.quota=0;const limited=f.envelope('quota');assert.equal(f.post(limited).code,'QUOTA_EXCEEDED');assert.equal(f.sent.length,0);
  f.quota=10;assert.equal(f.post(limited).ok,true);
  f.throwSend=true;const uncertain=f.envelope('uncertain');assert.equal(f.post(uncertain).code,'DELIVERY_UNCERTAIN');assert.equal(f.sent.length,2);assert.equal(f.post(uncertain).code,'DELIVERY_UNCERTAIN');assert.equal(f.sent.length,2,'uncertain sends must never be retried automatically');
});
test('server signing interoperates with the actual Code.gs relay and interprets duplicate receipts',async()=>{
  const f=fixture();const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/server/mail.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require,URL,AbortSignal,fetch:async(_url,options)=>Response.json(f.post(JSON.parse(options.body)))});
  const payload={to:['buyer@example.com'],subject:'TreatStory · കേക്ക്',text:'Cake ready',html:'<p>Cake ready</p>'};
  const config={endpoint:'https://script.google.com/macros/s/fixture/exec',secret};
  assert.equal(await module.exports.sendAppsScript(payload,config,'real-protocol'),'real-protocol');assert.equal(await module.exports.sendAppsScript(payload,config,'real-protocol'),'real-protocol');assert.equal(f.sent.length,1);
});
test('Apps Script installs one retry trigger and sends its cron secret only to this app',()=>{
  const f=fixture();f.context.installRetryTrigger();f.context.installRetryTrigger();assert.equal(f.triggers.length,1);assert.equal(f.triggers[0].minutes,5);
  f.context.processEmailQueue();assert.equal(f.fetch.url,'https://treatstory.vercel.app/api/email/process');assert.equal(f.fetch.options.headers.Authorization,'Bearer fixture-cron-secret');assert.equal(f.fetch.options.followRedirects,false);
  f.properties.set('APP_URL','https://attacker.example');assert.throws(()=>f.context.processEmailQueue());
});
