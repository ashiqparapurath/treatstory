const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(p,'utf8');

test('store settings navigate in three compact sections without discarding draft state', () => {
 const source=read('src/components/seller-store-settings.tsx');
 for (const label of ['Profile','Delivery','Operations','role="tablist"','role="tabpanel"','settingsTab','setSettingsTab','StoreShareButton','onSubmit={save}','Save changes']) assert.ok(source.includes(label),label);
 for(const tab of ['profile','delivery','operations']) {
   assert.ok(source.includes('store-settings-'+tab),tab);
   assert.ok(source.includes("settingsTab !== '"+tab+"'"),tab);
 }
 for (const field of ['sellerDescription','sellerPhone','sellerWhatsApp','sellerPincodes','sellerPickup','sellerSlots','sellerCapacity','sellerAcceptance']) assert.ok(source.includes(field),field);
 assert.match(source,/runTransaction\(db,/);
 assert.match(source,/dirty \? 'Unsaved changes'/);
});

test('product editor uses expandable optional sections and preserves core fields', () => {
 const source=read('src/components/seller-product-editor.tsx');
 for(const field of ['Essential details','Photos & gallery','Payment requirements','Weight, size & variant pricing','Advanced listing details','seller-editor-status','seller-editor-availability','variant-pricing-title','Create product','Save changes','required minLength={2}','role="combobox"']) assert.ok(source.includes(field),field);
 assert.match(source,/open=\{draft\.weightOptions\.length > 0 \? true : undefined\}/);
 assert.match(source,/type="submit" disabled=\{busy\|\|uploading\|\|!enabled\}/);
});

test('new listings default to published while edit mode keeps saved visibility', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 const dashboard=read('src/app/seller/dashboard/page.tsx');
 assert.match(editor,/showPrice: true, status: 'published'/);
 assert.match(dashboard,/status: product\.status === 'published' \? 'published' : 'draft'/);
 assert.match(dashboard,/\} : emptyDraft\)/);
});
test('stock quantity and listing status use matching labeled control geometry', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 for(const id of ['seller-editor-stock','seller-editor-preparation','seller-editor-status','seller-editor-availability']) {
   assert.ok(editor.includes('htmlFor="'+id+'"'), 'missing matching label for '+id);
   assert.ok(editor.includes('id="'+id+'"'), 'missing input or trigger id for '+id);
 }
 assert.match(editor,/grid items-start gap-3 sm:grid-cols-2/);
 assert.match(editor,/flex min-w-0 flex-col gap-1\.5/);
});

test('image links can be added individually with validation and gallery actions', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 for (const marker of ['newPhotoLink','addPhotoLink','photoLinkError','Add link','Add image by link','creatorImageLink','aria-invalid={!!photoLinkError}','photos.includes(link)','photos.length >= 10','arrangePhotos([...photos, link])','shiftPhoto(i,-1)','shiftPhoto(i,1)']) assert.ok(editor.includes(marker),marker);
 assert.match(editor,/parsed\.protocol !== 'https:'/);
 assert.match(editor,/type="button" variant="outline" className="h-11 shrink-0 rounded-xl/);
 assert.doesNotMatch(editor,/Or paste image URLs manually/);
});
