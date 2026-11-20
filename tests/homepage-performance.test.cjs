const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(p,'utf8');

test('homepage defers lower catalog requests and chunks until the products approach view', () => {
  const home=read('src/components/home-client.tsx');
  const legacy=read('src/components/home-legacy-products.tsx');
  assert.match(home,/function DeferredHomepageCatalog\(\)/);
  assert.match(home,/new IntersectionObserver\(/);
  assert.match(home,/rootMargin: '650px 0px'/);
  assert.match(home,/typeof IntersectionObserver === 'undefined'/);
  assert.match(home,/observer\.disconnect\(\)/);
  assert.match(home,/nearViewport \? <>/);
  assert.match(home,/<DeferredHomepageCatalog \/>/);
  assert.match(home,/import\('@\/components\/seller-storefront-products'\)/);
  assert.match(home,/import\('@\/components\/home-legacy-products'\)/);
  assert.match(legacy,/usePublicCatalog<Product>\(productsQuery\)/);
  assert.match(legacy,/limit\(8\)/);
  assert.match(home,/<ProductGridSkeleton count=\{8\} \/>/);
});
test('mobile first banner gets eager high-priority image while subsequent slides stay lazy', () => {
  const home=read('src/components/home-client.tsx');
  const slide=read('src/components/banner-image-slide.tsx');
  const placed=read('src/components/banner-placed-image.tsx');
  assert.match(home,/first=\{index === 0\}/);
  assert.match(home,/eager=\{index===0\}/);
  assert.match(home,/loading=\{index===0\?'eager':'lazy'\}/);
  assert.match(home,/fetchPriority=\{index===0\?'high':'auto'\}/);
  assert.match(slide,/loading=\{first && mobile \? 'eager' : 'lazy'\}/);
  assert.match(slide,/fetchPriority=\{first && mobile \? 'high'/);
  assert.match(placed,/loading=\{eager \? 'eager' : 'lazy'\}/);
  assert.match(placed,/fetchPriority=\{eager \? 'high'/);
  assert.match(home,/shouldLoad=\{requested\.has\(index\) \|\| index === active\}/);
});
test('product card links avoid prefetching every detail route on the initial catalog view', () => {
  assert.match(read('src/components/product-card.tsx'), /<Link prefetch=\{false\} href=/);
  assert.match(read('src/components/seller-product-card.tsx'), /<Link prefetch=\{false\} href=/);
});
