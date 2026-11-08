const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function load(file, mocks = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : id === 'lucide-react' ? new Proxy({}, { get: () => () => null }) : require(id), console,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; }, clearTimeout, URL, URLSearchParams, ...globals }, { filename: file });
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
    '@/components/favorite-toggle': { FavoriteToggle: () => null },
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

test('Firestore model guards variants and server transitions support out-for-delivery', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /'weightValue'.*'weightUnit'.*'customizationOptions'/);
  assert.match(fs.readFileSync('src/lib/server/order-actions.ts', 'utf8'), /'out-for-delivery'/);
  assert.match(rules, /match \/seller_orders\/\{orderId\}/);
  assert.match(rules, /allow create, update, delete: if false;/);
  assert.match(rules, /minimumOrderQuantity/);
  const indexes = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8')).indexes;
  assert.ok(indexes.some(i => i.collectionGroup === 'seller_orders' &&
    i.fields.map(f => [f.fieldPath, f.order]).join('|') ===
    [['sellerId','ASCENDING'],['createdAt','DESCENDING']].join('|')));
});


test('Firestore rules are a single complete ruleset with intact WhatsApp validation', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8').trimEnd();
  assert.ok(rules.endsWith('}\n}'), 'ruleset should end after closing service and database');
  assert.equal((rules.match(/service cloud\.firestore\s*\{/g) || []).length, 1);
  assert.equal((rules.match(/match \/marketplace_products\/\{productId\}/g) || []).length, 1);
  assert.equal((rules.match(/match \/seller_orders\/\{orderId\}/g) || []).length, 1);
  assert.match(rules, /whatsappNumber\.matches\('\^\[0-9\]\{8,15\}\$'\)/);
  assert.match(rules, /request\.resource\.data\.isOpen is bool/);
});


