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
  assert.match(home,/mobileCompact/);
  assert.match(home,/<BannerCarousel \/>/);
  assert.match(category,/encodeURIComponent\(query\)/);
  assert.doesNotMatch(category,/New York|Up to 40|fake|placeholder-price/i);
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

test('mobile image-overlay cards retain real prices, stock actions and >=44px targets',()=>{
  const legacy=read('src/components/product-card.tsx');
  const seller=read('src/components/seller-product-card.tsx');
  for(const card of [legacy,seller]){
    assert.match(card,/aspect-\[3\/4\]/);
    assert.match(card,/h-\[62%\] bg-gradient-to-t/);
    assert.match(card,/rounded-\[21px\]/);
    assert.match(card,/line-clamp-2 text-\[12px\]/);
    assert.match(card,/grid-cols-\[44px_minmax\(0,1fr\)\]/);
    assert.match(card,/h-11 w-11 shrink-0/);
    assert.match(card,/min-h-11 min-w-0/);
    assert.match(card,/<FavoriteToggle compact/);
    assert.match(card,/sm:h-3\/4 sm:from-black\/85 sm:via-black\/20/);
    assert.match(card,/sm:border sm:border-white\/70/);
    assert.match(card,/showPrice/);
    assert.doesNotMatch(card,/min-h-\[124px\]/,'no separate white mobile card footer');
    assert.doesNotMatch(card,/4\.9|special discount|40%/i,'no invented ratings or discounts');
  }
  assert.match(legacy,/product\.showPrice \? formatPrice\(product\.price\)/);
  assert.match(legacy,/onClick=\{handleAddToCart\}/);
  assert.match(legacy,/href="\/cart" aria-label="View shopping bag"/);
  assert.match(seller,/p\.availability !== 'unavailable'/);
  assert.match(seller,/hasDifferentPrices \? 'From '/);
  assert.match(seller,/disabled=\{!available\}/);
  assert.match(seller,/onClick=\{\(\) => addToBag\(p\)\}/);
  assert.match(seller,/onClick=\{\(\) => buyNow\(p\)\}/);
  assert.match(seller,/Unavailable/);
});

test('mobile product page visibly shows selected price and honors requested safe areas',()=>{
  const detail=read('src/components/product-detail-client.tsx');
  const header=read('src/components/header.tsx');
  assert.match(detail,/md:hidden"><p className="text-\[25px\] font-bold/);
  assert.match(detail,/formatPrice\(selectedPrice\)/);
  assert.match(detail,/gallery\.select\(n\)/);
  assert.match(detail,/aria-label="Select weight or size"/);
  assert.match(header,/<MobileLocationIndicator \/>/);
  assert.match(header,/aria-label="Browse products and category filters"/);
  assert.match(header,/className="sr-only">Search products<\/button>/);
  assert.match(header,/rounded-t-\[22px\]/);
});


test('reference-style mobile card uses full-bleed image, bottom text gradient and small TS mark',()=>{
  const seller=read('src/components/seller-product-card.tsx');
  const legacy=read('src/components/product-card.tsx');
  for(const card of [seller,legacy]){
    assert.match(card,/shadow-\[0_10px_24px/);
    assert.match(card,/rounded-\[19px\] border border-white\/25 bg-\[#1d1714\]\/55/);
    assert.match(card,/mobile-card-glass pointer-events-none absolute inset-x-2 bottom-2 z-20/);
    assert.match(card,/sm:hidden/);
    assert.doesNotMatch(card,/max-w-\[calc\(100%-4\.5rem\)\]/,'no large category pill on image');
    assert.doesNotMatch(card,/min-h-\[124px\]/,'all mobile copy must overlay photo');
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
  assert.match(home,/min-h-\[244px\]/);
  assert.match(home,/line-clamp-4 text-\[16px\]/);
  assert.match(home,/min-h-11 max-w-\[76%\]/);
  assert.match(home,/bg-\[linear-gradient\(90deg/);
  assert.doesNotMatch(legacy,/<ProductSkuCopy|SKU:|product\.sku/);
  assert.doesNotMatch(seller,/<ProductSkuCopy|SKU:|p\.sku/);
  assert.match(details,/<div className="mt-3 hidden sm:block"><ProductSkuCopy sku=\{creator\.sku\}/);
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
  assert.match(detail, /<div className="mt-3 hidden sm:block"><ProductSkuCopy sku=\{creator\.sku\}/);
});

test('mobile reference polish keeps SKU off small screens and gives card/purchase actions breathing room',()=>{
 const legacy=read('src/components/product-card.tsx');
 const seller=read('src/components/seller-product-card.tsx');
 const detail=read('src/components/product-detail-client.tsx');
 const bar=read('src/components/mobile-buy-bar.tsx');
 for (const card of [legacy,seller]) {
   assert.match(card,/mobile-card-glass/);
   assert.match(card,/inset-x-2 bottom-2 z-20/);
   assert.match(card,/rounded-\[19px\] border border-white\/25/);
   assert.doesNotMatch(card,/>ts<\/span>/);
   assert.match(card,/rounded-\[16px\]/);
   assert.match(card,/pointer-events-auto mt-0\.5 grid/);
 }
 assert.match(detail,/hidden sm:block"><ProductSkuCopy/);
 assert.match(bar,/bottom-\[calc\(82px\+env\(safe-area-inset-bottom\)\)\]/);
 assert.match(bar,/rounded-\[23px\]/);
 assert.doesNotMatch(bar,/fixed inset-x-0 bottom-/);
});
