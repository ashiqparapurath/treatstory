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
  assert.ok(api.includes('readBodyBytes(request,MAX_BANNER_BYTES+50_000)'));
  assert.ok(api.includes('contentLength > MAX_BANNER_BYTES + 50_000'));
  assert.ok(upload.includes("kind === 'banner' ? await prepareBannerImage(file) : file"));
  assert.ok(helper.includes('MAX_ORIGINAL_BANNER_BYTES = 16_000_000'));
  assert.ok(helper.includes('BANNER_UPLOAD_TARGET_BYTES = 3_400_000'));
});

test('standard promotional banners retain the original compact screenshot layout', () => {
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const slide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  assert.ok(home.includes('h-[clamp(200px,54vw,236px)]'), 'desktop original responsive height restored');
  assert.ok(home.includes('sm:h-64 md:h-72 lg:h-[340px]'), 'original desktop 340px maximum at large sizes restored');
  assert.ok(home.includes('min-h-[210px]'), 'original mobile banner sizing restored');
  assert.ok(home.includes('absolute inset-0 bg-black/40'), 'existing dark overlay remains');
  assert.ok(home.includes('relative max-w-2xl px-5 py-3 text-center text-white'), 'centered promotional content remains');
  assert.ok(home.includes('The TreatStory edit'), 'original editorial banner label remains');
  assert.ok(home.includes('className="object-cover"'), 'standard banner still fills its frame');
  assert.ok(!home.includes('aspect-video w-full'), 'homepage frame is not forced to 16:9');
  assert.ok(slide.includes('h-[210px]'), 'image-only mobile frame matches original standard height');
  assert.ok(slide.includes('sm:h-64 md:flex md:h-72 lg:h-[340px]'), 'image-only desktop frame matches standard');
  assert.ok(slide.includes('className="object-contain"'), 'image-only artwork stays uncropped');
  assert.ok(slide.includes('Math.abs(aspectRatio - frameSize.width / frameSize.height)'), 'background extension matches frame geometry');
  assert.ok(slide.includes('scale-110 object-cover blur-[24px]'), 'no blank side panels');
  assert.ok(slide.includes('style={{ width: imageWidth, height: imageHeight }}'), 'hotspot corresponds to visible image dimensions');
  assert.ok(slide.includes('mode === \'hotspot\''), 'embedded button remains clickable');
  assert.ok(slide.includes('mode === \'full\''), 'whole banner linking remains supported');
});

test('1280 x 720 uploads are accepted as image artwork inside the compact banner frame', () => {
  assert.equal(1280 / 720, 16 / 9);
  const slide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  assert.ok(slide.includes('const imageWidth = frameSize ? Math.min(frameSize.width, frameSize.height * aspectRatio) : 0'));
  assert.ok(slide.includes('const imageHeight = imageWidth / aspectRatio'));
});
