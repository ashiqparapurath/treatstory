const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Explore and seller stores render one shared seller product card collection', () => {
  const storefront = fs.readFileSync('src/components/seller-store-client.tsx', 'utf8');
  const explore = fs.readFileSync('src/components/seller-storefront-products.tsx', 'utf8');
  const collection = fs.readFileSync('src/components/seller-product-collection.tsx', 'utf8');
  const originalCatalog = fs.readFileSync('src/components/product-grid.tsx', 'utf8');

  assert.match(storefront, /<SellerProductCollection products=\{visibleProducts\}/);
  assert.match(explore, /<SellerProductCollection products=\{visible\.slice\(0, visibleCount\)\}/);
  assert.equal((collection.match(/<SellerProductCard/g) || []).length, 1);
  assert.match(collection, /grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6/);
  assert.match(originalCatalog, /grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-9 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6/);
  assert.doesNotMatch(storefront, /aspect-\[4\/5\]/);
});

test('shared cards preserve cart, direct checkout, stock checks and variant pricing', () => {
  const collection = fs.readFileSync('src/components/seller-product-collection.tsx', 'utf8');
  for (const fragment of [
    'sellerCardWeightChoices(product)',
    'canBuySellerSize(product, option)',
    'createSellerCardCartItem(product, option)',
    'startDirectCheckout(item, quantity)',
    'addToCart(item, quantity)',
    "router.push('/checkout?buy=direct&product='",
    'canBuySellerSize(pendingChoice.product, selectedOption)',
    'formatPrice(option.price ?? pendingChoice?.product.price ?? 0)',
  ]) assert.ok(collection.includes(fragment), 'missing purchase behavior: ' + fragment);
  assert.match(collection, /aria-pressed=\{selectedWeightIndex === index\}/);
  assert.match(collection, /disabled=\{!chosenAvailable \|\| !pendingChoice\}/);
});
