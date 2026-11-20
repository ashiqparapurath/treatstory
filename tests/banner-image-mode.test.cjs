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

test('legacy banners remain standard and full-frame artwork is linked accessibly', () => {
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const slide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  const form = fs.readFileSync(path.join(root, 'src/components/admin/banner-form.tsx'), 'utf8');
  assert.match(home, /banner\.displayMode === 'image-only'/);
  assert.match(slide, /object-cover object-center/);
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


test('standard and image-only banners retain identical compact heights and fill the frame', () => {
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const slide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'src/components/admin/banner-hotspot-editor.tsx'), 'utf8');
  const form = fs.readFileSync(path.join(root, 'src/components/admin/banner-form.tsx'), 'utf8');
  assert.ok(home.includes('min-h-[210px]'));
  assert.ok(home.includes('sm:h-64 md:h-72 lg:h-[340px]'));
  assert.ok(home.includes('absolute inset-0 bg-black/40'), 'standard banner remains unchanged');
  assert.ok(home.includes('relative max-w-2xl px-5 py-3 text-center text-white'));
  assert.ok(slide.includes('h-[210px]'), 'image-only mobile matches the standard');
  assert.ok(slide.includes('sm:h-64 md:block md:h-72 lg:h-[340px]'), 'image-only desktop matches the standard');
  assert.ok(slide.includes('mobile ? "object-contain object-center" : "object-cover object-center"'), 'mobile image is uncropped, desktop still fills');
  assert.ok(slide.includes("mobile ? 'contain' : 'cover'"), 'mobile uses contain geometry');
  assert.ok(!slide.includes('blur-[24px]'), 'no artificial blurry side fills');
  assert.ok(slide.includes('bannerImageRect(frameSize.width, frameSize.height, ratio'));
  assert.ok(slide.includes("mode === 'hotspot'"));
  assert.ok(slide.includes("mode === 'full'"));
  assert.ok(editor.includes('bannerImageRect(areaWidth, areaHeight, imageRatio, previewFit, position)'));
  assert.ok(editor.includes('bannerHotspotVisibility'));
  assert.ok(form.includes('frameAspectRatio={1360 / 340}'));
  assert.ok(form.includes('frameAspectRatio={390 / 210} fit={mode === \'image-only\' ? \'contain\' : \'cover\'}'));
});

test('object-cover centering and hotspot visibility calculate cropped image bounds', () => {
  const { bannerCoverRect, bannerHotspotVisibility } = moduleRef.exports;
  const cover = bannerCoverRect(1360, 340, 16 / 9);
  assert.equal(cover.width, 1360);
  assert.equal(cover.height, 765);
  assert.equal(cover.left, 0);
  assert.equal(cover.top, -212.5);
  const centerHotspot = { x: 40, y: 40, width: 20, height: 20 };
  assert.ok(Math.abs(bannerHotspotVisibility(cover, centerHotspot, 1360, 340) - 1) < 1e-9);
  const bottomHotspot = { x: 5, y: 80, width: 25, height: 12 };
  assert.equal(bannerHotspotVisibility(cover, bottomHotspot, 1360, 340), 0);
  const mobileCover = bannerCoverRect(390, 210, 16 / 9);
  assert.equal(mobileCover.width, 390);
  assert.ok(mobileCover.top < 0 && mobileCover.top > -6);
  assert.ok(Math.abs(bannerHotspotVisibility(mobileCover, bottomHotspot, 390, 210) - 1) < 1e-9);
});

test('mobile shows every pixel of a 1280×320 artwork while retaining the clickable button', () => {
  const { bannerContainRect, bannerHotspotVisibility } = moduleRef.exports;
  const imageBox = bannerContainRect(360, 210, 1280 / 320);
  assert.equal(imageBox.width, 360);
  assert.equal(imageBox.height, 90);
  assert.equal(imageBox.left, 0);
  assert.equal(imageBox.top, 60);
  const button = { x: 6, y: 72, width: 27, height: 16 };
  assert.ok(Math.abs(bannerHotspotVisibility(imageBox, button, 360, 210) - 1) < 1e-9);

  const fullWide = bannerContainRect(390, 210, 16 / 9);
  assert.ok(fullWide.left > 0 && fullWide.left < 10);
  assert.equal(fullWide.height, 210);
  assert.ok(Math.abs(bannerHotspotVisibility(fullWide, button, 390, 210) - 1) < 1e-9);
});

