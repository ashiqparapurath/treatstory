const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync('src/lib/quote-request-prefill.ts','utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(compiled, { module: moduleRef, exports: moduleRef.exports }, {
  filename: 'quote-request-prefill.ts',
});
const { quoteRequestSize, priceRequestDescription } = moduleRef.exports;
const product = {
  name: 'Blush Meadow Bouquet',
  category: 'Handmade Gifts',
  sku: 'TS-FLR-001',
  description: 'A hand-arranged bouquet with seasonal roses and local flowers.',
  weightOptions: [
    { value: 0.5, unit: 'kg', price: 0 },
    { value: 1, unit: 'kg', price: 0 },
  ],
};

test('variable-price request auto-fills the actual product, category, SKU and selected size', () => {
  const description = priceRequestDescription(product, '1 kg');
  assert.match(description, /Product: Blush Meadow Bouquet/);
  assert.match(description, /Category: Handmade Gifts/);
  assert.match(description, /Selected size: 1 kg/);
  assert.match(description, /Product SKU: TS-FLR-001/);
  assert.match(description, /Product details: A hand-arranged bouquet/);
  assert.match(description, /confirm the current market price/);
  assert.doesNotMatch(description, /₹|Fixed price|NaN/);
});

test('unknown URL-supplied sizes are ignored rather than shown as product facts', () => {
  assert.equal(quoteRequestSize(product, '999 kg'), '');
  assert.equal(quoteRequestSize(product, '1 kg'), '1 kg');
  assert.doesNotMatch(priceRequestDescription(product, '999 kg'), /Selected size:/);
  assert.doesNotMatch(priceRequestDescription(product, '<script>alert(1)</script>'), /<script>/);
});

test('long product details are capped to quote schema limit; no price is invented', () => {
  const result = priceRequestDescription({ ...product, description: 'a'.repeat(10000) }, '0.5 kg');
  assert.ok(result.length <= 2000);
  assert.match(result, /Selected size: 0.5 kg/);
  assert.match(result, /confirm the current market price/);
  const bare = priceRequestDescription({ name: 'Flowers', category: 'Gifts', description: '', weightOptions: [] });
  assert.match(bare, /Product: Flowers/);
  assert.doesNotMatch(bare, /Product details: /);
});
