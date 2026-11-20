const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path,'utf8');

test('reference-style mobile home retains a working product search and catalogue gates',()=>{
  const header=read('src/components/header.tsx');
  const home=read('src/components/home-client.tsx');
  const category=read('src/components/mobile-category-rail.tsx');
  const products=read('src/app/products/page.tsx');
  assert.match(header,/method="get" role="search"/);
  assert.match(header,/name="q" aria-label="Search TreatStory products"/);
  assert.match(products,/searchParams.get\('q'\)/);
  assert.match(products,/useEffect\(\(\) => setSearchTerm\(incomingQuery\)/);
  assert.match(home,/<CatalogMaintenanceGate>/);
  assert.match(home,/<MobileCategoryRail \/>/);
  assert.match(home,/<DeferredHomepageCatalog \/>/);
  assert.match(read('src/components/home-legacy-products.tsx'),/mobileCompact/);
  assert.match(home,/<BannerCarousel \/>/);
  assert.match(category,/encodeURIComponent\(query\)/);
  assert.doesNotMatch(category,/New York|Up to 40|fake|placeholder-price/i);
});

test('mobile category rail uses the refreshed category pictograms without changing search links',()=>{
  const category=read('src/components/mobile-category-rail.tsx');
  for (const [label, query, icon] of [
    ['Cakes', 'cake', 'Cake'],
    ['Cookies', 'cookie', 'CookiesIcon'],
    ['Breads', 'bread', 'Wheat'],
    ['Handmade', 'handmade', 'HandHeart'],
    ['Art', 'art', 'Paintbrush'],
  ]) {
    assert.ok(category.includes(`label: '${label}', query: '${query}', Icon: ${icon}`), `Expected ${icon} for ${label}`);
  }
  assert.match(category, /function CookiesIcon\(props: SVGProps<SVGSVGElement>\)/);
  assert.match(category, /href=\{`\/products\?q=\$\{encodeURIComponent\(query\)\}`\}/);
  assert.doesNotMatch(category,/CakeSlice|Croissant|Icon: Gift|Icon: Palette|Icon: Cookie,/);
  // The scroll rail starts at the same content gutter as the Categories heading.
  assert.match(category,/className="flex w-full snap-x snap-mandatory gap-3\.5 overflow-x-auto pt-2 pb-3/);
  assert.doesNotMatch(category,/className="-mx-4 flex|overflow-x-auto px-4/);
});

test('mobile PWA keeps buyer routes and role-aware More/Profile navigation',()=>{
  const header=read('src/components/header.tsx');
  assert.match(header,/grid grid-cols-5/);
  for(const destination of ["'/products'","'/favorites'","'/more'"]) assert.ok(header.includes(destination),destination);
  assert.match(header,/href: profileHref/);
  assert.match(header,/isMobileProfilePath/);
  assert.match(header,/clearMoreJourney/);
  assert.match(header,/href="\/cart"/);
  assert.match(header,/<nav aria-label="Mobile navigation"/);
  assert.doesNotMatch(header,/expo-router|eas-cli|react-native/);
});

test('product gallery, variant pricing and stock checks continue to drive the mobile buy bar',()=>{
  const detail=read('src/components/product-detail-client.tsx');
  const bar=read('src/components/mobile-buy-bar.tsx');
  assert.match(detail,/gallery.select\(n\)/);
  assert.match(detail,/selectedPrice = selectedWeight\?\.price \?\?/);
  assert.match(detail,/const available = !!product\?\.showPrice/);
  assert.match(detail,/stockQuantity === 0/);
  assert.match(detail,/formatPrice\(selectedPrice \* minQty\)/);
  assert.match(detail,/onClick=\{\(\) => void addCurrent\(\)\}/);
  assert.match(detail,/aria-label="Select weight or size"/);
  assert.match(detail,/creator\.customizationOptions/);
  assert.match(bar,/env\(safe-area-inset-bottom\)/);
  assert.match(bar,/md:hidden/);
});

test('iOS and Android PWA safe areas and original icons remain supported',()=>{
  const css=read('src/app/globals.css');
  const layout=read('src/app/layout.tsx');
  assert.match(layout,/viewportFit: 'cover'/);
  assert.match(layout,/pwaIcons\.apple/);
  assert.match(layout,/pwaStartupImages/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.match(css,/pwa-bottom-nav/);
});

test('mobile product cards show real prices with rounded image bottoms and 44px controls',()=>{
 const legacy=read('src/components/product-card.tsx');
 const seller=read('src/components/seller-product-card.tsx');
 for(const card of [legacy,seller]){
   assert.match(card,/aspect-\[3\/4\]/);
   assert.match(card,/rounded-\[22px\] border-2 border-white bg-\[#2b211d\]/);
   assert.match(card,/rounded-b-\[22px\] bg-gradient-to-t/);
   assert.match(card,/pointer-events-none absolute inset-x-2\.5 bottom-3 z-20 flex flex-col gap-1\.5 text-white sm:hidden/);
   assert.match(card,/grid-cols-\[44px_minmax\(0,1fr\)\]/);
   assert.match(card,/h-11 w-11 shrink-0/);
   assert.match(card,/min-h-11 min-w-0 truncate rounded-full/);
   assert.match(card,/<FavoriteToggle compact/);
   assert.match(card,/sm:h-3\/4 sm:rounded-none sm:from-black\/85 sm:via-black\/20/);
   assert.match(card,/sm:border sm:border-white\/70/);
   assert.doesNotMatch(card,/mobile-card-glass|>ts<\/span>/);
   assert.doesNotMatch(card,/min-h-\[124px\]/);
   assert.doesNotMatch(card,/4\.9|special discount|40%/i);
 }
 assert.match(legacy,/product\.showPrice \? formatPrice\(product\.price\)/);
 assert.match(legacy,/onClick=\{handleAddToCart\}/);
 assert.match(seller,/hasDifferentPrices \? 'From '/);
 assert.match(seller,/disabled=\{!available\}/);
 assert.match(seller,/onClick=\{\(\) => addToBag\(p\)\}/);
 assert.match(seller,/onClick=\{\(\) => buyNow\(p\)\}/);
 assert.match(seller,/Unavailable/);
});

test('mobile product page visibly shows selected price and honors requested safe areas',()=>{
  const detail=read('src/components/product-detail-client.tsx');
  const header=read('src/components/header.tsx');
  assert.match(detail,/text-\[20px\] font-semibold tracking-\[-0\.03em\] text-\[#754328\]/);
  assert.match(detail,/formatPrice\(selectedPrice\)/);
  assert.match(detail,/gallery\.select\(n\)/);
  assert.match(detail,/aria-label="Select weight or size"/);
  assert.match(header,/<MobileLocationIndicator \/>/);
  assert.match(header,/aria-label="Browse products and category filters"/);
  assert.match(header,/className="sr-only">Search products<\/button>/);
  assert.match(header,/rounded-t-\[22px\]/);
});


test('mobile card text is directly over the photo rather than inside a glass rectangle',()=>{
 for(const file of ['src/components/seller-product-card.tsx','src/components/product-card.tsx']){
  const card=read(file);
  assert.match(card,/shadow-\[0_5px_18px/);
  assert.match(card,/inset-x-2\.5 bottom-3 z-20 flex flex-col gap-1\.5/);
  assert.doesNotMatch(card,/mobile-card-glass/);
  assert.match(card,/rounded-\[22px\] bg-\[#efe7dd\]/);
 }
});

test('mobile home uses requested location permission, shows readable active banners and hides SKU on cards',()=>{
  const header=read('src/components/header.tsx');
  const location=read('src/components/mobile-location-indicator.tsx');
  const area=read('src/app/api/location/area/route.ts');
  const home=read('src/components/home-client.tsx');
  const legacy=read('src/components/product-card.tsx');
  const seller=read('src/components/seller-product-card.tsx');
  const details=read('src/components/product-detail-client.tsx');
  assert.match(header,/<MobileLocationIndicator \/>/);
  assert.match(header,/font-semibold">Treat<\/span><span className="font-normal">Story<\/span>/);
  assert.match(location,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(location,/navigator\.permissions\?\.query/);
  assert.match(location,/sessionStorage\.setItem\(AUTO_KEY/);
  assert.match(location,/status === 'denied'/);
  assert.match(location,/Math\.round\(position\.coords\.latitude \* 100\) \/ 100/);
  assert.match(area,/publicCount/);
  assert.match(area,/zoom: '10'/);
  assert.match(home,/min-h-\[210px\]/);
  assert.match(home,/line-clamp-4 text-\[16px\]/);
  assert.match(home,/mt-1 inline-flex min-h-11 max-w-\[76%\]/);
  assert.match(home,/bg-\[linear-gradient\(90deg/);
  assert.doesNotMatch(legacy,/<ProductSkuCopy|SKU:|product\.sku/);
  assert.doesNotMatch(seller,/<ProductSkuCopy|SKU:|p\.sku/);
  assert.match(details,/<div className="mt-3 hidden md:block"><ProductSkuCopy sku=\{creator\.sku\}/);
});

test('product details preserve persistent bottom navigation and purchase action without overlapping',()=>{
  const header=read('src/components/header.tsx');
  const bar=read('src/components/mobile-buy-bar.tsx');
  const detail=read('src/components/product-detail-client.tsx');
  assert.match(header,/<nav aria-label="Mobile navigation"/);
  assert.doesNotMatch(header,/!isProductDetail && <nav/);
  assert.match(header,/mobileNavIsActive\(pathname, 'shop'\)/);
  assert.match(bar,/inset-x-3 bottom-\[calc\(82px\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(bar,/rounded-\[23px\] border border-\[#e8ddd1\]/);
  assert.match(bar,/rootMargin:'0px 0px -170px 0px'/);
  assert.match(bar,/z-30/);
  assert.match(header,/pwa-bottom-nav.*z-40/);
  assert.match(detail,/pb-48 pt-0 md:px-6 md:pb-24/);
  assert.match(detail,/scroll-mt-48/);
});

test('SKU remains searchable but is hidden from listing cards including exact-match results',()=>{
  const seller=read('src/components/seller-product-card.tsx');
  const legacy=read('src/components/product-card.tsx');
  const match=read('src/components/sku-search-result.tsx');
  const detail=read('src/components/product-detail-client.tsx');
  assert.doesNotMatch(seller, /<ProductSkuCopy|>SKU:|p\.sku/);
  assert.doesNotMatch(legacy, /<ProductSkuCopy|>SKU:|product\.sku/);
  assert.doesNotMatch(match, /font-mono|>\{sku\}<\/span>|', SKU '/);
  assert.match(match, /Matching product/);
  assert.match(detail, /<div className="mt-3 hidden md:block"><ProductSkuCopy sku=\{creator\.sku\}/);
});

test('bottom-purchase bar keeps inset floating style and measures immediately on mount',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 const bar=read('src/components/mobile-buy-bar.tsx');
 assert.match(detail,/hidden md:block"><ProductSkuCopy/);
 assert.match(bar,/bottom-\[calc\(82px\+env\(safe-area-inset-bottom\)\)\]/);
 assert.match(bar,/rounded-\[23px\]/);
 assert.match(bar,/element\.getBoundingClientRect\(\)/);
 assert.match(bar,/window\.addEventListener\('scroll', update/);
 assert.doesNotMatch(bar,/fixed inset-x-0 bottom-/);
});


test('reference-style mobile product detail uses a photo-led gallery and compact white information',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 assert.match(detail,/aspect-\[1\/1\.08\].*md:aspect-\[4\/5\]/);
 assert.match(detail,/role="group" aria-label="Product gallery photos"/);
 assert.match(detail,/gallery\.select\(n\)/);
 assert.match(detail,/aria-label="Back to products"/);
 assert.match(detail,/<FavoriteToggle compact/);
 assert.match(detail,/<ProductShareButton.*iconOnly/);
 assert.match(detail,/space-y-0 bg-white px-4 pt-4 md:space-y-5/);
 assert.match(detail,/text-\[21px\] font-semibold leading-\[1\.24\]/);
 assert.match(detail,/aria-labelledby="product-description-title"/);
 assert.match(detail,/typeof product\.description === 'string' && product\.description\.length > 135/);
 assert.match(detail,/aria-labelledby="product-weights-title"/);
 assert.match(detail,/snap-x flex-nowrap gap-2 overflow-x-auto/);
 assert.match(detail,/min-h-11 shrink-0 snap-start whitespace-nowrap rounded-lg/);
});

test('seller, contact and rating UI displays only verified real data',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 const reviews=read('src/components/product-reviews.tsx');
 assert.match(detail,/setSellerName\(details\.businessName\)/);
 assert.match(detail,/setSellerLogoUrl\(typeof details\.logoUrl/);
 assert.match(detail,/sellerLogoUrl \? <ProductImage/);
 assert.match(detail,/sellerName &&/);
 assert.match(detail,/whatsappNumber &&/);
 assert.doesNotMatch(detail,/href=\{'tel:\+' \+ whatsappNumber\}/);
 assert.match(detail,/href=\{'https:\/\/wa\.me\/' \+ whatsappNumber/);
 assert.match(detail,/<ProductRatingBadge productId=\{creator\.id\}/);
 assert.match(reviews,/where\('status', '==', 'published'\)/);
 assert.match(reviews,/if \(isLoading \|\| error \|\| reviews\.length === 0\) return null/);
 assert.doesNotMatch(detail,/>4\.9<|Jenny Wilson|Lorem ipsum/i);
});

test('reorganized mobile detail retains price/stock, allergy disclosure, customization and floating cart',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 const header=read('src/components/header.tsx');
 const bar=read('src/components/mobile-buy-bar.tsx');
 assert.match(detail,/selectedPrice = selectedWeight\?\.price \?\?/);
 assert.match(detail,/setWeightIndex\(n\)/);
 assert.match(detail,/aria-pressed=\{weightIndex === n\}/);
 assert.match(detail,/hasStock = !creator/);
 assert.match(detail,/Ingredients & food information/);
 assert.match(detail,/Declared allergens:/);
 assert.match(detail,/creator\.customizationOptions/);
 assert.match(detail,/formatPrice\(selectedPrice \* minQty\)/);
 assert.match(detail,/onClick=\{\(\) => void addCurrent\(\)\}/);
 assert.match(detail,/onClick=\{buyNow\}/);
 assert.match(detail,/hidden md:block"><ProductSkuCopy/);
 assert.match(header,/<nav aria-label="Mobile navigation"/);
 assert.match(bar,/rounded-\[23px\]/);
});


test('mobile product cards have a solid visible white border without changing desktop border',()=>{
 for (const file of ['src/components/product-card.tsx','src/components/seller-product-card.tsx']) {
  const card=read(file);
  assert.match(card,/rounded-\[22px\] border-2 border-white bg-\[#2b211d\]/);
  assert.match(card,/sm:rounded-\[22px\] sm:border sm:border-white\/70/);
  assert.match(card,/rounded-b-\[22px\] bg-gradient-to-t/);
 }
});


test('mobile promotional banner is compact and keeps the CTA close to its copy',()=>{
 const home=read('src/components/home-client.tsx');
 const mobile=home.slice(home.indexOf('<CardContent className="relative isolate'),home.indexOf('<CardContent className="relative hidden'));
 assert.match(mobile,/min-h-\[210px\]/);
 assert.match(mobile,/flex-col items-start justify-start gap-3/);
 assert.match(mobile,/mt-1 inline-flex min-h-11 max-w-\[76%\]/);
 assert.match(mobile,/line-clamp-4 text-\[16px\]/);
 assert.match(mobile,/line-clamp-2 text-\[12px\]/);
 assert.doesNotMatch(mobile,/justify-between/);
 assert.match(home,/md:flex sm:h-64 md:h-72 lg:h-\[340px\]/);
});


test('install TreatStory auto-hides the button and guidance after seven seconds',()=>{
 const layout=read('src/app/layout.tsx');
 const notice=read('src/components/app-install-notice.tsx');
 assert.match(layout,/<AppInstallNotice \/>/);
 assert.match(layout,/rel="manifest"/);
 assert.match(notice,/aria-label="Install TreatStory"/);
 assert.match(notice,/7000/);
 assert.match(notice,/window\.clearTimeout\(timeout\)/);
 assert.match(notice,/if \(!visible \|\| busy\) return/);
 assert.match(notice,/if \(!isDismissed\(\) && storage\("sessionStorage", reminderShownKey\) !== "1"\)/);
 assert.match(notice,/\[visible, busy\]/);
 assert.match(notice,/reminderShownKey/);
 assert.match(notice,/await installEvent\.prompt\(\)/);
 assert.match(notice,/const choice = await installEvent\.userChoice/);
 assert.match(notice,/event\.preventDefault\(\)/);
 assert.match(notice,/sessionStorage", dismissedKey, "1"/);
 assert.match(notice,/aria-label="Dismiss install notification"/);
 assert.match(notice,/beforeinstallprompt/);
 assert.match(notice,/onClick=\{\(\) => void install\(\)\}/);
});


test('mobile product page keeps optional notes collapsed but shows custom order links',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 const reviews=read('src/components/product-reviews.tsx');
 assert.match(detail,/Add a note <span className="font-normal/);
 assert.match(detail,/aria-label="Additional ordering options"/);
  assert.doesNotMatch(detail,/Other ways to order/);
 assert.match(detail,/group-open:rotate-180/);
 assert.match(detail,/hidden space-y-2 text-sm font-medium md:block/);
 assert.match(detail,/hidden min-h-12 md:flex/);
 assert.match(detail,/ref=\{purchaseControls\} id="purchase-actions" className="grid scroll-mt-48 grid-cols-2 gap-4 py-0/);
 assert.match(detail,/onClick=\{\(\) => void addCurrent\(\)\}/);
 assert.match(detail,/onClick=\{buyNow\}/);
 assert.match(detail,/WhatsApp orders are arranged directly/);
 assert.match(reviews,/Customer reviews/);
 assert.match(reviews,/md:mt-7 md:rounded-2xl md:p-7/);
});


test('mobile ordering controls have breathing room without hiding cart, WhatsApp or custom quote functionality',()=>{
 const page=read('src/components/product-detail-client.tsx');
 const reviews=read('src/components/product-reviews.tsx');
 assert.match(page,/space-y-4 pb-7 pt-6 md:py-0/);
 assert.match(page,/Add a note/);
 assert.match(page,/aria-label="Additional ordering options"/);
 assert.match(page,/px-4 py-3 md:hidden/);
 assert.doesNotMatch(page,/Other ways to order/);
 assert.match(page,/grid-cols-2 gap-4 py-0 md:grid-cols-\[auto_1fr\]/);
 assert.match(page,/h-12 min-w-0 rounded-full/);
 assert.doesNotMatch(page,/grid scroll-mt-48 grid-cols-2 gap-2 rounded-\[20px\]/);
 assert.match(page,/onClick=\{buyNow\}/);
 assert.match(page,/onClick=\{\(\) => void addCurrent\(\)\}/);
 assert.match(page,/Order via WhatsApp/);
 assert.match(page,/Request a custom quote for this creation/);
 assert.match(page,/px-4 pt-2 md:col-span-2 md:px-0 md:pt-0/);
 assert.match(reviews,/p-5 shadow-\[0_4px_16px/);
});

test('mobile custom quote and WhatsApp links show without an expandable box',()=>{
 const detail=read('src/components/product-detail-client.tsx');
 const start=detail.indexOf('aria-label="Additional ordering options"');
 const end=detail.indexOf('hidden min-h-12 md:flex',start);
 assert.ok(start>0 && end>start);
 const mobile=detail.slice(start,end);
 assert.match(mobile,/space-y-4 md:hidden/);
 assert.match(mobile,/Request a custom quote for this creation<\/Link>/);
 assert.match(mobile,/Order via WhatsApp<\/a>/);
 assert.match(mobile,/min-h-12 items-center justify-center/);
 assert.doesNotMatch(mobile,/<details|<summary/);
 assert.match(detail,/hidden min-h-12 md:flex/);
});

test('mobile seller header offers one WhatsApp message action and reviews are inset',()=>{
  const detail=read('src/components/product-detail-client.tsx');
  const start=detail.indexOf('className="mt-5 md:hidden"');
  const end=detail.indexOf('className="mt-4 hidden min-h-14',start);
  assert.ok(start>=0 && end>start, 'seller profile row exists');
  const sellerRow=detail.slice(start,end);
  assert.match(sellerRow,/aria-label=\{'Message ' \+ sellerName \+ ' on WhatsApp'\}/);
  assert.equal((sellerRow.match(/href=\{'https:\/\/wa\.me\/'/g)||[]).length,1);
  assert.doesNotMatch(sellerRow,/href=\{'tel:\+'|aria-label=\{'Call '/);
  assert.doesNotMatch(detail,/\bPhone\b/);
  assert.match(detail,/px-4 pt-2 md:col-span-2 md:px-0 md:pt-0/);
  assert.match(detail,/aria-label="Additional ordering options" className="space-y-4 md:hidden"/);
  // The actual flex wrapper contains the note, purchase row and alternate links.
  assert.match(detail,/data-testid="product-order-controls" className="flex flex-col gap-4"/);
  const controls=detail.slice(detail.indexOf('data-testid="product-order-controls"'),detail.indexOf('<ProductReviews productId='));
  assert.ok(controls.indexOf('Add a note') < controls.indexOf('id="purchase-actions"'));
  assert.ok(controls.indexOf('id="purchase-actions"') < controls.indexOf('aria-label="Additional ordering options"'));
  // Note, primary purchase row, quote and WhatsApp all share a 16px vertical rhythm.
  assert.match(detail,/space-y-4 pb-7 pt-6 md:py-0/);
  assert.match(detail,/id="purchase-actions" className="grid scroll-mt-48 grid-cols-2 gap-4 py-0/);
});


test('Explore offers working Category, Price, Availability and Sort controls for both product sources',()=>{
  const page=read('src/app/products/page.tsx');
  const legacy=read('src/components/product-grid.tsx');
  const sellers=read('src/components/seller-storefront-products.tsx');
  for (const name of ['Filter by category','Filter by price','Filter by availability','Sort Explore products']) {
    assert.ok(page.includes('ariaLabel="' + name + '"'),name);
  }
  assert.match(page,/<SelectTrigger id=\{id\} aria-label=\{ariaLabel\}/);
  assert.match(page,/<SelectContent position="popper" sideOffset=\{6\}/);
  assert.match(page,/<SelectItem key=\{option.value\} value=\{option.value\}>/);
  assert.doesNotMatch(page,/<select\b|<datalist\b|<option\b/);
  assert.match(page,/setFilters\(\{ \.\.\.defaultCatalogFilters \}\)/);
  assert.match(page,/<SellerStorefrontProducts searchTerm=\{searchTerm\} filters=\{filters\}/);
  assert.match(page,/<ProductsPageContent searchTerm=\{searchTerm\} filters=\{filters\}/);
  assert.match(page,/<ProductGridContainer products=\{products\|\|\[\]\} externalSearchTerm=\{searchTerm\} filters=\{filters\}/);
  assert.match(page,/publicCategories/);
  assert.match(legacy,/applyCatalogFilters\(matches, filters\)/);
  assert.match(sellers,/applyCatalogFilters\(matches, filters\)/);
});

test('Explore category, size-aware price, availability, and price-order predicates work together',()=>{
  const ts=require('typescript'),vm=require('node:vm');
  const source=read('src/lib/catalog-search.ts');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{exports:module.exports});
  const {defaultCatalogFilters,applyCatalogFilters,catalogDisplayPrice,catalogIsOrderable,matchesCatalogCategory}=module.exports;
  const rows=[
    {name:'Birthday Cake',category:'Cakes',price:1800,showPrice:true,availability:'made-to-order',weightOptions:[{price:950},{price:1800}]},
    {name:'Biscuit pack',category:'Cookies',price:450,showPrice:true,availability:'available',stockQuantity:12},
    {name:'Empty cookie tin',category:'Cookies',price:800,showPrice:true,availability:'available',stockQuantity:0},
    {name:'Custom flower art',category:'Art',price:3500,showPrice:true,availability:'unavailable',stockQuantity:0},
    {name:'Special gift',category:'Handmade gifts',price:0,showPrice:false,availability:'made-to-order'},
    {name:'Legacy bread',category:'Breads',price:300,showPrice:true},
  ];
  const choose=part=>({ ...defaultCatalogFilters, ...part });
  const names=part=>applyCatalogFilters(rows,choose(part)).map(row=>row.name).join('|');
  assert.equal(catalogDisplayPrice(rows[0]),950,'lowest size price is used');
  assert.equal(catalogIsOrderable(rows[0]),true,'made-to-order can be ordered');
  assert.equal(catalogIsOrderable(rows[2]),false,'sold out should not be shown as available');
  assert.equal(catalogIsOrderable(rows[5]),true,'legacy items have no inventory metadata');
  assert.equal(matchesCatalogCategory('Birthday Cakes','Cake'),true);
  assert.equal(matchesCatalogCategory('Party decorations','Art'),false,'Art must not match Party');
  assert.equal(names({category:'Cookies',availability:'orderable'}),'Biscuit pack');
  assert.equal(names({category:'Cakes',price:'500-1000',availability:'made-to-order'}),'Birthday Cake');
  assert.equal(names({price:'under-500',sort:'price-asc'}),'Legacy bread|Biscuit pack');
  assert.equal(names({sort:'price-desc'}),'Custom flower art|Birthday Cake|Empty cookie tin|Biscuit pack|Legacy bread|Special gift');
  assert.equal(names({availability:'unavailable'}),'Empty cookie tin|Custom flower art|Special gift');
  assert.equal(names({category:'Handmade'}),'Special gift');
});

test('Firestore retains a single resilient forced-long-polling initialization',()=>{
  const source=read('src/firebase/client-provider.tsx');
  assert.match(source,/initializeFirestore\(app, \{/);
  assert.match(source,/experimentalForceLongPolling: true/);
  assert.match(source,/experimentalLongPollingOptions: \{ timeoutSeconds: 25 \}/);
  assert.doesNotMatch(source,/getFirestore\(app\)/);
});

test('Explore mobile filters open on demand without crowding product search',()=>{
  const page=read('src/app/products/page.tsx');
  assert.match(page,/function MobileExploreFilters\(/);
  assert.match(page,/aria-label="Mobile Explore filters" className="mb-7 md:hidden"/);
  assert.match(page,/aria-controls="explore-mobile-filter-panel" aria-expanded=\{expanded\}/);
  assert.match(page,/setExpanded\(value=>!value\)/);
  assert.match(page,/aria-label="Active filters"/);
  assert.match(page,/aria-label=\{`Remove \$\{chip.label\} filter`\}/);
  assert.match(page,/onClick=\{\(\)=>clearOne\(chip.key\)\}/);
  assert.match(page,/onClick=\{\(\)=>setExpanded\(false\)\}/);
  assert.match(page,/ExploreFilterControl id="explore-sort-mobile" label="Sort by" compact/);
  assert.match(page,/id="explore-mobile-filter-panel" className=\{expanded \?/);
  assert.match(page,/options=\{priceOptions\}/);
  assert.match(page,/options=\{availabilityOptions\}/);
  assert.match(page,/onUpdate=\{change=>setFilters\(current=>\(\{\.\.\.current,\.\.\.change\}\)\)\}/);
  assert.match(page,/aria-label="Refine Explore products" className="mb-8 hidden/);
  assert.match(page,/md:block md:p-5/);
});

test('seller product wizard is compact and touch-friendly on mobile without losing product features', () => {
  const wizard=read('src/components/seller-product-editor.tsx');
  const css=read('src/app/globals.css');
  assert.ok(wizard.includes('stepDescriptions[step]'), 'each wizard step has a concise instruction');
  assert.ok(wizard.includes('role="progressbar"'), 'screen readers can track progress');
  assert.ok(wizard.includes('seller-wizard-scroll'), 'step content scrolls under a fixed footer');
  assert.ok(wizard.includes('pb-[max(.75rem,env(safe-area-inset-bottom))]'), 'safe-area padding for phones');
  assert.ok(wizard.includes('flex-1 rounded-xl bg-[#74472e]'), 'mobile Continue fills available width');
  assert.ok(wizard.includes('grid-cols-1 gap-2.5 min-[390px]:grid-cols-2'), 'photo cards reflow on very narrow devices');
  assert.ok(wizard.includes('max-h-56 w-full object-cover'), 'main cover preview is bounded in height');
  assert.ok(wizard.includes('Add photo by link'), 'URL photo entry remains available but collapsible');
  assert.ok(wizard.includes("linkField?.closest('details')?.setAttribute('open', '')"), 'invalid pending link expands its editor');
  assert.ok(wizard.includes('relative grid min-w-0 grid-cols-2 items-end'), 'size and price fields fit in two mobile columns');
  assert.ok(wizard.includes('absolute right-2 top-2 flex size-10'), 'variant delete stays on the size card header');
  assert.ok(wizard.includes('rounded-2xl border border-[#e9dfd3] bg-white p-4 text-sm'), 'review is separated into readable cards');
  assert.ok(wizard.includes('Save draft'), 'existing draft action remains');
  assert.ok(wizard.includes("onSubmit('published')"), 'published product action remains');
  assert.ok(wizard.includes("onSubmit('draft')"), 'saving drafts remains available');
  assert.ok(wizard.includes('ConfirmActionDialog'), 'unsaved changes remain protected');
  assert.ok(wizard.includes('SellerDescriptionSuggestion'), 'compact inline AI is still present');
  assert.ok(css.includes('seller-wizard-scroll { scrollbar-gutter: auto; }'), 'mobile scroll area does not reserve unused gutter');
  assert.ok(css.includes('.seller-wizard [data-step][hidden]'), 'inactive steps stay hidden');
});
