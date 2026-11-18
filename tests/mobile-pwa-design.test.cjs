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
  assert.match(header,/!isProductDetail && <nav/);
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

test('refined mobile cards use real product metadata and 44px cart touch targets',()=>{
  const legacy=read('src/components/product-card.tsx');
  const seller=read('src/components/seller-product-card.tsx');
  for(const card of [legacy,seller]){
    assert.match(card,/min-h-\[124px\]/);
    assert.match(card,/h-11 w-11 shrink-0/);
    assert.match(card,/text-\[10px\] font-medium uppercase/);
    assert.match(card,/showPrice/);
    assert.doesNotMatch(card,/4\.9|special discount|40%/i);
  }
  assert.match(seller,/p\.availability === 'made-to-order'/);
  assert.match(seller,/onClick=\{\(\) => addToBag\(p\)\}/);
  assert.match(legacy,/addToCart\(product\)/);
});

test('mobile product page visibly shows selected price and honors requested safe areas',()=>{
  const detail=read('src/components/product-detail-client.tsx');
  const header=read('src/components/header.tsx');
  assert.match(detail,/md:hidden"><p className="text-\[25px\] font-bold/);
  assert.match(detail,/formatPrice\(selectedPrice\)/);
  assert.match(detail,/gallery\.select\(n\)/);
  assert.match(detail,/aria-label="Select weight or size"/);
  assert.match(header,/Made with care in Kerala/);
  assert.match(header,/aria-label="Browse products and category filters"/);
  assert.match(header,/className="sr-only">Search products<\/button>/);
  assert.match(header,/rounded-t-\[22px\]/);
});


test('mobile cards have reference-style image-first layout and real category badges',()=>{
  const seller=read('src/components/seller-product-card.tsx');
  const legacy=read('src/components/product-card.tsx');
  for(const card of [seller,legacy]){
    assert.match(card,/aspect-\[1\/1\.06\]/);
    assert.match(card,/max-w-\[calc\(100%-4\.5rem\)\]/);
    assert.match(card,/rounded-full border border-white\/80 bg-white\/95/);
    assert.match(card,/sm:hidden/);
    assert.match(card,/<FavoriteToggle compact/);
    assert.match(card,/min-h-\[124px\]/);
    assert.match(card,/h-11 w-11 shrink-0/);
    assert.doesNotMatch(card,/>4\.8<|>4\.9<|40% off/i,'do not invent ratings or sale prices');
  }
  assert.match(seller,/>Made to order<\/span>/);
  assert.match(seller,/hasDifferentPrices/);
  assert.match(legacy,/product\.category/);
});
