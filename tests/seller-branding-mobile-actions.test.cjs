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
  const page = fs.readFileSync('src/app/product/[id]/page.tsx', 'utf8');
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
