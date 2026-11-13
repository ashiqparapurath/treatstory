const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('robots and sitemap advertise public pages without exposing private dashboards',()=>{
  const robots=read('src/app/robots.ts');
  const sitemap=read('src/app/sitemap.ts');
  assert.match(robots,/sitemap\.xml/);
  for(const forbidden of ['/api/', '/admin', '/checkout', '/cart', '/account', '/support'])assert.ok(robots.includes(forbidden));
  for(const path of ['/products','/new-arrivals','/about','/become-a-seller'])assert.ok(sitemap.includes(path));
  assert.match(sitemap,/where\('status', '==', 'published'\)/);
  assert.match(sitemap,/where\('status','==','active'\)/);
  assert.match(sitemap,/encodeURIComponent\(routeId\)/);
  assert.doesNotMatch(sitemap,/\/admin\//);
});

test('public marketing routes expose unique titles descriptions and canonical URLs',()=>{
  for(const [path,canonical] of [
    ['src/app/page.tsx','/'],
    ['src/app/products/layout.tsx','/products'],
    ['src/app/new-arrivals/layout.tsx','/new-arrivals'],
    ['src/app/about/layout.tsx','/about'],
    ['src/app/become-a-seller/layout.tsx','/become-a-seller'],
  ]){
    const source=read(path);
    assert.match(source,/description:/,path);
    assert.match(source,/canonical:/,path);
    assert.ok(source.includes(canonical),path);
  }
  assert.match(read('src/app/layout.tsx'),/applicationName: 'TreatStory'/);
  assert.match(read('src/app/layout.tsx'),/schema\.org/);
});

test('customer and admin pages are noindex',()=>{
 for(const page of ['admin','account','cart','checkout','login','register']){
   assert.match(read('src/app/'+page+'/layout.tsx'),/index: false/);
 }
});

test('product and store pages render public data, schemas, and preserve client shopping UI',()=>{
 const product=read('src/app/product/[id]/page.tsx');
 const shop=read('src/app/shop/[id]/page.tsx');
 const publicProduct=read('src/lib/server/public-product.ts');
 const publicStore=read('src/lib/server/public-store.ts');
 assert.match(product,/getPublicProduct/);
 assert.match(product,/application\/ld\+json/);
 assert.match(product,/priceCurrency: 'INR'/);
 assert.match(product,/product\.showPrice === true/);
 assert.match(product,/initialProduct=/);
 assert.match(shop,/getPublicStore/);
 assert.match(shop,/application\/ld\+json/);
 assert.match(shop,/initialSeller=/);
 assert.match(publicProduct,/data\.status !== 'published'/);
 assert.match(publicStore,/data\.status !== 'active'/);
 assert.doesNotMatch(publicStore,/contactEmail|contactPhone|whatsappNumber/);
 assert.match(read('src/components/product-detail-client.tsx'),/startDirectCheckout/);
 assert.match(read('src/components/seller-store-client.tsx'),/StoreShareButton/);
});
