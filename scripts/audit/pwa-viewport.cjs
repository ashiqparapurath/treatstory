// Browser-rendered geometry tests of actual storefront components using synthetic inputs.
// The real backend is never contacted. Chromium and WebKit approximate mobile Android/iOS engines.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),{chromium,webkit}=require('playwright');
const path=require('node:path');
const out='work/pwa-viewport';
const placeholder=encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><rect width="200" height="240" fill="#e6cdb5"/><circle cx="120" cy="75" r="50" fill="#aa7956"/><circle cx="70" cy="160" r="55" fill="#744327"/></svg>');
const mocks={
 'next/link':"import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}",
 'next/navigation':"export function usePathname(){return '/'}",
 '@/firebase':"export function useUser(){return {user:null,isUserLoading:false}};export function useAccountRole(){return {role:null,isRoleLoading:false,roleError:null}}",
 '@/context/cart-context':"export function useCart(){return {cartCount:2,addToCart(){}}}",
 '@/hooks/use-mobile-attention':"export function useMobileAttention(){return {orders:false,applications:false}}",
 '@/components/more-navigation-trail':"export function MoreNavigationTrail(){return null}",
 '@/hooks/use-toast':"export function useToast(){return {toast(){}}}",
 '@/components/favorite-toggle':"import React from 'react';export function FavoriteToggle({title}){return React.createElement('button',{type:'button','aria-label':'Save '+title,className:'flex h-11 w-11 items-center justify-center rounded-full border bg-white text-[#754328]'},'♡')}",
 '@/components/product-image':"import React from 'react';export function ProductImage(props){return React.createElement('img',{src:'data:image/svg+xml,"+placeholder+"',alt:props.alt,className:'absolute inset-0 h-full w-full object-cover'})}",
 '@/hooks/use-product-gallery':"export function useProductGallery(){return {index:0,direction:'next',onTouchStart(){},onTouchEnd(){},onClickCapture(){},move(){},select(){}}}",
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await esbuild.build({entryPoints:['scripts/audit/pwa-viewport-fixture.tsx'],bundle:true,platform:'browser',format:'esm',
  jsx:'automatic',tsconfig:'tsconfig.json',outfile:path.join(out,'fixture.js'),
  define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fixture-mocks',setup(build){
   build.onResolve({filter:/^(next\/link|next\/navigation|@\/firebase|@\/context\/cart-context|@\/hooks\/use-mobile-attention|@\/components\/more-navigation-trail|@\/hooks\/use-toast|@\/components\/favorite-toggle|@\/components\/product-image|@\/hooks\/use-product-gallery)$/},args=>({path:args.path,namespace:'fixture'}));
   build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));
  }}]});
 const cssDir='.next/static/css';
 const css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(cssDir,f),'utf8')).join('\n');
 assert.ok(css.includes('pwa-bottom-nav'),'production stylesheet must include mobile navigation styles');
 const srv=http.createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(out,'fixture.js')))}
  else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(css)}
  else{res.setHeader('content-type','text/html');res.end('<!doctype html><html style="--font-sans: Arial, Helvetica, sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body style="font-family:Arial,Helvetica,sans-serif"><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>')}
 });
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 try{
  for(const [name,browserEngine] of Object.entries({chromium,webkit})){
   const browser=await browserEngine.launch({headless:true});
   try{
    for(const width of [320,360,375,390,430,768]){
     const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768});
     const issues=[];
     page.on('pageerror',err=>issues.push(err.message));
     await page.goto('http://127.0.0.1:'+srv.address().port+'/');
     await page.getByRole('heading',{name:'Featured products'}).waitFor();
     const metrics=await page.evaluate(()=>{
      const w=document.documentElement.clientWidth;
      const target=[...document.querySelectorAll('header a,header input,nav[aria-label="Mobile navigation"] a,article button,article a')];
      const outside=target.filter(el=>{const r=el.getBoundingClientRect();const style=getComputedStyle(el);return style.display!=='none'&&r.width>0&&(r.left<-1||r.right>w+1)}).map(el=>el.outerHTML.slice(0,135));
      const nav=document.querySelector('nav[aria-label="Mobile navigation"]');
      const tabs=nav?[...nav.querySelectorAll('a')]:[];
      return{viewport:w,scrollWidth:document.documentElement.scrollWidth,outside,
       mobileTabs:tabs.filter(a=>getComputedStyle(a).display!=='none').length,
       cartTargets:[...document.querySelectorAll('article button[aria-label^="Add "]')].map(x=>x.getBoundingClientRect().width).filter(w=>w>0).map(Math.round),
       unavailable:[...document.querySelectorAll('article button[disabled]')].filter(x=>getComputedStyle(x).display!=='none'&&x.textContent?.trim()==='Unavailable').length,
       mobileOverlay:[...document.querySelectorAll('article .sm\\:hidden')].filter(x=>x.textContent?.includes('Unavailable')).length};
     });
     assert.deepEqual(issues,[],name+' '+width+' browser errors');
     assert.ok(metrics.scrollWidth<=metrics.viewport+1,name+' '+width+' horizontal document overflow: '+JSON.stringify(metrics));
     assert.deepEqual(metrics.outside,[],name+' '+width+' clipped actionable UI');
     if(width<768){
      assert.equal(metrics.mobileTabs,5,name+' '+width+' mobile tabs');
      assert.ok(metrics.cartTargets.every(v=>v>=43),name+' '+width+' cart buttons >=44 CSS px');
      assert.ok(metrics.unavailable >= 1,name+' '+width+' disabled unavailable action is visible');
     }
     await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:false});
     await page.close();
    }
   }finally{await browser.close();}
   console.log('PASS '+name+': 320, 360, 375, 390, 430 and 768px PWA geometry');
  }
 }finally{srv.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
