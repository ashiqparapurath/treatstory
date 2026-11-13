require('tsx/cjs');
const projectRequire=require;
const { chromium, firefox, webkit, devices } = require('playwright');
const { initializeApp, cert, getApps, deleteApp } = projectRequire('firebase-admin/app');
const { getFirestore, Timestamp } = projectRequire('firebase-admin/firestore');
const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const configFile=process.env.SUPPORT_MATRIX_TEST_CONFIG;
if (!configFile) throw Error('Set SUPPORT_MATRIX_TEST_CONFIG to a local test-server configuration JSON file.');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const homeserver=config.homeserver ?? 'http://127.0.0.1:18008';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(homeserver)) throw Error('Integration tests require a loopback-only homeserver.');
const privateKey=require('node:crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
Object.assign(process.env, { NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED:'true',NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED:'true',SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED:'true',SUPPORT_MATRIX_HOMESERVER_URL:homeserver,SUPPORT_MATRIX_SERVER_NAME:'localhost',SUPPORT_MATRIX_JWT_SECRET:config.secret,SUPPORT_MATRIX_SERVICE_TOKEN:config.serviceToken,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',NEXT_PUBLIC_FIREBASE_PROJECT_ID:'demo-treatstory',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'demo-treatstory',client_email:'test@demo-treatstory.iam.gserviceaccount.com',private_key:privateKey}) });
const db=getFirestore(initializeApp({projectId:'demo-treatstory',credential:cert({projectId:'demo-treatstory',clientEmail:'test@demo-treatstory.iam.gserviceaccount.com',privateKey:require('node:crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})})}));
let base;
async function fixture() {
 const {NextRequest}=require('next/server');
 const root=fs.mkdtempSync(path.resolve('work/support-matrix-'));
 const output=path.join(root,'matrix-browser.mjs');
 const entry=path.join(root,'entry.tsx');
 fs.writeFileSync(entry, `import React from 'react';import {MatrixEvent} from 'matrix-js-sdk';window.MatrixEvent=MatrixEvent;import {createRoot} from 'react-dom/client';import {SecureSupportClient} from ${JSON.stringify(path.resolve('src/lib/support-matrix/client'))};import {SupportMatrixWorkspace} from ${JSON.stringify(path.resolve('src/components/support-matrix-workspace'))};window.SecureSupportClient=SecureSupportClient;window.mountUI=(account)=>{window.fixtureAccount={uid:account.uid,getIdToken:async()=>account.token};createRoot(document.getElementById('app')).render(<SupportMatrixWorkspace/>);};`);
 await require('esbuild').build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:'tsconfig.json',outfile:output,plugins:[{name:'fixture-account',setup(build){build.onResolve({filter:/^@\/firebase$/},()=>({path:'firebase',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useUser=()=>({user:window.fixtureAccount,isUserLoading:false});export const useFirestore=()=>null;export const useMemoFirebase=(fn)=>fn();export const useCollection=()=>({data:null,error:null,isLoading:false});export const useDoc=()=>({data:null,error:null,isLoading:false});',loader:'js'}));}}]});
 const wasm=path.join(path.dirname(require.resolve('@matrix-org/matrix-sdk-crypto-wasm')),'pkg/matrix_sdk_crypto_wasm_bg.wasm');
 const routes={transfers:require('../../src/app/api/support-matrix/transfers/route.ts'),session:require('../../src/app/api/support-matrix/session/route.ts'),conversations:require('../../src/app/api/support-matrix/conversations/route.ts'),devices:require('../../src/app/api/support-matrix/devices/route.ts'),legacy:require('../../src/app/api/support-matrix/legacy/route.ts')};
 const proxy=require('../../src/app/api/support-matrix/proxy/[...path]/route.ts');
 const users=new Map(),tokens=new Map();
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,base);
   if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Encrypted support test fixture</title><link rel="stylesheet" href="/style.css"><div id="app"></div><script type="module" src="/matrix-browser.mjs"></script>');return;}
   if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');const cssRoot=path.resolve('.next/static/css');res.end(fs.existsSync(cssRoot)?fs.readdirSync(cssRoot).filter(file=>file.endsWith('.css')).map(file=>fs.readFileSync(path.join(cssRoot,file),'utf8')).join('\n'):'');return;}
   if(url.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
   if(url.pathname==='/matrix-browser.mjs'||url.pathname==='/pkg/matrix_sdk_crypto_wasm_bg.wasm'){res.setHeader('Content-Type',url.pathname.endsWith('wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(url.pathname.endsWith('wasm')?wasm:output));return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const request=new NextRequest(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
   let result;
   if(url.pathname.startsWith('/api/support-matrix/proxy/'))result=await proxy[req.method](request,{params:Promise.resolve({path:url.pathname.slice('/api/support-matrix/proxy/'.length).split('/').map(decodeURIComponent)})});
   else {const route=routes[url.pathname.split('/').at(-1)];if(!route?.[req.method]){res.statusCode=404;res.end();return;}result=await route[req.method](request);}
   const payload=Buffer.from(await result.arrayBuffer());
   if(url.pathname==='/api/support-matrix/session' && req.method==='POST' && result.ok){const data=JSON.parse(payload);if(!users.has(data.userId))users.set(data.userId,users.size);tokens.set(data.accessToken,users.get(data.userId));}
   if(process.env.TRACE_SUPPORT_MATRIX_TEST==='true' && url.pathname.includes('/room_keys/')){let data={};try{data=JSON.parse(payload);}catch{}console.log('BACKUP',tokens.get((req.headers.authorization??'').slice(7)),req.method,url.pathname.split('/room_keys/')[1].split('/').slice(0,2).join('/'),url.searchParams.get('version'),result.status,data.count??(data.rooms?Object.values(data.rooms).reduce((n,room)=>n+Object.keys(room.sessions??{}).length,0):''));}
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(payload);
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error instanceof Error?error.message:'Fixture error'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 return {close:()=>{server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true});}};
}

async function user(role){
 const res=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'-'+crypto.randomUUID()+'@test.local',password:'local-test-password',returnSecureToken:true})});
 const data=await res.json();assert.ok(data.localId,JSON.stringify(data));
 if(role==='agent')await db.doc('roles_admin/'+data.localId).set({});
 return {uid:data.localId,token:data.idToken};
}
async function eventually(page,predicate,arg,options={timeout:15000}) {
 const deadline=Date.now()+options.timeout;
 while(Date.now()<deadline){if(await page.evaluate(predicate,arg))return;await new Promise(resolve=>setTimeout(resolve,150));}
 throw Error('Timed out waiting for an asynchronous integration condition.');
}
async function boot(browser,account){
 const context=await browser.newContext();const page=await context.newPage();
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 page.on('response',async r=>{if(r.status()>=400 && r.url().includes('/api/support-matrix'))console.log('HTTP',r.status(),new URL(r.url()).pathname, (await r.text().catch(()=>'' )).slice(0,300));});
 await page.goto(base);await page.waitForFunction(()=>window.SecureSupportClient);
 await page.evaluate(async account=>{
  window.verifications=[];window.revision=0;
  window.chat=new window.SecureSupportClient({uid:account.uid,getIdToken:async()=>account.token},()=>window.revision++,v=>{window.verification=v;});
  await window.chat.start();
 },account);
 return {context,page};
}
(async()=>{
 fs.mkdirSync('work',{recursive:true});const server=await fixture();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
  const buyer=await user('buyer');const agent=await user('agent');
  const a=await boot(browser,buyer);console.log('buyer started',await a.page.evaluate(()=>chat.ready()));
  const b=await boot(browser,agent);console.log('agent started',await b.page.evaluate(()=>chat.ready()));
  const list=await a.page.evaluate(()=>chat.api('conversations'));assert.ok(list.agents.some(item=>item.uid===agent.uid));
  const room=await a.page.evaluate(async agentUid=>chat.api('conversations',{action:'create',requestId:crypto.randomUUID(),agentUid,category:'other',orderId:''}),agent.uid);
  console.log('room created');
  await Promise.all([a.page.evaluate(roomId=>chat.join(roomId),room.roomId),b.page.evaluate(roomId=>chat.join(roomId),room.roomId)]);
  await Promise.all([eventually(a.page,async()=>{await chat.devices();return chat.ready();},{},{timeout:15000}),eventually(b.page,async()=>{await chat.devices();return chat.ready();},{},{timeout:15000})]);
  const agentMatrix=await b.page.evaluate(()=>chat.userId);
  await a.page.evaluate(peer=>chat.verifyPeer(peer),agentMatrix);
  await b.page.waitForFunction(()=>window.verification?.phase===2,{},{timeout:15000});
  await b.page.evaluate(()=>chat.acceptVerification());
  await a.page.waitForFunction(()=>window.verification?.phase===3,{},{timeout:15000});
  await a.page.evaluate(()=>chat.startVerification());
  await Promise.all([a.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000}),b.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000})]);
  assert.deepEqual(await a.page.evaluate(()=>verification.sas),await b.page.evaluate(()=>verification.sas));
  await Promise.all([a.page.evaluate(()=>chat.confirmVerification()),b.page.evaluate(()=>chat.confirmVerification())]);
  await a.page.waitForFunction(()=>window.verification?.phase===6,{},{timeout:15000});
  console.log('participants cryptographically verified');
  const backupVersion=await a.page.evaluate(()=>chat.client.getCrypto().getActiveSessionBackupVersion());
  const recovery=await a.page.evaluate(()=>chat.setupRecovery());assert.ok(recovery);
  assert.equal(await a.page.evaluate(()=>chat.client.getCrypto().getActiveSessionBackupVersion()),backupVersion);
  console.log('encrypted recovery backup configured');
  await a.page.evaluate(async({roomId,peer})=>chat.send(roomId,'private first message',crypto.randomUUID(),peer),{roomId:room.roomId,peer:agentMatrix});
  await b.page.waitForFunction(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='private first message'),room.roomId,{timeout:15000});
  assert.equal(await b.page.evaluate(roomId=>chat.messages(roomId).some(e=>e.getWireContent().body==='private first message'),room.roomId),false);
  console.log('real-time message decrypted; transport contains ciphertext');
  await a.page.evaluate(async roomId=>{await chat.saveDraft(roomId,'private draft');if(await chat.loadDraft(roomId)!=='private draft')throw Error('Draft persistence failed');},room.roomId);
  console.log('encrypted device-local draft round-trip passed');
  const legacyCrypto=require('../../src/lib/support-encryption.ts');
  const oldKey=await legacyCrypto.generateSupportKey('local-test-legacy-passphrase');
  const oldTicket='pilot-'+crypto.randomUUID();
  await db.doc('support_chat_keys/user_'+buyer.uid).set(oldKey);
  await db.doc('support_tickets/'+oldTicket).set({ownerUid:buyer.uid,encrypted:true,ownerPublicKey:oldKey.publicKey,teamPublicKey:oldKey.publicKey,status:'closed',category:'other',createdAt:Timestamp.now()});
  const oldCipher=await legacyCrypto.encryptSupportMessage('preserved pilot history',oldKey.publicKey,oldKey.publicKey);
  await db.doc('support_tickets/'+oldTicket+'/messages/first').set({...oldCipher,senderUid:buyer.uid,createdAt:Timestamp.fromMillis(Date.now()-86400000)});
  const imported=await a.page.evaluate(({ticketId,roomId,peer})=>chat.migrateHistory(ticketId,roomId,peer,'local-test-legacy-passphrase'),{ticketId:oldTicket,roomId:room.roomId,peer:agentMatrix});
  assert.equal(imported,1);
  assert.equal(await a.page.evaluate(({ticketId,roomId,peer})=>chat.migrateHistory(ticketId,roomId,peer,'local-test-legacy-passphrase'),{ticketId:oldTicket,roomId:room.roomId,peer:agentMatrix}),0);
  assert.equal((await db.doc('support_tickets/'+oldTicket).get()).data().status,'closed');
  assert.equal((await db.doc('support_tickets/'+oldTicket+'/messages/first').get()).data().ciphertext,oldCipher.ciphertext);
  await b.page.waitForFunction(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='preserved pilot history'),room.roomId,{timeout:15000});
  console.log('legacy import round-trip, resumability and source preservation passed');
  const direct=await fetch('http://127.0.0.1:8080/v1/projects/demo-treatstory/databases/(default)/documents/support_matrix_accounts/'+buyer.uid,{headers:{Authorization:'Bearer '+buyer.token}});
  assert.equal(direct.status,403);console.log('Firestore rules deny direct client access to messaging account records');
  const metadataURL='http://127.0.0.1:8080/v1/projects/demo-treatstory/databases/(default)/documents/support_matrix_conversations/'+room.id;
  for(const account of [buyer,agent])assert.equal((await fetch(metadataURL,{headers:{Authorization:'Bearer '+account.token}})).status,200);
  assert.equal((await fetch(metadataURL,{method:'PATCH',headers:{Authorization:'Bearer '+buyer.token,'Content-Type':'application/json'},body:JSON.stringify({fields:{agentUid:{stringValue:buyer.uid}}})})).status,403);
  console.log('routing metadata is readable by participants and cannot be written directly');

  const pending=await boot(browser,buyer);assert.equal(await pending.page.evaluate(()=>chat.ready()),false);console.log('pending device blocked');
  await pending.page.evaluate(roomId=>chat.join(roomId),room.roomId);
  await pending.page.waitForFunction(roomId=>chat.messages(roomId).length>0,room.roomId,{timeout:15000});
  assert.equal(await pending.page.evaluate(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='private first message'),room.roomId),false);
  console.log('pending device cannot read history');
  await assert.rejects(pending.page.evaluate(roomId=>chat.api('conversations',{action:'close',roomId}),room.roomId));
  await pending.page.evaluate(()=>chat.link());
  await a.page.waitForFunction(()=>window.verification?.phase===2,{},{timeout:15000});
  await a.page.evaluate(()=>chat.cancelVerification());
  await pending.page.waitForFunction(()=>window.verification?.phase===5,{},{timeout:15000});
  assert.equal(await pending.page.evaluate(()=>chat.ready()),false);console.log('pending self-approval and rejected enrollment cannot authorize access');
  await pending.page.evaluate(()=>chat.link());
  await a.page.waitForFunction(()=>window.verification?.phase===2,{},{timeout:15000});
  console.log('verification requested',await a.page.evaluate(()=>({phase:verification.phase,initiated:verification.initiated})));
  await a.page.evaluate(()=>chat.acceptVerification());
  await pending.page.waitForFunction(()=>window.verification?.phase===3,{},{timeout:15000});
  await pending.page.evaluate(()=>chat.startVerification());
  await Promise.all([a.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000}),pending.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000})]);
  const sas1=await a.page.evaluate(()=>verification.sas);const sas2=await pending.page.evaluate(()=>verification.sas);assert.deepEqual(sas1,sas2);
  await Promise.all([a.page.evaluate(()=>chat.confirmVerification()),pending.page.evaluate(()=>chat.confirmVerification())]);
  await eventually(pending.page,async()=>await chat.ready(),{},{timeout:15000});console.log('SAS linked device approved');
  await eventually(pending.page,async roomId=>{try {await chat.restoreHistory();}catch{}return chat.messages(roomId).some(e=>e.getContent().body==='private first message');},room.roomId,{timeout:20000});
  console.log('verified device synchronized encrypted history');
  await eventually(a.page,async roomId=>{const version=await chat.client.getCrypto().getActiveSessionBackupVersion();const saved=await chat.client.http.authedRequest('GET','/room_keys/keys',{version});return chat.messages(roomId).length>=2 && chat.messages(roomId).every(event=>!!saved.rooms?.[roomId]?.sessions?.[event.getWireContent().session_id]);},room.roomId,{timeout:45000});
  console.log('encrypted backup durably contains the message sessions before device loss');
  await a.page.evaluate(()=>chat.stop());await pending.page.evaluate(()=>chat.stop());
  const recoveryDevice=await boot(browser,buyer);
  assert.equal(await recoveryDevice.page.evaluate(()=>chat.userId),await a.page.evaluate(()=>chat.userId));
  await assert.rejects(recoveryDevice.page.evaluate(()=>chat.recover('invalid recovery code')));
  await recoveryDevice.page.evaluate(code=>chat.recover(code),recovery);
  await recoveryDevice.page.evaluate(roomId=>chat.join(roomId),room.roomId);
  try {await recoveryDevice.page.waitForFunction(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='private first message'),room.roomId,{timeout:20000});}catch(error){console.log('recovery diagnostics',await recoveryDevice.page.evaluate(async roomId=>({ready:await chat.ready(),keyCount:(await chat.client.getCrypto().exportRoomKeys()).length,restored:chat.recoveryProgress,active:await chat.client.getCrypto().getActiveSessionBackupVersion(),remote:await chat.client.http.authedRequest('GET','/room_keys/version').then(info=>({version:info.version,count:info.count})),backupRooms:await chat.client.http.authedRequest('GET','/room_keys/keys',{version:'1'}).then(data=>Object.fromEntries(Object.entries(data.rooms).map(([id,room])=>[id,Object.keys(room.sessions)]))),events:chat.messages(roomId).map(e=>({reason:e.decryptionFailureReason,session:e.getWireContent().session_id}))}),room.roomId));throw error;}
  console.log('user-held recovery restores history; invalid code rejected');
  for(const device of [a,pending])await device.page.evaluate(async account=>{window.chat=new window.SecureSupportClient({uid:account.uid,getIdToken:async()=>account.token},()=>window.revision++,v=>window.verification=v);await chat.start();},buyer);
  console.log('original device reload persistence passed after offline recovery');

  const pendingId=await pending.page.evaluate(()=>chat.deviceId);
  await a.page.evaluate(deviceId=>chat.api('devices',{deviceId}),pendingId);
  await assert.rejects(pending.page.evaluate(()=>chat.client.getDevices()));
  console.log('revoked device transport denied');
  const future=await a.page.evaluate(async({roomId,peer})=>chat.send(roomId,'future message after revocation',crypto.randomUUID(),peer).then(result=>({event_id:result.event_id})).catch(error=>{throw new Error(error.message??'Encrypted send failed');}),{roomId:room.roomId,peer:agentMatrix});
  const wire=await a.page.evaluate(({roomId,eventId})=>chat.client.fetchRoomEvent(roomId,eventId),{roomId:room.roomId,eventId:future.event_id});
  assert.equal(await pending.page.evaluate(async wire=>{const event=new window.MatrixEvent(wire);try{await chat.client.decryptEventIfNeeded(event);}catch{}return event.getContent().body==='future message after revocation';},wire),false);
  await b.page.waitForFunction(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='future message after revocation'),room.roomId,{timeout:15000});
  assert.equal(await b.page.evaluate(async wire=>{wire=structuredClone(wire);wire.content.ciphertext=(wire.content.ciphertext[0]==='A'?'B':'A')+wire.content.ciphertext.slice(1);wire.event_id='$tampered';const event=new window.MatrixEvent(wire);try{await chat.client.decryptEventIfNeeded(event);}catch{}return event.getContent().body==='future message after revocation';},wire),false);
  await b.page.evaluate(async roomId=>{const event=chat.messages(roomId).find(e=>e.getContent().body==='future message after revocation');if(!await chat.validateMessage(event))throw Error('Original message validation failed');},room.roomId);
  assert.equal(await b.page.evaluate(async wire=>{wire=structuredClone(wire);wire.event_id='$replayed';const event=new window.MatrixEvent(wire);try{await chat.client.decryptEventIfNeeded(event);}catch{}return await chat.validateMessage(event);},wire),false);
  console.log('new session keys exclude revoked devices; modified ciphertext and replay rejected');

  await a.page.evaluate(roomId=>chat.api('conversations',{action:'close',roomId}),room.roomId);
  await assert.rejects(a.page.evaluate(async({roomId,peer})=>chat.send(roomId,'must fail closed',crypto.randomUUID(),peer),{roomId:room.roomId,peer:agentMatrix}));
  await a.page.evaluate(roomId=>chat.api('conversations',{action:'reopen',roomId}),room.roomId);
  console.log('conversation close/reopen enforced');
  const nextAgent=await user('agent');const next=await boot(browser,nextAgent);
  await eventually(next.page,async()=>{await chat.devices();return chat.ready();},{},{timeout:15000});
  const beforeAssignment=await next.page.evaluate(()=>chat.api('conversations'));assert.equal(beforeAssignment.tickets.length,0);
  assert.equal((await fetch(metadataURL,{headers:{Authorization:'Bearer '+nextAgent.token}})).status,403);
  await a.page.evaluate(({roomId,agentUid})=>chat.api('conversations',{action:'reassign',roomId,agentUid}),{roomId:room.roomId,agentUid:nextAgent.uid});
  const afterAssignment=await next.page.evaluate(()=>chat.api('conversations'));assert.ok(afterAssignment.tickets.some(ticket=>ticket.roomId===room.roomId));
  await next.page.evaluate(roomId=>chat.join(roomId),room.roomId);
  await assert.rejects(b.page.evaluate(roomId=>chat.client.roomState(roomId),room.roomId));
  console.log('reassignment removes the former agent and grants only the new assignment');
  const nextMatrix=await next.page.evaluate(()=>chat.userId);
  await a.page.evaluate(peer=>chat.verifyPeer(peer),nextMatrix);
  await next.page.waitForFunction(()=>window.verification?.phase===2,{},{timeout:15000});
  await next.page.evaluate(()=>chat.acceptVerification());
  await a.page.waitForFunction(()=>window.verification?.phase===3,{},{timeout:15000});
  await a.page.evaluate(()=>chat.startVerification());
  await Promise.all([a.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000}),next.page.waitForFunction(()=>!!window.verification?.sas,{},{timeout:15000})]);
  assert.deepEqual(await a.page.evaluate(()=>verification.sas),await next.page.evaluate(()=>verification.sas));
  await Promise.all([a.page.evaluate(()=>chat.confirmVerification()),next.page.evaluate(()=>chat.confirmVerification())]);
  await a.page.waitForFunction(()=>window.verification?.phase===6,{},{timeout:15000});
  await eventually(a.page,async peer=>(await chat.client.getCrypto().getUserVerificationStatus(peer)).isVerified(),nextMatrix,{timeout:15000});
  assert.ok(await a.page.evaluate(({roomId,peer})=>chat.shareHistory(roomId,peer),{roomId:room.roomId,peer:nextMatrix})>0);
  await next.page.waitForFunction(roomId=>chat.messages(roomId).some(e=>e.getContent().body==='private first message'&&e.getContent()['org.treatstory.transfer']),room.roomId,{timeout:20000});
  assert.equal(await a.page.evaluate(({roomId,peer})=>chat.shareHistory(roomId,peer),{roomId:room.roomId,peer:nextMatrix}),0);
  console.log('explicit encrypted history transfer to the verified replacement agent is idempotent');

  await db.doc('roles_admin/'+agent.uid).delete();
  await assert.rejects(b.page.evaluate(()=>chat.client.getDevices()));
  assert.equal((await fetch(metadataURL,{headers:{Authorization:'Bearer '+agent.token}})).status,403);
  console.log('removed administrator transport and unassigned metadata access denied');
  await a.page.evaluate(roomId=>chat.saveDraft(roomId,'private draft'),room.roomId);
  await a.page.evaluate(()=>chat.stop());
  await a.page.evaluate(account=>mountUI(account),buyer);
  await a.page.getByText('Encrypted messaging · verified device',{exact:true}).waitFor({timeout:30000});
  assert.ok(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await a.page.getByRole('button',{name:'New chat',exact:true}).click();
  await a.page.getByRole('combobox',{name:'Support topic'}).click();
  await a.page.getByRole('option',{name:'Payment',exact:true}).waitFor();
  await a.page.getByRole('option',{name:'Something else',exact:true}).click();
  await a.page.locator('[data-conversation-id="'+room.id+'"]').click();
  await a.page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  assert.equal(await a.page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'private draft');
  await a.page.setViewportSize({width:390,height:844});
  await a.page.screenshot({path:'work/support-matrix-mobile.png'});
  assert.ok(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await a.page.setViewportSize({width:390,height:500});
  const composer=await a.page.getByRole('textbox',{name:'Message',exact:true}).boundingBox();assert.ok(composer.y+composer.height<=500);
  await a.page.getByRole('button',{name:'Back to conversations',exact:true}).click();
  await a.page.getByRole('button',{name:'Devices and recovery',exact:true}).click();
  await a.page.getByRole('dialog').waitFor();
  assert.ok(await a.page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')));
  console.log('desktop/mobile workspace, restored draft, keyboard viewport and accessible device dialog passed');

  // Browser-engine compatibility, not physical-device certification.
  // This uses the same locally served browser module as the verified Synapse test.
  for (const [name, engine, options] of [
    ['Firefox mobile viewport', firefox, { viewport: { width: 412, height: 915 } }],
    ['WebKit iPhone emulation', webkit, devices['iPhone 13']],
  ]) {
    const candidate = await engine.launch({ headless: true });
    try {
      const context = await candidate.newContext(options);
      const page = await context.newPage();
      await page.goto(base);
      await page.waitForFunction(() => typeof window.SecureSupportClient === 'function', null, { timeout: 30000 });
      const capability = await page.evaluate(async () => {
        const name = 'treatstory-browser-capability-' + crypto.randomUUID();
        const req = indexedDB.open(name, 1);
        const store = await new Promise((resolve, reject) => {
          req.onupgradeneeded = () => req.result.createObjectStore('checks');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        store.close();
        indexedDB.deleteDatabase(name);
        const sum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('support'));
        return { secure: isSecureContext, crypto: sum.byteLength === 32,
          indexedDB: true, loaded: typeof window.SecureSupportClient === 'function',
          viewport: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.deepEqual(capability, { secure: true, crypto: true, indexedDB: true,
        loaded: true, viewport: true }, name + ' failed capability smoke');
      await context.close();
      console.log(name + ' passed module, WebCrypto, IndexedDB and viewport smoke');
    } finally { await candidate.close(); }
  }


 }finally{await browser.close();server.close();for(const app of getApps())await getFirestore(app).terminate();await Promise.all(getApps().map(deleteApp));}
})().catch(e=>{console.error(e);process.exitCode=1;});
