const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : id === 'lucide-react' ? new Proxy({}, { get: () => () => null }) : require(id), console,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; }, clearTimeout, URL, URLSearchParams }, { filename: file });
  return module.exports;
}
function snapshot(id, data = {}) { return { docs: [{ id, data: () => data }] }; }

test('public catalog shares listeners, reuses warm data, and clears failed reads on retry', () => {
  const listeners = [];
  let stopped = 0;
  const { usePublicCatalog } = load('src/firebase/firestore/use-public-catalog.ts', {
    'firebase/firestore': { queryEqual: (a, b) => a.path === b.path, onSnapshot: (q, next, error) => { listeners.push({ next, error }); return () => stopped++; } },
    '@/firebase/provider': { useUser: () => ({ user: null }) },
  });
  let result;
  const query = { path: 'products' };
  function Probe() { result = usePublicCatalog(query); return null; }
  let tree;
  act(() => { tree = create(React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(Probe))); });
  assert.equal(listeners.length, 1);
  assert.equal(result.isLoading, true);
  act(() => listeners[0].next(snapshot('a', { name: 'Cake' })));
  assert.equal(result.data[0].name, 'Cake');
  act(() => tree.unmount());
  assert.equal(stopped, 1);
  act(() => { tree = create(React.createElement(Probe)); });
  assert.equal(result.isLoading, false);
  assert.equal(result.data[0].id, 'a');
  assert.equal(listeners.length, 2); // Always revalidate cached results.
  const error = new Error('offline');
  act(() => listeners[1].error(error));
  assert.equal(result.error, error);
  assert.equal(result.isLoading, false);
  act(() => result.retry());
  assert.equal(listeners.length, 3);
  assert.equal(result.isLoading, true);
  act(() => listeners[2].next(snapshot('b')));
  assert.equal(result.data[0].id, 'b');
  act(() => tree.unmount());
});

test('catalog never reuses another account or filter result', () => {
  let user = { uid: 'buyer-a' }, result;
  const listeners = [];
  const { usePublicCatalog } = load('src/firebase/firestore/use-public-catalog.ts', {
    'firebase/firestore': { queryEqual: (a,b) => a.path === b.path, onSnapshot: (q,next) => { listeners.push(next); return () => {}; } },
    '@/firebase/provider': { useUser: () => ({ user }) },
  });
  function Probe({ query }) { result = usePublicCatalog(query); return null; }
  const first = { path: 'products' };
  let tree;
  act(() => { tree = create(React.createElement(Probe, { query: first })); });
  act(() => listeners[0](snapshot('private-to-session')));
  user = { uid: 'buyer-b' };
  act(() => tree.update(React.createElement(Probe, { query: first })));
  assert.equal(result.data, null);
  assert.equal(result.isLoading, true);
  act(() => listeners[1](snapshot('new-session')));
  act(() => tree.update(React.createElement(Probe, { query: { path: 'other-filter' } })));
  assert.equal(result.data, null);
  act(() => tree.unmount());
});

for (const [file, hook, doc] of [['use-collection.tsx','useCollection',false], ['use-doc.tsx','useDoc',true]]) {
  test(`${hook} clears changed targets and exposes retryable original errors`, () => {
    let result;
    const listeners = [];
    const api = load(`src/firebase/firestore/${file}`, { 'firebase/firestore': { onSnapshot: (q,next,error) => { listeners.push({ next,error }); return () => {}; } } });
    function Probe({ query }) { result = api[hook](query); return null; }
    let tree;
    act(() => { tree = create(React.createElement(Probe, { query: { __memo: true, path: 'a' } })); });
    assert.equal(result.isLoading, true);
    act(() => listeners[0].next(doc ? { exists: () => true, data: () => ({ value: 1 }), id: 'a' } : snapshot('a')));
    act(() => tree.update(React.createElement(Probe, { query: { __memo: true, path: 'b' } })));
    assert.equal(result.data, null);
    const error = new Error('unavailable');
    act(() => listeners[1].error(error));
    assert.equal(result.error, error);
    assert.equal(result.isLoading, false);
    act(() => result.retry());
    assert.equal(listeners.length, 3);
    act(() => tree.update(React.createElement(Probe, { query: null })));
    assert.equal(result.data, null);
    assert.equal(result.isLoading, false);
    act(() => tree.unmount());
  });
}

