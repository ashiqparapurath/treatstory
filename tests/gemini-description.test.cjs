const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { suggestionRequest } = require('../src/lib/product-description');
const { generateDescription } = require('../src/lib/server/gemini-description');
const { GET, POST } = require('../src/app/api/seller/description/route');
const input = { name: 'Cocoa cookies', category: 'Cookies', details: '', features: '', ingredients: 'Cocoa',
  sizes: [{ value: 250, unit: 'g' }], style: 'Professional', language: 'English' };

test('only bounded public listing fields can enter the prompt', () => {
  for (const change of [{ name: '' }, { category: '' }, { sellerId: 'other' }, { remaining: 5 }, { details: 'x'.repeat(2001) },
    { features: 'test@example.com' }, { sizes: [{ value: 1, unit: 'g', price: 5 }] }])
    assert.equal(suggestionRequest.safeParse({ ...input, ...change }).success, false);
  assert.ok(suggestionRequest.safeParse(input).success);
});

test('quota and generation require an ID token', async () => {
  for (const handler of [GET, POST]) assert.equal((await handler(new Request('http://localhost'))).status, 401);
});

test('SDK sends one bounded request and handles malformed, blocked and unavailable results', async t => {
  const description = 'Cocoa cookies in a 250 g size.';
  const ok = text => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
  for (const [body, httpStatus, expected, code] of [
    [ok(JSON.stringify({ description })), 200, 200],
    [ok('invalid JSON'), 200, 502], [ok('{"description":"<script>invalid</script>"}'), 200, 502],
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 200, 502], [{}, 200, 502],
    [{ error: { message: 'provider detail' } }, 429, 429], [{}, 400, 503, 'AI_REQUEST_REJECTED'], [{}, 403, 503, 'AI_ACCESS_DENIED'],
    [{}, 404, 503, 'AI_MODEL_UNAVAILABLE'], [{}, 503, 503, 'AI_PROVIDER_UNAVAILABLE'], [{}, 504, 504],
  ]) {
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), input);
      assert.ok(request.systemInstruction.parts[0].text.includes('untrusted'));
      return Response.json(body, { status: httpStatus });
    });
    const result = generateDescription(input, 'mock-only', 4);
    if (expected === 200) assert.equal(await result, description);
    else await assert.rejects(result, e => e.status === expected && e.details.code === code && e.details.remaining === 4 && !e.message.includes('provider detail'));
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('seller product description AI sits above the textarea and writes directly into it', () => {
  const fs = require('node:fs');
  const editor = fs.readFileSync('src/components/seller-product-editor.tsx', 'utf8');
  const ui = fs.readFileSync('src/components/seller-description-suggestion.tsx', 'utf8');
  assert.ok(editor.includes('flex min-w-0 items-center justify-between gap-2'));
  assert.ok(editor.indexOf('<SellerDescriptionSuggestion') < editor.indexOf('<Textarea id="creatorDescription"'));
  assert.ok(editor.includes("onUse={value => set('description', value)}"));
  assert.ok(ui.includes('onUse(suggestion);'), 'inserts server response immediately');
  assert.ok(ui.includes('latestDescription.current !== descriptionAtRequest'), 'does not clobber typing during a request');
  assert.ok(ui.includes("style: 'Professional', language: 'English'"), 'default style and language remain');
  assert.ok(ui.includes('aria-controls="creatorDescription"'));
  assert.ok(ui.includes('Google AI receives public product details'), 'privacy information is still accessible');
  assert.ok(ui.includes("remaining === 0"), 'daily limit still enforced');
  assert.ok(!ui.includes('Writing preferences'), 'large writing preferences section is removed');
  assert.ok(!ui.includes('Review and edit your suggestion'), 'textarea itself is the suggestion editor');
  assert.ok(!ui.includes('Use Description'), 'no second confirmation button');
  assert.ok(!ui.includes('Regenerate'), 'only one compact action is displayed');
});