test('saved placement projects into the same image geometry on desktop and mobile', () => {
  const { bannerImageRect, normalizeBannerPlacement, panBannerImage } = moduleRef.exports;
  const desktop = bannerImageRect(1360, 340, 16 / 9, 'cover', null);
  assert.equal(desktop.width, 1360);
  assert.equal(desktop.height, 765);
  assert.equal(desktop.top, -212.5);
  const mobile = bannerImageRect(360, 210, 4, 'contain', { x: 50, y: 50, zoom: 100 });
  assert.equal(mobile.width, 360);
  assert.equal(mobile.height, 90);
  assert.equal(mobile.top, 60);
  const mobileZoom = bannerImageRect(360, 210, 4, 'contain', { x: 0, y: 50, zoom: 150 });
  assert.equal(mobileZoom.width, 540);
  assert.equal(mobileZoom.left, 0);
  assert.equal(mobileZoom.height, 135);
  const mobileRight = bannerImageRect(360, 210, 4, 'contain', { x: 100, y: 50, zoom: 150 });
  assert.equal(mobileRight.left, -180);
  const adjusted = panBannerImage({ x: 50, y: 50, zoom: 150 }, 360, 210,
    bannerImageRect(360, 210, 4, 'contain', { x: 50, y: 50, zoom: 150 }), -45, 0);
  assert.equal(adjusted.x, 75);
  const clamped = normalizeBannerPlacement({ x: -8, y: 200, zoom: 900 });
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 100);
  assert.equal(clamped.zoom, 250);
});

