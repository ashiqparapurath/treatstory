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
