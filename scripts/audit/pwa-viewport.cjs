// Browser-rendered geometry tests of actual storefront components using synthetic inputs.
// The real backend is never contacted. Chromium and WebKit approximate mobile Android/iOS engines.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),{chromium,webkit}=require('playwright');
const path=require('node:path');
const out='work/pwa-viewport';
const placeholder=encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><rect width="200" height="240" fill="#e6cdb5"/><circle cx="120" cy="75" r="50" fill="#aa7956"/><circle cx="70" cy="160" r="55" fill="#744327"/></svg>');
const mocks={
 'next/link':"import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}",
 'next/navigation':"export function usePathname(){return window.location.pathname};export function useParams(){return {id:'seller:sample-handmade'}};export function useRouter(){return {push(){}}}",
 '@/firebase':"export function useUser(){return {user:null,isUserLoading:false}};export function useAccountRole(){return {role:null,isRoleLoading:false,roleError:null}};const sharedDb={};export function useFirestore(){return sharedDb}",
 '@/context/cart-context':"export function useCart(){return {cartCount:2,addToCart(){},startDirectCheckout(){}}};export function cartLineId(){return 'sample-line'}",
 '@/hooks/use-mobile-attention':"export function useMobileAttention(){return {orders:false,applications:false}}",
 '@/components/more-navigation-trail':"export function MoreNavigationTrail(){return null}",
 '@/components/mobile-location-indicator':"import React from 'react';export function MobileLocationIndicator(){return React.createElement('button',{'aria-label':'Detect your current location'},'Detect your area')}",
 '@/hooks/use-scroll-to-top':"export function useScrollToTop(){}",
 '@/components/product-reviews':"export function ProductReviews(){return null};export function ProductRatingBadge(){return null}",
 '@/components/product-share-button':"import React from 'react';export function ProductShareButton(){return React.createElement('button',{type:'button','aria-label':'Share product',className:'flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm'},'↗')}",
 '@/components/product-sku-copy':"export function ProductSkuCopy(){return null}",
 '@/lib/user-notices':"export class ActionError extends Error{};export function getErrorNotice(e){return {description:String(e)}}",
 'firebase/firestore':"export function doc(_db,collection,id){return {collection,id}};export async function getDoc(ref){return {exists:()=>true,id:ref.id,data:()=>ref.collection==='sellers'?{businessName:'Test Creator',logoUrl:'',whatsappNumber:'97412345678'}:{id:'sample-handmade',sellerId:'sample-creator',status:'published',name:'Blush Meadow Bouquet',category:'Gifts',price:1599,description:'A soft blush bouquet of hand-arranged seasonal blooms, made to order with care.',imageUrls:['https://example.test/fixture-product.jpg'],showPrice:true,availability:'made-to-order',stockQuantity:9,weightOptions:[{value:0.5,unit:'kg',price:1599,stockQuantity:9},{value:1,unit:'kg',price:2599,stockQuantity:9},{value:1.5,unit:'kg',price:3599,stockQuantity:9},{value:2,unit:'kg',price:4599,stockQuantity:9},{value:4,unit:'kg',price:7999,stockQuantity:9}]}}}",
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
   build.onResolve({filter:/^(next\/link|next\/navigation|@\/firebase|@\/context\/cart-context|@\/hooks\/use-mobile-attention|@\/components\/more-navigation-trail|@\/components\/mobile-location-indicator|@\/hooks\/use-scroll-to-top|@\/components\/product-reviews|@\/components\/product-share-button|@\/components\/product-sku-copy|@\/lib\/user-notices|firebase\/firestore|@\/hooks\/use-toast|@\/components\/favorite-toggle|@\/components\/product-image|@\/hooks\/use-product-gallery)$/},args=>({path:args.path,namespace:'fixture'}));
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
     if(width<768){
       await page.goto('http://127.0.0.1:'+srv.address().port+'/product/synthetic', {waitUntil:'domcontentloaded'});
       await page.getByRole('heading',{name:'Blush Meadow Bouquet'}).waitFor();
       await page.getByRole('group',{name:'Select weight or size'}).waitFor();
       await page.getByRole('link',{name:/Test Creator/}).waitFor();
       const quick=page.getByRole('complementary',{name:'Quick purchase'});
       await quick.waitFor();
       const detailLayout=await page.evaluate(()=>{
         const nav=document.querySelector('nav[aria-label="Mobile navigation"]');
         const bar=document.querySelector('aside[aria-label="Quick purchase"]');
         const nr=nav?.getBoundingClientRect(),br=bar?.getBoundingClientRect();
         const explore=nav?.querySelector('a[href="/products"]');
         return {nav:nr?{top:nr.top,bottom:nr.bottom,left:nr.left,right:nr.right}:null,
          buyBar:br?{top:br.top,bottom:br.bottom,left:br.left,right:br.right}:null,
          exploreActive:explore?.getAttribute('aria-current')==='page',width:innerWidth,height:innerHeight,
          scrollWidth:document.documentElement.scrollWidth};
       });
       assert.ok(detailLayout.nav && detailLayout.buyBar,name+' '+width+' product nav and quick purchase bar both visible');
       assert.equal(detailLayout.exploreActive,true,name+' '+width+' Explore active on product detail');
       assert.ok(detailLayout.nav.top >= detailLayout.buyBar.bottom-1,name+' '+width+' purchase bar overlaps bottom nav: '+JSON.stringify(detailLayout));
       assert.ok(detailLayout.nav.top-detailLayout.buyBar.bottom <= 16,name+' '+width+' large gap between buy bar and nav');
       assert.ok(detailLayout.buyBar.top>=0 && detailLayout.buyBar.right<=width+1,name+' '+width+' purchase bar clipped');
       assert.ok(detailLayout.scrollWidth<=width+1,name+' '+width+' product overflow');
       await page.screenshot({path:path.join(out,name+'-detail-'+width+'.png'),fullPage:false});
       // Validate spacing on the actual purchase-controls component, not just CSS strings.
       await page.getByText('Other ways to order',{exact:true}).scrollIntoViewIfNeeded();
       const orderSpacing=await page.evaluate(()=>{
         const detailSections=[...document.querySelectorAll('details')];
         const note=detailSections.find(x=>x.querySelector('summary')?.textContent?.includes('Add a note'));
         const other=detailSections.find(x=>x.querySelector('summary')?.textContent?.includes('Other ways to order'));
         const actions=document.getElementById('purchase-actions');
         if(!note||!other||!actions)return null;
         const n=note.getBoundingClientRect(),a=actions.getBoundingClientRect(),o=other.getBoundingClientRect();
         return {notesToCart:a.top-n.bottom,cartToOther:o.top-a.bottom,
           actionsWidth:a.width,notesOpen:note.open,otherOpen:other.open,
           viewportWidth:document.documentElement.clientWidth};
       });
       assert.ok(orderSpacing,name+' '+width+' missing product order sections');
       assert.ok(orderSpacing.notesToCart>=12,name+' '+width+' creator note and cart buttons too close: '+JSON.stringify(orderSpacing));
       assert.ok(orderSpacing.cartToOther>=12,name+' '+width+' cart and other ordering controls too close: '+JSON.stringify(orderSpacing));
       assert.ok(orderSpacing.actionsWidth<=orderSpacing.viewportWidth,name+' '+width+' order buttons overflow');
       assert.equal(orderSpacing.notesOpen,false,name+' '+width+' optional notes collapsed by default');
       assert.equal(orderSpacing.otherOpen,false,name+' '+width+' secondary ordering options collapsed by default');
       await page.screenshot({path:path.join(out,name+'-orders-'+width+'.png'),fullPage:false});
       await page.goto('http://127.0.0.1:'+srv.address().port+'/');
       await page.getByRole('heading',{name:'Featured products'}).waitFor();
     }
     await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:false});
     await page.close();
    }
   }finally{await browser.close();}
   console.log('PASS '+name+': 320, 360, 375, 390, 430 and 768px PWA geometry');
  }
 }finally{srv.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
