const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('seller can choose fixed public price or market-dependent price on request', () => {
  const editor = read('src/components/seller-product-editor.tsx');
  const dashboard = read('src/app/seller/dashboard/page.tsx');
  const validation = read('src/lib/seller-product-validation.ts');

  assert.match(editor, /role="switch" aria-label="Show price publicly"/);
  assert.match(editor, /checked=\{draft\.showPrice\}/);
  assert.match(editor, /onChange=\{e=>set\('showPrice',e\.target\.checked\)\}/);
  assert.match(editor, /Show a fixed price\?/);
  assert.match(editor, /Price on request/);
  assert.match(editor, /required=\{draft\.showPrice\}/);
  assert.match(editor, /Prices can be left blank while hidden/);
  assert.match(dashboard, /basePrice = baseEntered \? Number\(draft\.price\) : \(!draft\.showPrice \? 0 : null\)/);
  assert.match(dashboard, /!draft\.showPrice \? \{ price: 0 \} : \{\}/);
  assert.match(dashboard, /showPrice: draft\.showPrice/);
  assert.match(validation, /showPrice: z\.boolean\(\)/);
});

test('hidden seller prices lead to quotes, and never expose checkout or size prices', () => {
  const card = read('src/components/seller-product-card.tsx');
  const collection = read('src/components/seller-product-collection.tsx');
  const detail = read('src/components/product-detail-client.tsx');
  const checkout = read('src/lib/server/atomic-checkout.ts');
  const structured = read('src/app/product/[id]/page.tsx');
  assert.match(card, /p\.showPrice \? <>/);
  assert.match(card, /Request current price/);
  assert.match(card, /Ask for price/);
  assert.match(card, /quoteHref/);
  assert.match(collection, /if \(!product\.showPrice\)/);
  assert.match(detail, /const askPrice = !!creator && creator\.showPrice === false/);
  assert.match(detail, /Request current price/);
  assert.match(detail, /askPrice \? <Link href=\{quoteHref\}/);
  assert.match(detail, /Chat on TreatStory/);
  assert.match(checkout, /p\.showPrice !== true/);
  assert.match(structured, /product\.showPrice === true/);
});

test('WhatsApp action uses its brand icon; TreatStory messaging uses regular chat', () => {
  const detail = read('src/components/product-detail-client.tsx');
  const whatsapp = read('src/components/whatsapp-icon.tsx');
  assert.match(detail, /import \{ WhatsAppIcon \} from '@\/components\/whatsapp-icon'/);
  assert.match(detail, /import \{ ArrowLeft.*MessageSquareText \} from 'lucide-react'/);
  assert.match(detail, /<MessageSquareText aria-hidden="true" className="h-5 w-5 shrink-0"/);
  assert.match(detail, /<WhatsAppIcon className="h-5 w-5 shrink-0"/);
  assert.match(detail, /Chat on WhatsApp/);
  assert.match(detail, /Chat on TreatStory/);
  assert.match(detail, /grid gap-2/);
  assert.match(detail, /https:\/\/wa\.me\//);
  assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
  assert.match(whatsapp, /viewBox="0 0 24 24"/);
  assert.match(whatsapp, /fill="currentColor"/);
  assert.doesNotMatch(detail, /MessageCircle/);
});

test('price requests preserve their selected seller and product through login', () => {
  const custom = read('src/app/custom-orders/page.tsx');
  const detail = read('src/components/product-detail-client.tsx');
  assert.match(custom, /'\/login\?next='/);
  assert.match(custom, /encodeURIComponent\(sellerId\)/);
  assert.match(custom, /encodeURIComponent\(productId\)/);
  assert.match(detail, /\/custom-orders\?seller=/);
});

test('seller product delivery fee is respected in custom quote totals', () => {
  const form = read('src/components/quote-checkout.tsx');
  const server = read('src/lib/server/quote-order.ts');
  assert.match(form, /applicableDeliveryCharge\(\{ deliveryCharge: product\?\.deliveryCharge \}, seller\?\.deliveryFee/);
  assert.match(server, /applicableDeliveryCharge\(\{ deliveryCharge: p\?\.deliveryCharge \}, seller\.deliveryFee/);
  assert.match(server, /input\.expectedTotal !== total/);
});
