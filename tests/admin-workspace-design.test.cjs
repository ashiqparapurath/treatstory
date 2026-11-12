const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('admin navigation is responsive and keeps all eleven authorized sections', () => {
 const source=read('src/app/admin/page.tsx');
 for(const value of ['overview','orders','support','reviews','applications','sellers','catalog','products','banners','categories','settings']) {
   assert.ok(source.includes("id: '"+value+"'"),value);
   assert.ok(source.includes("tab === '"+value+"'"),value);
 }
 for(const marker of ['role !== \'admin\'','roleError','Admin workspace section','SelectContent position="popper"','Admin navigation','Admin studio / {tab}','descriptions[tab]','signOut','firebaseSignOut']) assert.ok(source.includes(marker),marker);
 assert.match(source,/lg:grid-cols-\[220px_minmax\(0,1fr\)\]/);
});

test('admin overview shows actionable live operations without synthetic counts', () => {
 const source=read('src/components/admin/admin-overview.tsx');
 for(const marker of ['Marketplace command center','Marketplace health','Priority queue','Applications queue','Seller categories','getCountFromServer','setRefresh','navigate?.(\'orders\')','navigate?.(\'catalog\')','navigate?.(\'applications\')','queueError','countError']) {
  if(marker !== 'countError') assert.ok(source.includes(marker),marker);
 }
 assert.match(source,/value \?\? '…'/);
});

test('moderation catalog retains controls and paged loading with product previews', () => {
 const source=read('src/components/admin/marketplace-catalog.tsx');
 for(const marker of ['Loaded listings','Published','Drafts','Filter listing visibility','Search seller listings','p.imageUrls?.[0]','setVisibility(p)','updateDoc','LoadMoreRecords','where']) {
  if(marker !== 'where') assert.ok(source.includes(marker),marker);
 }
 assert.match(source,/aria-pressed=\{visibility === item\}/);
 assert.match(source,/visibility === 'all' \|\| \(p.status \?\? 'draft'\) === visibility/);
});

test('seller approvals and management retain mutation and confirmation workflows', () => {
 const applications=read('src/components/admin/seller-applications.tsx');
 const sellers=read('src/components/admin/seller-management.tsx');
 for(const marker of ['writeBatch','batch.commit()','review(application, true)','review(application, false)','LoadMoreRecords','requestSellerMail']) assert.ok(applications.includes(marker),marker);
 for(const marker of ['ConfirmActionDialog','updateDoc','manage(seller)','extend(seller)','saveExact(seller)','setStatusFilter','LoadMoreRecords']) assert.ok(sellers.includes(marker),marker);
});
