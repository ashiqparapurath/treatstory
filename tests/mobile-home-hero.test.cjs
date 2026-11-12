const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('mobile homepage hides decorative hero, keeps copy and desktop hero', () => {
  const source=fs.readFileSync('src/app/page.tsx','utf8');
  assert.match(source,/relative order-1 hidden md:order-2 md:block/);
  assert.match(source,/relative z-10 order-1 max-w-xl/);
  for(const marker of ['<HeroImage alt=', 'Little finds.', 'Lovely stories.', 'Explore the collection', '<BannerCarousel />', '<SellerStorefrontProducts']) assert.ok(source.includes(marker),marker);
});

test('original header divider remains visible on mobile and desktop', () => {
  const header=fs.readFileSync('src/components/header.tsx','utf8');
  assert.match(header,/sticky top-0 z-40 border-b border-\[#e9e2d8\]/);
  assert.match(header,/shadow-\[0_3px_18px/);
  assert.doesNotMatch(header,/border-b-0 bg-background shadow-none/);
});

test('mobile homepage provides breathing room and vertically stacked compact-screen actions', () => {
 const page=fs.readFileSync('src/app/page.tsx','utf8');
 assert.match(page,/pb-10 pt-9 sm:pb-10 sm:pt-8/);
 assert.match(page,/leading-\[1\.08\]/);
 assert.match(page,/mt-7 flex flex-col items-stretch gap-4/);
 assert.match(page,/min-\[400px\]:flex-row/);
 assert.match(page,/min-h-12 w-full/);
 assert.match(page,/sm:text-3xl">The latest from TreatStory/);
});
