const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('seller logo is edited from the profile avatar without a large file chooser', () => {
  const page = fs.readFileSync('src/components/seller-store-settings.tsx', 'utf8');
  assert.match(page, /aria-label="Edit store logo"/);
  assert.match(page, /onClick=\{\(\) => logoInput\.current\?\.click\(\)\}/);
  assert.match(page, /id="sellerLogo" type="file"[^\n]+className="sr-only"/);
  assert.equal((page.match(/id="sellerLogo"/g) || []).length, 1);
  assert.doesNotMatch(page, /Choose File|border-dashed border-\[#d9cabb\]/);
  assert.match(page, /uploadTreatStoryPhoto\(user, file, 'logo'\)/);
  assert.match(page, /aria-label="Edit store logo"[\s\S]*?disabled=\{!active \|\| busy \|\| uploading\}/);
});

test('mobile product hero has left back action, horizontal wishlist and share actions, and a single desktop wishlist', () => {
  const page = fs.readFileSync('src/components/product-detail-client.tsx','utf8');
  const start = page.indexOf('absolute inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-20');
  assert.ok(start >= 0, 'reference-style safe-area mobile hero overlay exists');
  const overlay = page.slice(start, page.indexOf('</div>\n          </div>',start));
  assert.match(overlay, /href="\/products" aria-label="Back to products"/);
  assert.match(overlay, /<FavoriteToggle compact/);
  assert.match(overlay, /<ProductShareButton/);
  assert.ok(overlay.indexOf('<FavoriteToggle compact') < overlay.indexOf('<ProductShareButton'));
  assert.match(overlay, /onTouchStart=\{event=>event\.stopPropagation\(\)\}/);
  assert.match(page, /className="hidden justify-start sm:flex"><FavoriteToggle/);
});

test('browser tab uses original favicon and PWA artwork stays separate', () => {
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  assert.match(layout, /icon: \[\{ url: '\/favicon\.ico'/);
  assert.match(layout, /apple: \[\{ url: pwaIcons\.apple/);
  const pwa = fs.readFileSync('src/lib/pwa-icons.ts', 'utf8');
  assert.match(pwa, /"icon192"/);
  assert.match(pwa, /"maskable"/);
  assert.match(layout, /<link rel="manifest" href="\/manifest\.json"/);
});

test('seller storefront presents a compact responsive approved creator identity', () => {
  const page = fs.readFileSync('src/components/seller-store-client.tsx', 'utf8');
  assert.match(page, /rounded-\[28px\] border border-\[#e9dfd2\]/);
  assert.match(page, /id="seller-store-name"/);
  assert.match(page, /min-w-0 break-words text-\[clamp\(/);
  assert.match(page, /\[overflow-wrap:anywhere\]/);
  assert.match(page, /TreatStory approved/);
  assert.match(page, /Marketplace approval is not third-party identity verification/);
  assert.match(page, /FSSAI number \(seller supplied\)/);
  assert.match(page, /Accepting new orders/);
  assert.match(page, /<StoreShareButton sellerId=\{visibleSeller!\.slug \|\| id\} storeName=\{visibleSeller!\.businessName\}/);
  assert.match(page, /<SellerProductCollection products=\{visibleProducts\}/);
  assert.doesNotMatch(page, /<ProductImage/);
});

test('seller settings exposes public storefront link and sharing without saving store settings', () => {
  const settings = fs.readFileSync('src/components/seller-store-settings.tsx', 'utf8');
  assert.match(settings, /Preview public storefront/);
  assert.match(settings, /<StoreShareButton sellerId=\{shareSlug\} storeName=\{seller.businessName\} dark/);
  const share = fs.readFileSync('src/components/store-share-button.tsx', 'utf8');
  assert.match(share, /type="button"/);
  assert.match(share, /navigator\.clipboard\?\.writeText/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /Storefront link/);
  assert.match(share, /Share on WhatsApp/);
  assert.match(share, /Select and copy your store link/);
});

test('storefront shared URL stays canonical and encodes seller IDs', () => {
  const vm = require('node:vm');
  const ts = require('typescript');
  const file = fs.readFileSync('src/lib/storefront-share.ts', 'utf8');
  const js = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, URL, encodeURIComponent });
  const { storefrontShareUrl, storefrontWhatsAppUrl } = module.exports;
  assert.equal(storefrontShareUrl('seller-test-1'), 'https://treatstory.in/shop/seller-test-1');
  assert.equal(storefrontShareUrl('seller/name'), 'https://treatstory.in/shop/seller%2Fname');
  const whatsapp = storefrontWhatsAppUrl('seller-test-1', 'As Production');
  assert.ok(whatsapp.startsWith('https://wa.me/?text='));
  assert.match(decodeURIComponent(whatsapp), /Discover As Production on TreatStory/);
  assert.match(decodeURIComponent(whatsapp), /https:\/\/treatstory.in\/shop\/seller-test-1/);
});

test('public seller identity card stays compact on phones without hiding approval, delivery or share actions', () => {
  const client = fs.readFileSync('src/components/seller-store-client.tsx', 'utf8');
  const share = fs.readFileSync('src/components/store-share-button.tsx', 'utf8');
  assert.match(client, /hidden min-w-0 items-center justify-between gap-3 border-b/);
  assert.match(client, /h-12 w-12 shrink-0 rounded-\[14px\]/);
  assert.match(client, /sm:h-20 sm:w-20/);
  assert.match(client, /text-\[clamp\(1\.1rem,5\.3vw,1\.3rem\)\]/);
  assert.match(client, /<span className="sm:hidden">Approved<\/span>/);
  assert.match(client, /Taking orders/);
  assert.match(client, /line-clamp-2 max-w-3xl/);
  assert.match(client, /<StoreShareButton sellerId=\{visibleSeller!\.slug \|\| id\} storeName=\{visibleSeller!\.businessName\} compact/);
  assert.match(client, /sellerCoverageLabel\(visibleSeller!\)/);
  assert.match(client, /Marketplace approval is not third-party identity verification/);
  assert.match(client, /FSSAI number \(seller supplied\)/);
  assert.match(share, /compact\?: boolean/);
  assert.match(share, /Share store/);
});
