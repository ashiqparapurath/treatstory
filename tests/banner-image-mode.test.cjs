const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'src/lib/banner-layout.ts'), 'utf8');
const compiled = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(compiled, { module: moduleRef, exports: moduleRef.exports, URL });
const { safeBannerLink, normalizeBannerHotspot } = moduleRef.exports;

test('image-only banner links stay on the product catalog', () => {
  assert.equal(safeBannerLink('/products'), '/products');
  assert.equal(safeBannerLink('/products?category=Gift Boxes'), '/products?category=Gift%20Boxes');
  assert.equal(safeBannerLink('https://evil.example/products'), null);
  assert.equal(safeBannerLink('//evil.example/products'), null);
  assert.equal(safeBannerLink('javascript:alert(1)'), null);
  assert.equal(safeBannerLink('/account'), null);
  assert.equal(safeBannerLink('/products#fragment'), null);
  assert.equal(safeBannerLink('/products?redirect=https://evil.example'), null);
  assert.equal(safeBannerLink('/products\\evil'), null);
  assert.equal(safeBannerLink(null), null);
});

test('hotspots are restricted to the full displayed image', () => {
  const clipped = normalizeBannerHotspot({ x: 99, y: 99, width: 50, height: 60 });
  assert.equal(clipped.x, 50);
  assert.equal(clipped.y, 40);
  assert.equal(clipped.width, 50);
  assert.equal(clipped.height, 60);
  const invalid = normalizeBannerHotspot({ x: NaN, y: Infinity, width: -1, height: 500 });
  assert.ok(invalid.x >= 0 && invalid.x <= 100 - invalid.width);
  assert.ok(invalid.y >= 0 && invalid.y <= 100 - invalid.height);
  assert.ok(invalid.width >= 8 && invalid.height >= 8);
});

test('legacy banners render standard while image artwork stays uncropped and linked accessibly', () => {
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const slide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  const form = fs.readFileSync(path.join(root, 'src/components/admin/banner-form.tsx'), 'utf8');
  assert.match(home, /banner\.displayMode === 'image-only'/);
  assert.match(slide, /object-contain/);
  assert.match(slide, /aria-label=\{accessibleLabel\}/);
  assert.match(slide, /safeBannerLink\(banner\.buttonLink\)/);
  assert.match(slide, /mobileHotspot \|\| banner\.desktopHotspot/);
  assert.match(form, /value\.displayMode === 'standard'/);
  assert.match(form, /imageLinkMode !== 'none'/);
  assert.match(form, /BannerHotspotEditor label="Desktop"/);
  assert.match(form, /BannerHotspotEditor label="Mobile"/);
});

test('banner upload respects banner-sized request bodies and prepares larger images', () => {
  const api = fs.readFileSync(path.join(root, 'src/app/api/cloudinary/upload/route.ts'), 'utf8');
  const upload = fs.readFileSync(path.join(root, 'src/lib/cloudinary-upload.ts'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'src/lib/banner-image-upload.ts'), 'utf8');
  assert.match(api, /readBodyBytes\\(request,MAX_BANNER_BYTES\\+50_000\\)/);
  assert.match(api, /if \\(contentLength > MAX_BANNER_BYTES \\+ 50_000\\)/);
  assert.match(upload, /kind === 'banner' \\? await prepareBannerImage\\(file\\) : file/);
  assert.match(helper, /MAX_ORIGINAL_BANNER_BYTES = 16_000_000/);
  assert.match(helper, /BANNER_UPLOAD_TARGET_BYTES = 3_400_000/);
});
