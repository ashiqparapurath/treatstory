// Isolated real-component layout checks; no production accounts or API writes.
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, firefox, webkit } = require('playwright');
(async () => {
  fs.mkdirSync('work/responsive', { recursive: true });
  await require('esbuild').build({ entryPoints:['scripts/audit/responsive-fixture.tsx'], bundle:true, platform:'browser', format:'esm', jsx:'automatic', tsconfig:'tsconfig.json', outfile:'work/responsive/fixture.js', define:{'process.env.NODE_ENV':'"production"','process.env.LEGAL_CONTACT_EMAIL':JSON.stringify('support-'+'longaddress'.repeat(12)+'@treatstory.example'),'process.env':'{}'}, plugins:[{name:'link-fixture',setup(build){build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react"; export default function Link(props){return React.createElement("a",props)}',loader:'js',resolveDir:process.cwd()}));}}] });
  const css = fs.readdirSync('.next/static/css').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/css/'+f,'utf8')).join('\n');
  const server = http.createServer((req,res)=>{
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('work/responsive/fixture.js'));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for(const [engine,type] of Object.entries({chromium,firefox,webkit})) {
      const browser=await type.launch({headless:true});
      try {
        for(const [width,height] of [[320,568],[360,640],[390,844],[568,320],[768,1024],[1440,900]]) {
          const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
          for(const mode of ['contact','dialog','alert','support']) {
            await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
            await page.locator('a[href^="mailto:"]').first().waitFor();
            if(mode==='support')await page.getByRole('button',{name:'New chat',exact:true}).click();
            const check=async()=>{
              const result=await page.evaluate(()=>{
                const width=document.documentElement.clientWidth;
                const bad=[...document.querySelectorAll('a[href^="mailto:"],[role="dialog"],[role="alertdialog"],[role="combobox"],[role="listbox"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1)}).map(el=>el.outerHTML.slice(0,180));
                return {overflow:document.documentElement.scrollWidth>width+1,bad};
              });
              assert.equal(result.overflow,false,`${engine} ${width}x${height} ${mode}: page overflow`);
              assert.deepEqual(result.bad,[],`${engine} ${width}x${height} ${mode}: control overflow`);
            };
            await check();
            if(mode!=='support'){
              await page.getByRole('combobox').click();
              await page.getByRole('listbox').waitFor();
              await check();
              await page.keyboard.press('Escape');
            }
            await page.screenshot({path:`work/responsive/${engine}-${width}-${height}-${mode}.png`,fullPage:true});
          }
          await page.close();
        }
      } finally {await browser.close();}
      console.log(`PASS ${engine}: contact, dialogs, dropdown and support layout at six viewport sizes`);
    }
  } finally {server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