test('banner admin form persistently saves responsive adjustments and exposes live editing', () => {
  const form = fs.readFileSync(path.join(root, 'src/components/admin/banner-form.tsx'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'src/components/admin/banner-hotspot-editor.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const imageSlide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  const standardRenderer = fs.readFileSync(path.join(root, 'src/components/banner-placed-image.tsx'), 'utf8');
  assert.ok(form.includes("desktopPlacement: banner?.desktopPlacement"));
  assert.ok(form.includes("mobilePlacement: banner?.mobilePlacement"));
  assert.ok(form.includes("desktopPlacement: data.desktopPlacement"));
  assert.ok(form.includes("mobilePlacement: data.mobilePlacement"));
  assert.ok(form.includes("Live banner previews"));
  assert.ok(form.includes('label="Desktop"'));
  assert.ok(form.includes('label="Mobile"'));
  assert.ok(editor.includes("onPointerDown={start}"));
  assert.ok(editor.includes("panBannerImage("));
  assert.ok(editor.includes('type="range"'));
  assert.ok(editor.includes("Reset"));
  assert.ok(editor.includes("Move button"));
  assert.ok(editor.includes("Move image"));
  assert.ok(home.includes('BannerPlacedImage'));
  assert.ok(imageSlide.includes("banner.desktopPlacement"));
  assert.ok(imageSlide.includes("banner.mobilePlacement"));
  assert.ok(standardRenderer.includes('bannerImageRect(frame.width, frame.height, ratio, fit, placement)'));
});

test('visual banner editor uses a blank-free artwork canvas and separate honest website preview', () => {
  const editor = fs.readFileSync(path.join(root, 'src/components/admin/banner-hotspot-editor.tsx'), 'utf8');
  assert.ok(editor.includes("displayMode === 'image-only' ? 'artwork' : 'website'"));
  assert.ok(editor.includes("viewMode === 'artwork'"));
  assert.ok(editor.includes("artworkMode ? imageRatio"));
  assert.ok(editor.includes("previewFit = artworkMode ? 'contain' : fit"));
  assert.ok(editor.includes("onLoad={event => measureImage(event.currentTarget)}"));
  assert.ok(editor.includes('Full artwork'));
  assert.ok(editor.includes('Website view'));
  assert.ok(editor.includes("mobile && !artworkMode ? 'mx-auto max-w-[390px]'"));
  assert.ok(editor.includes("aria-pressed={artworkMode}"));
  assert.ok(editor.includes('actual website frame'));
});

test('desktop and mobile uploads are offered together for both banner modes', () => {
  const form = fs.readFileSync(path.join(root, 'src/components/admin/banner-form.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  const imageSlide = fs.readFileSync(path.join(root, 'src/components/banner-image-slide.tsx'), 'utf8');
  assert.ok(form.includes('Desktop image'));
  assert.ok(form.includes('Mobile image'));
  assert.ok(form.indexOf('Upload mobile banner image') < form.indexOf("mode === 'standard'"), 'both image slots appear before mode-specific fields');
  assert.ok(form.includes('Recommended 1280 × 320 px'));
  assert.ok(form.includes('Recommended 780 × 420 px'));
  assert.ok(form.includes('if (mobileFile) mobileUrl = await uploadTreatStoryPhoto(user, mobileFile, \'banner\')'));
  assert.ok(form.includes('mobileImageUrl: mobileUrl,'));
  assert.ok(form.includes('src={mobilePreview || imagePreview}'));
  assert.ok(form.includes("mobileAspectRatio: mobileUrl ? data.mobileAspectRatio : data.imageAspectRatio"));
  assert.ok(!form.includes("mobileImageUrl: imageOnly ? mobileUrl : ''"));
  assert.ok(!form.includes("mobileFile && data.displayMode === 'image-only'"));
  assert.ok(home.includes('src={banner.mobileImageUrl || banner.imageUrl} alt={banner.title}'));
  assert.ok(home.includes('banner.mobileAspectRatio || banner.imageAspectRatio'));
  assert.ok(imageSlide.includes('mobile && banner.mobileImageUrl ? banner.mobileImageUrl : banner.imageUrl'));
});

test('banner carousel automatically rotates slides without a stop button', () => {
  const home = fs.readFileSync(path.join(root, 'src/components/home-client.tsx'), 'utf8');
  assert.ok(!home.includes('setAutoRotate'), 'no visible or internal manual stop toggle');
  assert.ok(home.includes("(banners?.length ?? 0)<2"), 'only multiple banners auto-rotate');
  assert.ok(home.includes("const timer=window.setInterval(()=>api.scrollNext(),6000)"));
  assert.ok(home.includes("window.clearInterval(timer)"), 'interval is cleaned up');
  assert.ok(home.includes('firstLoaded'), 'wait for the first banner to load');
  assert.ok(home.includes("document.addEventListener('visibilitychange'"), 'pause when tab is hidden');
  assert.ok(home.includes("prefers-reduced-motion: reduce"), 'respect reduced-motion preference');
  assert.ok(home.includes("hovered || focused || touching"), 'pause during interaction');
  assert.ok(home.includes('onMouseEnter={()=>setHovered(true)}'));
  assert.ok(home.includes('onFocusCapture={()=>setFocused(true)}'));
  assert.ok(home.includes('onTouchStartCapture={()=>setTouching(true)}'));
  assert.ok(home.includes("onTouchEndCapture={()=>setTouching(false)}"));
  assert.ok(!home.includes("Pause automatic banner rotation"), 'no pause button on mobile or desktop');
  assert.ok(!home.includes("Resume automatic banner rotation"), 'no resume button on mobile or desktop');
  assert.ok(!home.includes("<Pause"), 'playback controls absent');
  assert.ok(!home.includes("<Play"), 'playback controls absent');
  assert.ok(home.includes('aria-label={`Banner ${active + 1} of ${banners.length}`}'), 'mobile slide indicators remain');
  assert.ok(home.includes("loop: true"), 'rotation wraps to the first banner');
});
