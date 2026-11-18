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

test('become a seller has an editorial storefront preview, trial terms and clear creator benefits', () => {
 const page=read('src/app/become-a-seller/page.tsx');
 assert.match(page,/function StorefrontPreview\(\)/);
 assert.match(page,/aria-label="Illustrative preview of a TreatStory seller storefront"/);
 assert.match(page,/Illustrative storefront preview · Not actual products or seller results/);
 assert.match(page,/A storefront that feels like yours/);
 assert.match(page,/Orders in one place/);
 assert.match(page,/Your work, thoughtfully presented/);
 assert.match(page,/What you create deserves/);
 assert.match(page,/\{SELLER_TRIAL_MESSAGE\}/);
 assert.match(page,/function SellerFaq\(\)/);
 assert.match(page,/Home bakers must provide current FSSAI registration/);
 assert.match(page,/sellerCoverageLabel|Sellers choose their own pickup and delivery coverage/);
});

test('three-step seller application preserves existing fields, submission and back navigation', () => {
 const page=read('src/app/become-a-seller/page.tsx');
 for(const label of ['Your business','Contact details','Your story','Step {step} of 3','Application progress','Continue','Back','Send seller application']) assert.ok(page.includes(label),label);
 for(const id of ['businessName','businessCategory','businessCity','businessState','contactEmail','contactPhone','description']) assert.ok(page.includes('id="' + id + '"'),id);
 assert.match(page,/\{step === 1 && <>/);
 assert.match(page,/\{step === 2 && <>/);
 assert.match(page,/\{step === 3 && <>/);
 assert.match(page,/onSubmit=\{submit\}/);
 assert.match(page,/if \(step !== 3\) \{/);
 assert.match(page,/setStep\(current => \(current \+ 1\) as ApplicationStep\)/);
 assert.match(page,/setStep\(current=>\(current-1\) as ApplicationStep\)/);
 assert.match(page,/name="website" tabIndex=\{-1\} autoComplete="off"/);
 assert.match(page,/fetch\('\/api\/seller-applications'/);
 assert.match(page,/Authorization: 'Bearer ' \+ await user.getIdToken\(\)/);
 assert.match(page,/businessCity: businessCity.trim\(\)/);
 assert.match(page,/description: description.trim\(\)/);
 assert.match(page,/if \(!response.ok\) throw new Error/);
 assert.match(page,/setSubmitted\(true\)/);
 assert.match(page,/type="email" required/);
 assert.match(page,/type="tel" required minLength=\{5\}/);
 assert.match(page,/id="description" required maxLength=\{2000\}/);
 assert.match(page,/register\?next=%2Fbecome-a-seller/);
 assert.match(page,/disabled=\{submitting\}/);
});

test('seller mobile CTA respects fixed navigation and hides while the application is visible',()=>{
 const page=read('src/app/become-a-seller/page.tsx');
 assert.match(page,/IntersectionObserver\(\(\[entry\]\) => setApplicationVisible\(entry.isIntersecting\)/);
 assert.match(page,/observer.disconnect\(\)/);
 assert.match(page,/!submitted && !seller && !roleError && !applicationVisible && !isUserLoading/);
 assert.match(page,/style=\{\{ bottom: 'calc\(90px \+ env\(safe-area-inset-bottom\)\)' \}\}/);
 assert.match(page,/aria-label="Apply to sell on TreatStory"/);
 assert.match(page,/md:hidden/);
 assert.match(page,/id="seller-application"/);
 assert.match(page,/scroll-mt-28/);
});
