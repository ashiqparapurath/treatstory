const { chromium } = require('playwright');
const ts = require('typescript');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const source = ts.transpileModule(fs.readFileSync('src/lib/support-device-key.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Support key persistence test</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();
  await context.addInitScript({content:'window.exports={};\n'+source+'\nwindow.support=window.exports;'});
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  const url='http://127.0.0.1:'+server.address().port;
  await Promise.all(pages.map(page=>page.goto(url)));
  const keys=await Promise.all(pages.map(page=>page.evaluate(async()=>{
   const key=await support.createSupportDeviceKey('browser-customer');
   return {publicKey:key.publicKey,extractable:key.privateKey.extractable};
  })));
  assert.deepEqual(keys[0],keys[1]);assert.equal(keys[0].extractable,false);
  await pages[0].reload();
  const loaded=await pages[0].evaluate(async()=> (await support.loadSupportDeviceKey('browser-customer')).publicKey);
  assert.deepEqual(loaded,keys[0].publicKey);
  console.log('PASS: real Chromium IndexedDB, concurrent tabs retain one key; reload preserves non-extractable identity.');
 } finally {if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
