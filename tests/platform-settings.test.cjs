const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('platform settings contains only unique support configuration and the existing legacy enquiry', () => {
 const source=read('src/components/admin/platform-settings.tsx');
 for(const name of ['Support experience','Public support email','Public support notice','Legacy WhatsApp enquiries','EnquirySettingsForm','setDoc(ref','updatedAt: serverTimestamp()','Save support settings','View customer support page']) assert.ok(source.includes(name),name);
 for(const duplicate of ['Seller management','Daily order capacity','Trial duration','Delivery PIN','Create banner','Add category','Order fulfillment']) assert.ok(!source.includes(duplicate),duplicate);
 assert.match(source,/maxLength=\{300\}/);
 assert.match(source,/maxLength=\{254\}/);
 assert.match(source,/doc\(db, 'settings', 'support'\)/);
});
test('configured support contact and notice appear on the customer support page', () => {
 const support=read('src/app/support/page.tsx');
 for(const name of ["doc(db, 'settings', 'support')",'supportSettings?.publicNotice','supportSettings?.contactEmail','mailto:','supportSettings.publicNotice']) assert.ok(support.includes(name),name);
 assert.match(support,/aria-label="Support contact information"/);
});
test('support settings remain public-read and admin-write with constrained fields', () => {
 const rules=read('firestore.rules');
 for(const name of ["settingId in ['enquiry', 'support'] || isAdmin()", "request.resource.data.contactEmail.size() <= 254","request.resource.data.publicNotice.size() <= 300","request.resource.data.updatedAt == request.time"]) assert.ok(rules.includes(name),name);
 assert.match(rules,/allow create, update: if isAdmin\(\)/);
});
test('platform settings route uses one source of truth and no legacy top-level duplication', () => {
 const page=read('src/app/admin/page.tsx');
 assert.ok(page.includes("tab === 'settings' && <PlatformSettings />"));
 assert.ok(!page.includes("tab === 'settings' && <EnquirySettingsForm />"));
 const legacy=read('src/components/admin/enquiry-settings-form.tsx');
 assert.ok(legacy.includes('Hello TreatStory'));
 assert.ok(!legacy.includes('Hello AS PRODUCTION'));
});
