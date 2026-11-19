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
        // Radix Select locks body scroll. Opening it must not shift centered
        // content or remove the desktop scrollbar gutter / fixed sidebar.
        const desktop=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
        try {
          await desktop.goto(`http://127.0.0.1:${server.address().port}/?mode=dropdown`);
          const measure=()=>desktop.evaluate(()=>{
            const main=document.querySelector('[data-testid="dropdown-layout"]').getBoundingClientRect();
            const sidebar=document.querySelector('[data-testid="fixed-sidebar"]').getBoundingClientRect();
            return {mainLeft:main.left,mainRight:main.right,sideRight:sidebar.right,
              viewport:document.documentElement.clientWidth,
              bodyMargin:parseFloat(getComputedStyle(document.body).marginRight),
              bodyPadding:parseFloat(getComputedStyle(document.body).paddingRight),
              locked:document.body.hasAttribute('data-scroll-locked'),
              gutter:getComputedStyle(document.documentElement).scrollbarGutter,
              scrollHeight:document.documentElement.scrollHeight};
          });
          const before=await measure();
          assert.ok(before.scrollHeight>900,engine+' desktop fixture must overflow vertically');
          await desktop.getByRole('combobox',{name:'Delivery location'}).click();
          await desktop.getByRole('listbox').waitFor();
          await desktop.waitForFunction(()=>document.body.hasAttribute('data-scroll-locked'));
          const after=await measure();
          assert.ok(after.locked,engine+' fixture did not exercise Radix scroll-lock');
          assert.equal(after.gutter,'stable',engine+' keep desktop scrollbar gutter');
          assert.ok(Math.abs(before.mainLeft-after.mainLeft)<1,engine+' dropdown shifted centered page: '+JSON.stringify({before,after}));
          assert.ok(Math.abs(before.sideRight-after.sideRight)<1,engine+' dropdown shifted fixed sidebar: '+JSON.stringify({before,after}));
          assert.ok(Math.abs(before.bodyMargin-after.bodyMargin)<0.5,engine+' scroll lock added right body margin: '+JSON.stringify({before,after}));
          assert.ok(Math.abs(before.bodyPadding-after.bodyPadding)<0.5,engine+' scroll lock added right body padding: '+JSON.stringify({before,after}));
          await desktop.keyboard.press('Escape');
          await desktop.getByRole('listbox').waitFor({state:'hidden'});
          const restored=await measure();
          assert.ok(Math.abs(before.mainLeft-restored.mainLeft)<1,engine+' page moved after closing dropdown: '+JSON.stringify({before,restored}));
        } finally {await desktop.close();}
        if(process.env.TREATSTORY_DROPDOWN_ONLY === '1') {
          console.log(`PASS ${engine}: Shop All dropdown did not shift centered content or sidebar`);
          continue;
        }
        const seller = await browser.newPage({viewport:{width:320,height:568}});
        try {
          await seller.route('https://images.example.com/**', route => route.fulfill({
            contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGPct3oSAwwwMSABFA4ASg8CAQx4gxcAAAAASUVORK5CYII=','base64')
          }));
          for (const mode of ['ai-add','ai-edit']) {
            let calls = 0;
            await seller.route('**/api/seller/description', route => {
              if (route.request().method() === 'GET') return route.fulfill({json:{remaining:5}});
              calls++;
              return calls <= 2 ? route.fulfill({json:{description:'Suggested cocoa cookies.',remaining:5-calls}})
                : route.fulfill({status:503,json:{error:'Suggestions are unavailable.'}});
            });
            await seller.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
            const panel = seller.getByRole('region',{name:'AI description suggestion'});
            await panel.getByText('5 generations left today.').waitFor();
            await panel.getByText('Suggest with AI').click();
            const preview = panel.getByLabel('Review and edit your suggestion');
            await preview.fill('Edited cocoa cookies.');
            assert.equal(await seller.locator('#creatorDescription').inputValue(),'Original description');
            const fits = await panel.locator('button,textarea').evaluateAll(els=>els.every(el=>{
              const rect=el.getBoundingClientRect();
              return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 1;
            }));
            assert.ok(fits,engine+' '+mode+' AI controls fit at 320px');
            if (mode === 'ai-add') {
              await panel.getByText('Cancel',{exact:true}).click();
              assert.equal(await seller.locator('#creatorDescription').inputValue(),'Original description');
              await panel.getByText('Suggest with AI').click();
            } else {
              await panel.getByText('Regenerate').click();
            }
            await panel.getByText(/3 generations left today/).waitFor();
            await preview.fill('Edited cocoa cookies.');
            await panel.getByText('Use Description').click();
            await seller.getByRole('button',{name:'Close product editor'}).click();
            const confirmation = seller.getByRole('alertdialog',{name:'Discard your changes?'});
            await confirmation.getByRole('button',{name:'Keep editing'}).waitFor();
            assert.equal(await confirmation.getByRole('button',{name:'Keep editing'}).evaluate(el=>el===document.activeElement),true);
            for (const width of [320,360,375,390,430,1280]) {
              await seller.setViewportSize({width,height:568});
              assert.ok(await confirmation.evaluate(el=>{
                const rect=el.getBoundingClientRect();
                return rect.left>=0 && rect.right<=innerWidth+1 && el.scrollWidth<=el.clientWidth+1;
              }));
            }
            await seller.setViewportSize({width:320,height:568});
            await confirmation.getByRole('button',{name:'Keep editing'}).click();
            await confirmation.waitFor({state:'hidden'});
            assert.equal(await seller.locator('#creatorDescription').inputValue(),'Edited cocoa cookies.');
            await seller.evaluate(()=>history.back());
            await confirmation.waitFor();
            await seller.keyboard.press('Escape');
            await confirmation.waitFor({state:'hidden'});
            await panel.getByText('Suggest with AI').click();
            await panel.getByRole('alert').waitFor();
            async function checkWizardWidths() {
              for (const width of [320,360,375,390,430,768,1280]) {
                await seller.setViewportSize({width,height:700});
                assert.ok(await seller.getByRole('dialog').evaluate(el => {
                  const visible = [...el.querySelectorAll('input,textarea,button,summary')].filter(control=> control.getBoundingClientRect().width > 1);
                  return el.scrollWidth <= el.clientWidth + 1 && visible.every(control => {
                    const rect=control.getBoundingClientRect();
                    return rect.left >= -1 && rect.right <= innerWidth + 1;
                  });
                }),engine+' wizard controls fit '+width);
              }
              await seller.setViewportSize({width:320,height:568});
            }
            await checkWizardWidths();
            const next = seller.getByRole('button',{name:'Continue'});
            await seller.getByLabel('Product name').fill('');
            await next.click();
            await seller.getByText('Step 1 of 4').waitFor();
            await seller.getByLabel('Product name').fill('Cocoa cookies');
            await next.click();
            await seller.locator('#sellerPhotoFiles').setInputFiles([
              {name:'first.png',mimeType:'image/png',buffer:Buffer.from('fixture')},
              {name:'second.png',mimeType:'image/png',buffer:Buffer.from('fixture')}
            ]);
            await checkWizardWidths();
            await seller.getByRole('button',{name:'Set as cover'}).click();
            assert.match(await seller.getByAltText('Cover photo',{exact:true}).getAttribute('src'),/second.png$/);
            await seller.getByRole('button',{name:'Remove photo 2'}).click();
            await next.click();
            await seller.getByRole('button',{name:'Back',exact:true}).click();
            assert.match(await seller.getByAltText('Cover photo',{exact:true}).getAttribute('src'),/second.png$/);
            await next.click();
            if (mode === 'ai-edit') {
              await seller.getByText('Weight, size & variant pricing',{exact:true}).click();
              await seller.getByRole('button',{name:'Add another size & price'}).click();
              await seller.getByLabel('Weight / count').fill('250');
              await seller.getByLabel('Price for this size').fill('95');
              await seller.getByLabel('Size stock').fill('4');
              assert.equal(await seller.getByText('Price (₹)',{exact:true}).isVisible(),false);
            }
            await checkWizardWidths();
            await next.click();
            await seller.getByText('Step 4 of 4').waitFor();
            await seller.getByAltText('Listing cover').evaluate(img => img.decode());
            await checkWizardWidths();
            await seller.getByRole('button',{name: mode === 'ai-edit' ? 'Save changes' : 'Save as Draft'}).click();
            assert.equal(await seller.getByTestId('saved').textContent(),(mode === 'ai-edit' ? 'published' : 'draft') + '/Edited cocoa cookies.');
            await seller.setViewportSize({width:320,height:568});
            await seller.getByRole('button',{name:'Close product editor'}).click();
            await confirmation.getByRole('button',{name:'Discard changes'}).click();
            await seller.getByRole('dialog').waitFor({state:'hidden'});
            assert.equal(calls,3);
            await seller.unroute('**/api/seller/description');
          }
        } finally { await seller.close(); }
        for(const [width,height] of [[320,568],[360,640],[390,844],[568,320],[768,1024],[1440,900]]) {
          const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
          for(const mode of ['contact','dialog','alert','support']) {
            await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
            await page.locator('a[href^="mailto:"]').first().waitFor();
            if(mode==='support')await page.getByRole('button',{name:'New chat',exact:true}).click();
            const check=async()=>{
              const result=await page.evaluate(()=>{
                const width=document.documentElement.clientWidth;
                const bad=[...document.querySelectorAll('a[href^="mailto:"],[role="dialog"],[role="alertdialog"],[role="combobox"],[role="listbox"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1)}).map(el=>{const r=el.getBoundingClientRect();return {role:el.getAttribute('role')||el.tagName, left:Math.round(r.left), right:Math.round(r.right), width:Math.round(r.width), viewport:width, element:el.outerHTML.slice(0,145)};});
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
