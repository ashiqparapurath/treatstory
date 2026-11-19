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
 for(const field of ['Product basics','Product photos','Review and publish','Payment requirements','Weight, size & variant pricing','Advanced listing details','seller-editor-availability','variant-pricing-title','Publish Product','Save as Draft','Save changes','required minLength={2}','role="combobox"']) assert.ok(source.includes(field),field);
 assert.match(source,/open=\{draft\.weightOptions\.length > 0 \? true : undefined\}/);
 assert.match(source,/disabled=\{blocked \|\| !enabled\}/);
});

test('new listings default to published while edit mode keeps saved visibility', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 const dashboard=read('src/app/seller/dashboard/page.tsx');
 assert.match(editor,/showPrice: true, status: 'published'/);
 assert.match(dashboard,/status: product\.status === 'published' \? 'published' : 'draft'/);
 assert.match(dashboard,/recovered\?\.draft \?\? emptyDraft/);
});
test('stock quantity and availability use matching labeled control geometry', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 for(const id of ['seller-editor-stock','seller-editor-preparation','seller-editor-availability']) {
   assert.ok(editor.includes('htmlFor="'+id+'"'), 'missing matching label for '+id);
   assert.ok(editor.includes('id="'+id+'"'), 'missing input or trigger id for '+id);
 }
 assert.match(editor,/grid items-start gap-3 sm:grid-cols-2/);
 assert.match(editor,/flex min-w-0 flex-col gap-1\.5/);
});

test('image links can be added individually with validation and gallery actions', () => {
 const editor=read('src/components/seller-product-editor.tsx');
 for (const marker of ['newPhotoLink','addPhotoLink','photoLinkError','Add link','Add image by link','creatorImageLink','aria-invalid={!!photoLinkError}','photos.includes(link)','photos.length >= 10','arrangePhotos([...photos, link])','shiftPhoto(i,-1)','shiftPhoto(i,1)']) assert.ok(editor.includes(marker),marker);
 assert.match(editor,/isPublicProductImageUrl\(link\)/);
 assert.match(editor,/type="button" variant="outline" className="h-11 shrink-0 rounded-xl/);
 assert.doesNotMatch(editor,/Or paste image URLs manually/);
});

test('seller page has distinctive product imagery, accurate trial terms and benefits',()=>{
 const page=read('src/app/become-a-seller/page.tsx');
 for(const marker of ['function CreatorHero()','function SellerBenefits()','function HowItWorks()','function SellerFaq()','Made by you.','Loved by many.','A space of your own','Stay close to every order','SELLER_TRIAL_MESSAGE'])assert.ok(page.includes(marker),marker);
 assert.match(page,/creator-hero-editorial-20261119\.webp/);
 assert.match(page,/alt="Artisan berry cake, pastries, handmade ceramics/);
 assert.match(page,/Home bakers must provide FSSAI registration or licence details/);
 assert.match(page,/Sellers across India can apply/);
});

test('seller application preserves data, auth, error and review behavior across three steps',()=>{
 const page=read('src/app/become-a-seller/page.tsx');
 for(const name of ['Your business','Contact details','Your story','Step {step} of 3','Application progress','Continue','Back','Send application'])assert.ok(page.includes(name),name);
 for(const id of ['businessName','businessCategory','businessCity','businessState','contactEmail','contactPhone','description'])assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(page,/onSubmit=\{submit\}/);
 assert.match(page,/if\(step !== 3\)/);
 assert.match(page,/setStep\(current => \(current \+ 1\) as ApplicationStep\)/);
 assert.match(page,/setStep\(current=>\(current-1\) as ApplicationStep\)/);
 assert.match(page,/name="website" tabIndex=\{-1\} autoComplete="off"/);
 assert.match(page,/fetch\('\/api\/seller-applications'/);
 assert.match(page,/user\.getIdToken\(\)/);
 assert.match(page,/businessCity:businessCity\.trim\(\)/);
 assert.match(page,/description:description\.trim\(\)/);
 assert.match(page,/if\(!response\.ok\)throw new Error/);
 assert.match(page,/setSubmitted\(true\)/);
 assert.match(page,/type="email" required/);
 assert.match(page,/type="tel" required minLength=\{5\}/);
 assert.match(page,/id="description" required minLength=\{1\} maxLength=\{2000\}/);
 assert.match(page,/register\?next=%2Fbecome-a-seller/);
 assert.match(page,/disabled=\{submitting\}/);
});

test('mobile application CTA stays above fixed nav and hides while form is visible',()=>{
 const page=read('src/app/become-a-seller/page.tsx');
 assert.match(page,/new IntersectionObserver\(\(\[entry\]\) => setApplicationVisible\(entry.isIntersecting\)/);
 assert.match(page,/observer.disconnect\(\)/);
 assert.match(page,/!submitted&&!seller&&!roleError&&!applicationVisible&&!isUserLoading/);
 assert.match(page,/style=\{\{bottom:'calc\(90px \+ env\(safe-area-inset-bottom\)\)'\}\}/);
 assert.match(page,/aria-label="Apply to sell on TreatStory"/);
 assert.match(page,/md:hidden/);
 assert.match(page,/id="seller-application"/);
 assert.match(page,/scroll-mt-28/);
});
