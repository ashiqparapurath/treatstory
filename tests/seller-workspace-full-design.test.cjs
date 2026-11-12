const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path,'utf8');

test('overview has connected quick actions, accessible order queue and true aggregation labels',()=>{
 const source=read('src/app/seller/dashboard/page.tsx');
 for(const marker of ['Create. Sell. Grow.','Store performance','Orders & attention','Inventory check','Store settings','getCountFromServer','fulfillment?.pending','setSection(\'orders\')','setSection(\'store\')','setSection(\'products\')','openForm()']) assert.ok(source.includes(marker),marker);
 assert.match(source,/aria-labelledby="seller-queue-title"/);
 assert.match(source,/seller\.isOpen === false/);
});

test('product listing layout remains intact during full seller refresh',()=>{
 const source=read('src/app/seller/dashboard/page.tsx');
 for(const marker of ['Your catalog','Search by product name, category or SKU','Loaded listings','listingFilter','ProductSkuCopy sku={p.sku}','priceRange(p)','sizePriceLabels(p)','SellerProductEditor','ConfirmActionDialog','LoadMoreRecords']) assert.ok(source.includes(marker),marker);
});

test('orders retain state transitions and filter controls while sharing the dashboard language',()=>{
 const source=read('src/components/order-management.tsx');
 for(const marker of ['Fulfillment queue','Order pipeline','Live order feed','aria-pressed={filter === f.key}','aria-label="Search loaded orders"','sendOrderAction','setFilter','setSort','setPeriod','exportVisible','loadOlder']) assert.ok(source.includes(marker),marker);
});

test('store settings retain branded identity and all existing editable settings',()=>{
 const source=read('src/components/seller-store-settings.tsx');
 for(const marker of ['Store details','How buyers see your business','Fulfillment preferences','Delivery and order handling','Edit store logo','uploadLogo','StoreShareButton','sellerDescription','sellerWhatsApp','sellerPincodes','sellerSlots','sellerCapacity','sellerAcceptance','Save changes','runTransaction']) assert.ok(source.includes(marker),marker);
 assert.match(source,/onSubmit={save}/);
 assert.match(source,/disabled={!active \|\| busy \|\| uploading \|\| !dirty}/);
});