test('successful final purchase keeps checkout confirmation mounted', () => {
  let cart = { hydrated: true, cartItems: [{ id: 'seller:a', price: 10, quantity: 1, showPrice: true }] };
  function CheckoutMock() { return React.createElement('div', null, 'Confirmation'); }
  const { default: Page } = load('src/app/checkout/page.tsx', {
    'next/link': 'a', 'next/navigation': { useSearchParams: () => new URLSearchParams('product=a') },
    '@/components/loading-states': { SectionSkeleton: () => null }, '@/components/header': { Header: () => null },
    '@/components/creator-checkout': { CreatorCheckout: CheckoutMock }, '@/context/cart-context': { useCart: () => cart },
  });
  let tree;
  act(() => { tree = create(React.createElement(Page)); });
  act(() => { tree.root.findByType(CheckoutMock).props.onComplete(); cart = { ...cart, cartItems: [] }; tree.update(React.createElement(Page)); });
  assert.equal(tree.root.findAllByType(CheckoutMock).length, 1);
  assert.equal(JSON.stringify(tree.toJSON()).includes('Your checkout is empty'), false);
  act(() => tree.unmount());
});

test('checkout tracks product query changes during client navigation', () => {
  let params = 'product=a';
  function CheckoutMock() { return null; }
  const { default: Page } = load('src/app/checkout/page.tsx', {
    'next/link': 'a', 'next/navigation': { useSearchParams: () => new URLSearchParams(params) },
    '@/components/loading-states': { SectionSkeleton: () => null }, '@/components/header': { Header: () => null },
    '@/components/creator-checkout': { CreatorCheckout: CheckoutMock },
    '@/context/cart-context': { useCart: () => ({ hydrated: true, cartItems: ['a','b'].map(id => ({ id: `seller:${id}`, price: 10, quantity: 1, showPrice: true })) }) },
  });
  let tree;
  act(() => { tree = create(React.createElement(Page)); });
  assert.equal(tree.root.findByType(CheckoutMock).props.onlyProductId, 'a');
  params = 'product=b';
  act(() => tree.update(React.createElement(Page)));
  assert.equal(tree.root.findByType(CheckoutMock).props.onlyProductId, 'b');
  act(() => tree.unmount());
});

test('install icons have declared dimensions and opaque backgrounds', async () => {
  const sharp = require('sharp');
  const manifest = JSON.parse(fs.readFileSync('public/manifest.json'));
  for (const icon of manifest.icons) {
    const meta = await sharp(`public${icon.src}`).metadata();
    assert.equal(`${meta.width}x${meta.height}`, icon.sizes);
    // Alpha can be present in the file, but every pixel must be opaque.
    const { data, info } = await sharp(`public${icon.src}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i=3; i<data.length; i+=info.channels) assert.equal(data[i],255);
  }
  assert.equal(manifest.icons.filter(i => i.purpose === 'maskable').length, 1);
});


test('seller product card cycles two separately supplied image URLs and opens a detail page', () => {
  const { SellerProductCard } = load('src/components/seller-product-card.tsx', {
    'next/link': 'a',
    '@/components/product-image': { ProductImage: props => React.createElement('img', props) },
    '@/hooks/use-product-gallery': { useProductGallery: length => {
      const [index, setIndex] = React.useState(0);
      return { index, direction: 'next', move: delta => setIndex(n => (n + delta + length) % length),
        select: setIndex, onTouchStart() {}, onTouchEnd() {}, onClickCapture() {} };
    } },
  });
  const product = {
    id: 'cake-1', sellerId: 'seller-a', name: 'Red Velvet Cake',
    category: 'Cake', description: 'Hand-baked', imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    price: 1450, availability: 'made-to-order', showPrice: true, minimumOrderQuantity: 1,
  };
  let tree;
  act(() => { tree = create(React.createElement(SellerProductCard, { product, addToBag: () => {}, buyNow: () => {} })); });
  assert.equal(tree.root.findAllByType('img')[0].props.src, product.imageUrls[0]);
  assert.equal(tree.root.findByType('a').props.href, '/product/seller:cake-1');
  const next = tree.root.findAllByType('button').find(b => b.props['aria-label'] === 'Next photo of Red Velvet Cake');
  assert.ok(next, 'multi-photo card exposes a next-photo button');
  act(() => next.props.onClick({ preventDefault() {}, stopPropagation() {} }));
  assert.equal(tree.root.findAllByType('img')[0].props.src, product.imageUrls[1]);
  act(() => tree.unmount());
});

test('Firestore model contains guarded product options and out-for-delivery transition', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /'weightValue'.*'weightUnit'.*'customizationOptions'/);
  assert.match(rules, /'out-for-delivery'/);
  assert.match(rules, /minimumOrderQuantity/);
  const indexes = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8')).indexes;
  assert.ok(indexes.some(i => i.collectionGroup === 'seller_orders' &&
    i.fields.map(f => [f.fieldPath, f.order]).join('|') ===
    [['sellerId','ASCENDING'],['createdAt','DESCENDING']].join('|')));
});
