const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('mobile homepage hides decorative hero, keeps copy and desktop hero', () => {
  const source=fs.readFileSync('src/components/home-client.tsx','utf8');
  assert.match(source,/relative order-1 hidden md:order-2 md:block/);
  assert.match(source,/relative z-10 order-1 min-w-0 max-w-xl/);
  for(const marker of ['<HeroImage alt=', 'Little finds.', 'Lovely stories.', 'Explore collection', '<BannerCarousel />', '<SellerStorefrontProducts']) assert.ok(source.includes(marker),marker);
});

test('original header divider remains visible on mobile and desktop', () => {
  const header=fs.readFileSync('src/components/header.tsx','utf8');
  assert.match(header,/sticky top-0 z-40 border-b border-\[#e9e2d8\]/);
  assert.match(header,/shadow-\[0_3px_18px/);
  assert.doesNotMatch(header,/border-b-0 bg-background shadow-none/);
});

test('mobile homepage keeps both hero buttons in one row on compact screens', () => {
 const page=fs.readFileSync('src/components/home-client.tsx','utf8');
 assert.match(page,/pb-10 pt-9 sm:pb-10 sm:pt-8/);
 assert.match(page,/leading-\[1\.08\]/);
 assert.match(page,/hero-cta-container mt-7 w-full sm:mt-5/);
 assert.match(page,/flex flex-nowrap items-center gap-2/);
 assert.match(page,/href="\/products" aria-label="Explore collection"[^>]*shrink-0 whitespace-nowrap/);
 assert.match(page,/<span className="hero-cta-short" aria-hidden="true">Explore<\/span>/);
 assert.match(page,/<span className="hero-cta-full" aria-hidden="true">Explore collection<\/span>/);
 assert.match(page,/href="\/about"[^>]*shrink-0[^>]*whitespace-nowrap[^>]*>Our story<\/Link>/);
 assert.doesNotMatch(page,/min-\[400px\]:flex-row/);
 assert.match(page,/sm:text-3xl">The latest from TreatStory/);
});

test('Explore label uses the available hero-column space instead of screen width', () => {
 const css=fs.readFileSync('src/app/globals.css','utf8');
 assert.match(css,/\.hero-cta-container\s*\{\s*container: hero-cta \/ inline-size;/);
 assert.match(css,/\.hero-cta-short\s*\{ display: inline;/);
 assert.match(css,/\.hero-cta-full\s*\{ display: none;/);
 assert.match(css,/@container hero-cta \(min-width: 24rem\)/);
 assert.match(css,/@container hero-cta[^]*?\.hero-cta-short\s*\{ display: none;/);
 assert.match(css,/@container hero-cta[^]*?\.hero-cta-full\s*\{ display: inline;/);
});
