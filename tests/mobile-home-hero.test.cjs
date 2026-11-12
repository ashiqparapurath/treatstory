const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('mobile homepage hides decorative hero, keeps copy and desktop hero', () => {
  const source=fs.readFileSync('src/app/page.tsx','utf8');
  assert.match(source,/relative order-1 hidden md:order-2 md:block/);
  assert.match(source,/relative z-10 order-1 max-w-xl/);
  for(const marker of ['<HeroImage alt=', 'Little finds.', 'Lovely stories.', 'Explore the collection', '<BannerCarousel />', '<SellerStorefrontProducts']) assert.ok(source.includes(marker),marker);
});
