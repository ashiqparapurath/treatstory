const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const read = path => fs.readFileSync(path, 'utf8');

function deliveryModule() {
  const output = ts.transpileModule(read('src/lib/delivery-coverage.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports });
  return module.exports;
}

test('India delivery coverage is opt-in and preserves existing seller PIN restrictions', () => {
  const { acceptsDeliveryRequest, sellerCoverageLabel } = deliveryModule();
  const listed = { deliveryCoverage: 'selected-pincodes', deliveryPincodes: ['110001','400001'] };
  const national = { deliveryCoverage: 'india-wide', deliveryPincodes: [] };
  const oldRestricted = { deliveryPincodes: ['673001'] };
  const oldUnrestricted = { deliveryPincodes: [] };
  assert.equal(acceptsDeliveryRequest(listed,'110001'),true);
  assert.equal(acceptsDeliveryRequest(listed,'673001'),false);
  assert.equal(acceptsDeliveryRequest(national,'673001'),true);
  assert.equal(acceptsDeliveryRequest(national,'110001'),true);
  assert.equal(acceptsDeliveryRequest(national,'000000'),false);
  assert.equal(acceptsDeliveryRequest(oldRestricted,'110001'),false);
  assert.equal(acceptsDeliveryRequest(oldRestricted,'673001'),true);
  assert.equal(acceptsDeliveryRequest(oldUnrestricted,'110001'),true,'older sellers still receive requests for confirmation');
  assert.match(sellerCoverageLabel(national),/seller confirmation required/);
  assert.match(sellerCoverageLabel(oldUnrestricted),/Ask the seller to confirm/);
  assert.doesNotMatch(sellerCoverageLabel(oldUnrestricted),/across India/i);
});

test('India-wide seller settings are validated by Firestore and checkout paths',()=>{
  const rules=read('firestore.rules');
  const settings=read('src/components/seller-store-settings.tsx');
  const checkout=read('src/lib/server/atomic-checkout.ts');
  const quote=read('src/lib/server/quote-order.ts');
  const storefront=read('src/components/seller-store-client.tsx');
  const publicStore=read('src/lib/server/public-store.ts');
  assert.match(rules,/'deliveryCoverage', 'deliveryFee'/);
  assert.match(rules,/request.resource.data.deliveryCoverage in \['confirm','selected-pincodes','india-wide'\]/);
  assert.match(settings,/sellerCoverage/);
  assert.match(settings,/<SelectItem value="india-wide">/);
  assert.match(settings,/Nationwide requests are opt-in/);
  assert.match(settings,/draft.deliveryCoverage === 'selected-pincodes'/);
  assert.match(checkout,/acceptsDeliveryRequest\(s, input.pincode \|\| ""\)/);
  assert.match(quote,/acceptsDeliveryRequest\(seller, input.pincode \|\| ''\)/);
  assert.match(storefront,/sellerCoverageLabel\(visibleSeller!\)/);
  assert.match(publicStore,/'deliveryCoverage','businessCity','businessState'/);
  assert.doesNotMatch(settings,/Blank means unrestricted coverage/);
});

test('seller applications collect city/state and keep older applications compatible',()=>{
  const apply=read('src/app/become-a-seller/page.tsx');
  const api=read('src/app/api/seller-applications/route.ts');
  const model=read('src/lib/marketplace-types.ts');
  const settings=read('src/components/seller-store-settings.tsx');
  assert.match(apply,/id="businessCity" required/);
  assert.match(apply,/id="businessState" required/);
  for(const field of ['businessName:businessName.trim()','businessCity:businessCity.trim()','businessState:businessState.trim()','contactEmail:contactEmail.trim()']) assert.ok(apply.includes(field),field);
  assert.match(api,/businessCity: z.string\(\).trim\(\).min\(2\).max\(80\).optional\(\)/);
  assert.match(api,/businessState: z.string\(\).trim\(\).min\(2\).max\(80\).optional\(\)/);
  assert.match(read('src/lib/server/seller-activation.ts'),/businessCity: details.businessCity \|\| ''/);
  assert.match(model,/businessCity\?: string;/);
  assert.match(settings,/id="sellerBusinessCity"/);
  assert.match(settings,/id="sellerBusinessState"/);
});

test('India-wide discovery metadata does not claim all makers are from Kerala',()=>{
  const files=[
   'src/app/page.tsx','src/app/layout.tsx','src/app/products/layout.tsx',
   'src/app/new-arrivals/layout.tsx','src/app/become-a-seller/layout.tsx',
   'src/components/home-client.tsx','src/components/seller-store-client.tsx',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file),/across Kerala|in Kerala|Kerala creators|Independent Kerala creator/i,file);
  }
  assert.match(read('src/app/shop/[id]/page.tsx'),/seller.businessCity, seller.businessState/);
  assert.match(read('src/app/about/page.tsx'),/Born in Kerala and growing across India/);
  assert.match(read('src/lib/location-address.ts'),/country_code !== "in"/);
  assert.match(read('src/lib/addresses.ts'),/pincode: z.string\(\).regex\(\/\^\\d\{6\}\$\/\)/);
});
