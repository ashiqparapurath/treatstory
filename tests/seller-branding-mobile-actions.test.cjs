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

test('mobile product image shows wishlist below share without duplicate mobile controls', () => {
  const page = fs.readFileSync('src/components/product-detail-client.tsx', 'utf8');
  const start = page.indexOf('absolute right-3 top-3 z-10 flex flex-col items-center gap-2 sm:hidden');
  assert.ok(start >= 0, 'mobile image overlay exists');
  const overlay = page.slice(start, page.indexOf('</div>', start));
  assert.ok(overlay.indexOf('<ProductShareButton') >= 0);
  assert.ok(overlay.indexOf('<FavoriteToggle compact') > overlay.indexOf('<ProductShareButton'));
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

test('public seller card gives name its own responsive row and keeps status / share actions separate', () => {
  const page = fs.readFileSync('src/components/seller-store-client.tsx', 'utf8');
  assert.match(page, /mt-7 min-w-0 rounded-3xl border/);
  assert.match(page, /mt-5 flex min-w-0 items-center gap-3 sm:gap-5/);
  assert.match(page, /h1 className="min-w-0 flex-1 break-words text-\[clamp\(/);
  assert.match(page, /mt-5 flex min-w-0 flex-wrap items-center gap-3/);
  const heading = page.indexOf('<h1 className="min-w-0');
  const disclaimer = page.indexOf('Approved TreatStory seller');
  const badge = page.indexOf('Accepting new orders');
  const share = page.indexOf('<StoreShareButton');
  assert.ok(heading >= 0 && heading < disclaimer && disclaimer < badge && badge < share);
  assert.doesNotMatch(page, /flex flex-wrap items-start justify-between gap-4/);
  assert.match(page, /<StoreShareButton sellerId=\{id\} storeName=\{seller.businessName\}/);
});

test('seller settings exposes public storefront link and sharing without saving store settings', () => {
  const settings = fs.readFileSync('src/components/seller-store-settings.tsx', 'utf8');
  assert.match(settings, /Preview public storefront/);
  assert.match(settings, /<StoreShareButton sellerId=\{user.uid\} storeName=\{seller.businessName\} dark/);
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
  assert.equal(storefrontShareUrl('seller-test-1'), 'https://treatstory.vercel.app/shop/seller-test-1');
  assert.equal(storefrontShareUrl('seller/name'), 'https://treatstory.vercel.app/shop/seller%2Fname');
  const whatsapp = storefrontWhatsAppUrl('seller-test-1', 'As Production');
  assert.ok(whatsapp.startsWith('https://wa.me/?text='));
  assert.match(decodeURIComponent(whatsapp), /Explore As Production on TreatStory/);
  assert.match(decodeURIComponent(whatsapp), /https:\/\/treatstory.vercel.app\/shop\/seller-test-1/);
});
