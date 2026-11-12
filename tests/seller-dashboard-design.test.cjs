const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const dashboard = fs.readFileSync('src/app/seller/dashboard/page.tsx', 'utf8');

test('seller catalog presents a polished and responsive listing workspace', () => {
  for (const marker of [
    'Your catalog', 'Search by product name, category or SKU',
    'Loaded listings', 'Published', 'Drafts', 'grid-cols-[minmax(0,2.5fr)',
    'p.imageUrls?.[0]', 'ImageIcon', 'priceRange(p)',
    'sizePriceLabels(p)', 'ProductSkuCopy sku={p.sku}',
    'p.availability.replaceAll', "p.status === 'published'",
  ]) assert.ok(dashboard.includes(marker), marker);
});

test('catalog filters are controlled, preserve seller-scoped pagination and have accessible state', () => {
  assert.match(dashboard, /setListingFilter\(filter\)/);
  assert.match(dashboard, /aria-pressed=\{listingFilter === filter\}/);
  assert.match(dashboard, /listingFilter === 'all' \|\| \(p.status \?\? 'draft'\) === listingFilter/);
  assert.match(dashboard, /where\('sellerId', '==', user.uid\)/);
  assert.match(dashboard, /<LoadMoreRecords hasMore=\{hasMore\}/);
  assert.match(dashboard, /aria-label="Search your products"/);
});

test('existing product management and seller sections remain intact', () => {
  for (const marker of [
    "section === 'overview'", "section === 'orders'", "section === 'store'",
    "section === 'products'", 'openForm(p)', 'setPendingDelete(p)',
    'saveProductRequest.safeParse(payload)', 'uploadTreatStoryPhoto',
    '<SellerProductEditor', '<SellerStoreSettings', '<OrderManagement mode="seller"',
    'ConfirmActionDialog', 'seller.accessEndsAt',
  ]) assert.ok(dashboard.includes(marker), marker);
});