test('Cloudinary photo upload requires verified Firebase authentication and authorized role', () => {
  const handler = fs.readFileSync('src/app/api/cloudinary/upload/route.ts', 'utf8');
  assert.match(handler, /verifyIdToken\(idToken\)/);
  assert.match(handler, /canUpload\(projectId, uid, idToken, kind\)/);
  assert.match(handler, /roles_admin/);
  assert.match(handler, /fields\?\.status\?\.stringValue === 'active'/);
  assert.match(handler, /fileFormat\(bytes\)/);
  assert.match(handler, /file\.size > maxSize/);
  assert.match(handler, /process\.env\.CLOUDINARY_API_SECRET/);
  assert.match(handler, /'Basic '/);
  assert.doesNotMatch(handler, /upload_preset/);
  const client = fs.readFileSync('src/lib/cloudinary-upload.ts','utf8');
  assert.match(client, /await user\.getIdToken\(\)/);
  assert.match(client, /fetch\('\/api\/cloudinary\/upload'/);
  assert.doesNotMatch(client, /CLOUDINARY_API_SECRET/);
});

test('Admin and seller photo forms save only Cloudinary image URLs to Firestore', () => {
  const bannerForm = fs.readFileSync('src/components/admin/banner-form.tsx', 'utf8');
  const productForm = fs.readFileSync('src/components/admin/product-form.tsx', 'utf8');
  const sellerPage = fs.readFileSync('src/app/seller/dashboard/page.tsx', 'utf8');
  assert.match(bannerForm, /await uploadTreatStoryPhoto\(user, selectedFile, 'banner'\)/);
  assert.match(productForm, /await uploadTreatStoryPhoto\(user, file, 'product'\)/);
  assert.match(sellerPage, /await uploadTreatStoryPhoto\(user, file, 'product'\)/);
  for (const content of [bannerForm, productForm]) {
    assert.match(content, /await (addDoc|updateDoc)\(/);
    assert.doesNotMatch(content, /readAsDataURL|addDocumentNonBlocking|updateDocumentNonBlocking/);
  }
  assert.match(fs.readFileSync('src/components/seller-product-editor.tsx', 'utf8'), /multiple accept="image\/jpeg,image\/png,image\/webp"/);
  const nextConfig = fs.readFileSync('next.config.ts', 'utf8');
  assert.match(nextConfig, /res\.cloudinary\.com/);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert.ok(pkg.dependencies['firebase-admin']);
  assert.equal(pkg.dependencies['firebase-admin'], lock.packages[''].dependencies['firebase-admin']);
});



test('Next.js 15 uses compatible Cloudinary SDK for optimized images with legacy fallback', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  assert.equal(pkg.dependencies['next-cloudinary'], '6.19.3');
  assert.equal(lock.packages['node_modules/next-cloudinary'].version, '6.19.3');

  const image = fs.readFileSync('src/components/optimized-image.tsx', 'utf8');
  assert.match(image, /import \{ CldImage \} from 'next-cloudinary'/);
  assert.match(image, /NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/);
  assert.match(image, /https:\\\/\\\/res\\\.cloudinary/);
  assert.match(image, /<CldImage/);
  assert.match(image, /<Image/);
  const product = fs.readFileSync('src/components/product-image.tsx', 'utf8');
  assert.match(product, /OptimizedImage/);
  const home = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.match(home, /<OptimizedImage src=\{banner\.imageUrl\}/);
  const banners = fs.readFileSync('src/components/admin/banner-list.tsx', 'utf8');
  assert.match(banners, /<OptimizedImage src=\{banner\.imageUrl\}/);
});


test('checkout groups items atomically and rejects client bypasses', () => {
  const checkout = fs.readFileSync('src/lib/server/atomic-checkout.ts', 'utf8');
  const api = fs.readFileSync('src/app/api/checkout/route.ts', 'utf8');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(api, /verifiedUser\(request\)/);
  assert.match(api, /checkoutRequestSchema.safeParse\(body\)/);
  assert.match(checkout, /db.runTransaction\(async tx/);
  assert.match(checkout, /requestHash/);
  assert.match(checkout, /stockQuantity/);
  assert.match(checkout, /pendingPrices/);
  assert.match(checkout, /seller_bookings/);
  assert.match(checkout, /tx.create\(checkoutRef/);
  assert.match(checkout, /tx.create\(db.collection\('seller_orders'\)/);
  assert.match(rules, /match \/checkout_orders\/\{checkoutId\} \{\s*allow read, write: if false;/);
  assert.match(rules, /match \/seller_orders\/\{orderId\} \{[\s\S]*?allow create, update, delete: if false;/);
});

test('fulfillment and cancellation preserve stock and prevent repeated release', () => {
  const actions = fs.readFileSync('src/lib/server/order-actions.ts', 'utf8');
  const route = fs.readFileSync('src/app/api/orders/action/route.ts', 'utf8');
  assert.match(route, /verifiedUser\(request\)/);
  assert.match(actions, /db.runTransaction\(async/);
  assert.match(actions, /!order.stockReleasedAt/);
  assert.match(actions, /!order.bookingReleasedAt/);
  assert.match(actions, /request-cancellation/);
  assert.match(actions, /cod-collected/);
  assert.match(actions, /inventoryReleaseReview/);
  const ui = fs.readFileSync('src/components/order-management.tsx', 'utf8');
  assert.match(ui, /sendOrderAction\(user, order.id/);
  assert.doesNotMatch(ui, /updateDoc\(doc\(db,'seller_orders'/);
});


test('a single seller listing supports separately priced weight and unit variants', () => {
  const editor = fs.readFileSync('src/components/seller-product-editor.tsx', 'utf8');
  const save = fs.readFileSync('src/app/seller/dashboard/page.tsx', 'utf8');
  const detail = fs.readFileSync('src/app/product/[id]/page.tsx', 'utf8');
  const card = fs.readFileSync('src/components/seller-product-card.tsx', 'utf8');
  const checkout = fs.readFileSync('src/lib/server/atomic-checkout.ts', 'utf8');
  assert.match(editor, /Weight, size & variant pricing/);
  assert.match(editor, /Price for this size/);
  assert.match(editor, /Add another size & price/);
  assert.match(editor, /Price preview/);
  assert.match(editor, /required=\{!draft.weightOptions.length\}/);
  assert.match(save, /weights\.some\(w => w\.price === undefined\)/);
  assert.match(save, /weights\.map\(w => w\.price!/);
  assert.match(editor, /required type="number"/);
  assert.match(save, /String\(product\.price\)/);
  assert.match(save, /Duplicate sizes/);
  assert.match(save, /weightOptions: weights/);
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /w\.keys\(\)\.hasAll\(\['value','unit','price'\]\)/);
  assert.match(rules, /w\.price is number && w\.price >= 0/);
  assert.match(detail, /selectedPrice = selectedWeight\?\.price \?\?/);
  assert.match(detail, /price: selectedPrice/);
  assert.match(card, /lowestPrice/);
  assert.match(checkout, /const price = positiveNumber\(choice\?\.price, p\.price\)/);
  assert.match(checkout, /if \(price !== line.expectedPrice\)/);
});


test('custom quotes enforce active seller access and product ownership at the server', () => {
  const route = fs.readFileSync('src/app/api/quotes/route.ts', 'utf8');
  assert.match(route, /sellerSnap\.data\(\)\?\.accessEndsAt\?\.toMillis/);
  assert.match(route, /sellerSnap\.data\(\)\?\.isOpen/);
  assert.match(route, /productSnap\.data\(\)\?\.sellerId!==data\.sellerId/);
  assert.match(route, /productSnap\.data\(\)\?\.status!=='published'/);
  assert.match(route, /data\.action==='quote'\|\|data\.action==='accept'/);
  assert.match(route, /tx\.get\(db\.collection\('sellers'\)\.doc\(q\.sellerId\)\)/);
});

test('checkout reuses the saved PIN, accepts six digits and expands address editing', async () => {
  const input = props => React.createElement('input', props);
  let notice;
  let sent;
  let requiresAdvance = false;
  const { CreatorCheckout } = load('src/components/creator-checkout.tsx', {
    '@/components/loading-states': { SectionSkeleton: () => null },
    '@/components/default-delivery-address': { addressText: a => `${a.line1}, ${a.pincode}` },
    'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ data: () => ({name:'Cake',advancePaymentRequired:requiresAdvance}) }) },
    '@/firebase': { useAccountData: () => ({ address: saved }), useFirestore: () => db, useUser: () => ({user, isUserLoading:false}) },
    '@/context/cart-context': { useCart: () => ({ cartItems: items, removeFromCart() {}, updateLinePrice() {} }) },
    '@/hooks/use-toast': { useToast: () => ({ toast: v => { notice = v; } }) },
    '@/components/ui/button': { Button: props => React.createElement('button',props) },
    '@/components/ui/input': { Input: input }, '@/components/ui/textarea': { Textarea: props => React.createElement('textarea',props) }, 'next/link':'a',
  }, { sessionStorage: {getItem: () => '00000000-0000-4000-8000-000000000000', removeItem() {}}, fetch: async (_url, options) => { sent = JSON.parse(options.body); return {ok:true,json:async () => ({orderIds:['order-1']})}; } });
  const saved = {recipient:'Buyer',phone:'9876543210',line1:'House 123 Main Street',pincode:'673001'};
  const db = {}; const user = { getIdToken: async () => 'test-token' };
  const items = [{id:'seller:cake',lineId:'cake',name:'Cake',price:100,quantity:1}];
  let tree;
  await act(async () => { tree = create(React.createElement(CreatorCheckout)); });
  assert.equal(tree.root.findAllByType('textarea').filter(n => n.props.autoComplete === 'street-address').length, 0);
  const change = tree.root.findAllByType('button').find(n => n.props.children === 'Change address');
  act(() => change.props.onClick());
  assert.equal(tree.root.findByProps({autoComplete:'street-address'}).props.value, 'House 123 Main Street, 673001');
  const pin = tree.root.findAllByType('input').find(n => n.props.pattern === '[0-9]{6}');
  assert.equal(pin.props.value, '673001');
  act(() => pin.props.onChange({target:{value:'680 001'}}));
  assert.equal(tree.root.findAllByType('input').find(n => n.props.pattern === '[0-9]{6}').props.value, '680001');
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  // A valid PIN passes local validation and reaches checkout, rather than the PIN error.
  assert.equal(sent.pincode, '680001');
  assert.equal(sent.deliveryAddress, 'House 123 Main Street, 673001');
  assert.equal(notice.title, 'Order confirmed');
  act(() => tree.unmount());
  requiresAdvance = true;
  sent = undefined;
  await act(async () => { tree = create(React.createElement(CreatorCheckout)); });
  const place = tree.root.findAllByType('button').find(n => n.props.type === 'submit');
  assert.equal(place.props.disabled, true, 'advance must be acknowledged before ordering');
  const acknowledgement = tree.root.findAllByType('input').find(n => n.props.type === 'checkbox');
  act(() => acknowledgement.props.onChange({target:{checked:true}}));
  assert.equal(tree.root.findAllByType('button').find(n => n.props.type === 'submit').props.disabled, false);
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  assert.equal(sent.advancePaymentAcknowledged, true);

  act(() => tree.unmount());
});
