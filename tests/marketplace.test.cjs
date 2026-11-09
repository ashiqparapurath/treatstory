const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

const sharedModules = new Map();
const accountMailMock={requestAccountMail:async()=>({ok:true}),requestSellerMail:async()=>{}};
function sharedModule(id) {
  if (!sharedModules.has(id)) sharedModules.set(id, load(`src/lib/${id.slice("@/lib/".length)}.ts`));
  return sharedModules.get(id);
}
function load(file, mocks = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : id==='@/lib/account-mail'?accountMailMock : ['@/lib/user-notices', '@/lib/order-feedback','@/lib/server/mail'].includes(id) ? sharedModule(id) : id === 'lucide-react' ? new Proxy({}, { get: () => () => null }) : require(id), console,
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
    '@/hooks/use-scroll-to-top': { useScrollToTop() {} },
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
    '@/hooks/use-scroll-to-top': { useScrollToTop() {} },
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

test('checkout reuses the saved PIN and accepts address changes from a popup', async () => {
  const input = props => React.createElement('input', props);
  let notice;
  let sent;
  let requiresAdvance = false;
  let directLine = null, directClears = 0;
  const cartRemovals = [];
  const AddressDialog = props => props.open ? React.createElement('div', {role:'dialog'}, React.createElement('button', {onClick: () => {props.onSave({...props.value,pincode:'680001'});props.onOpenChange(false);}}, 'Use this address')) : null;
  const { CreatorCheckout } = load('src/components/creator-checkout.tsx', {
    '@/components/checkout-address-dialog': { CheckoutAddressDialog: AddressDialog },
    '@/components/loading-states': { SectionSkeleton: () => null },
    '@/components/default-delivery-address': { addressText: a => `${a.line1}, ${a.pincode}` },
    'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ data: () => ({name:'Cake',advancePaymentRequired:requiresAdvance}) }) },
    '@/firebase': { useAccountData: () => ({ address: saved }), useFirestore: () => db, useUser: () => ({user, isUserLoading:false}) },
    '@/context/cart-context': { useCart: () => ({ cartItems: items, directItem: directLine, clearDirectCheckout() { directClears++; directLine = null; }, removeFromCart(key) {cartRemovals.push(key);}, updateLinePrice() {} }) },
    '@/hooks/use-toast': { useToast: () => ({ toast: v => { notice = v; } }) },
    '@/components/ui/button': { Button: props => React.createElement('button',props) },
    '@/components/ui/input': { Input: input }, '@/components/ui/textarea': { Textarea: props => React.createElement('textarea',props) }, 'next/link':'a',
  }, { sessionStorage: {getItem: () => '00000000-0000-4000-8000-000000000000', removeItem() {}}, fetch: async (_url, options) => { sent = JSON.parse(options.body); return {ok:true,json:async () => ({orderIds:['order-1']})}; } });
  const saved = {recipient:'Buyer',phone:'9876543210',line1:'House 123 Main Street',pincode:'673001'};
  const db = {}; let user = { getIdToken: async () => 'test-token' };
  const items = [{id:'seller:cake',lineId:'cake',name:'Cake',price:100,quantity:1}];
  let tree;
  await act(async () => { tree = create(React.createElement(CreatorCheckout)); });
  assert.equal(tree.root.findAllByType('textarea').filter(n => n.props.autoComplete === 'street-address').length, 0);
  const change = tree.root.findAllByType('button').find(n => n.props.children === 'Change address');
  act(() => change.props.onClick());
  assert.equal(tree.root.findByProps({role:'dialog'}).props.role, 'dialog');
  act(() => tree.root.findAllByType('button').find(n => n.props.children === 'Use this address').props.onClick());
  assert.equal(tree.root.findAllByProps({role:'dialog'}).length, 0);
  assert.equal(tree.root.findAllByType('button').find(n => n.props.type === 'submit').props.disabled, true);
  act(() => tree.root.findAllByType('input').find(n => n.props.type === 'radio' && n.props.value === 'cod').props.onChange());
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  // A valid PIN passes local validation and reaches checkout, rather than the PIN error.
  assert.equal(sent.pincode, '680001');
  assert.equal(sent.deliveryAddress, 'House 123 Main Street, 673001');
  assert.equal(notice.title, 'Order request sent');
  act(() => tree.unmount());
  requiresAdvance = true;
  sent = undefined;
  await act(async () => { tree = create(React.createElement(CreatorCheckout)); });
  const place = tree.root.findAllByType('button').find(n => n.props.type === 'submit');
  assert.equal(place.props.disabled, true, 'advance must be acknowledged before ordering');
  assert.equal(tree.root.findAllByType('input').filter(n => n.props.type === 'checkbox').length, 0, 'advance notice stays hidden until COD is selected');
  act(() => tree.root.findAllByType('input').find(n => n.props.type === 'radio' && n.props.value === 'cod').props.onChange());
  const acknowledgement = tree.root.findAllByType('input').find(n => n.props.type === 'checkbox');
  act(() => acknowledgement.props.onChange({target:{checked:true}}));
  assert.equal(tree.root.findAllByType('button').find(n => n.props.type === 'submit').props.disabled, false);
  await act(async () => { await tree.root.findByType('form').props.onSubmit({preventDefault(){}}); });
  assert.equal(sent.advancePaymentAcknowledged, true);

  act(() => tree.unmount());
  directLine = {...items[0], id:'seller:direct-cake', lineId:'direct-line'};
  requiresAdvance = false;
  user = null;
  await act(async () => { tree = create(React.createElement(CreatorCheckout, {direct:true, onlyProductId:'direct-cake'})); });
  const login = tree.root.findAllByType('a').find(a=>a.props.href.startsWith('/login?next='));
  const returnTo = new URL(login.props.href, 'https://example.test').searchParams.get('next');
  assert.match(returnTo, /buy=direct/);assert.match(returnTo, /product=direct-cake/);
  act(()=>tree.unmount());
  user = {getIdToken:async()=> 'test-token'};
  const removedBefore = cartRemovals.length;
  await act(async () => { tree = create(React.createElement(CreatorCheckout, {direct:true, onlyProductId:'direct-cake'})); });
  act(()=>tree.root.findAllByType('input').find(n=>n.props.type==='radio').props.onChange());
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(sent.lines[0].productId,'direct-cake');
  assert.equal(directClears,1);assert.equal(cartRemovals.length,removedBefore,'direct confirmation must not remove an existing cart line');
  assert.ok(JSON.stringify(tree.toJSON()).includes('Thank you for ordering!'));
  act(()=>tree.unmount());

});

test('missing secure-service configuration returns a distinct setup error without leaking provider details', async () => {
  const { getServerFirebase, safeResponse } = load('src/lib/server/firebase-admin.ts', {
    'firebase-admin/app': {}, 'firebase-admin/auth': {}, 'firebase-admin/firestore': {},
  }, { process: {env:{}}, Response, console: {error() {}} });
  let error;
  try { getServerFirebase(); } catch (e) { error = e; }
  const response = safeResponse(error);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.details.code, 'SERVICE_NOT_CONFIGURED');
  assert.doesNotMatch(body.error, /Firebase|Cloudinary|private.key|service.account/i);
});

test('quote creation snapshots authoritative seller and product names with the reference photo', async () => {
  let created;
  const now = Date.now();
  const docs = {
    'sellers/seller-12345': {status:'active',isOpen:true,businessName:'Little Bakery',accessEndsAt:{toMillis:()=>now+86400000}},
    'marketplace_products/cake-1': {sellerId:'seller-12345',status:'published',name:'Chocolate Cake'},
  };
  const db = { collection: name => ({doc: id => ({path:`${name}/${id || 'new-id'}`,id:id || 'new-id',collection: child=>({doc:()=>({path:`${name}/${id}/${child}/alert`})})})}),
    runTransaction: async fn => fn({get:async ref=>({exists:!!docs[ref.path],data:()=>docs[ref.path]}),create:(ref,data)=>{if(ref.path==='custom_quotes/new-id')created=data;},set(){}}) };
  const { POST } = load('src/app/api/quotes/route.ts', {
    'next/server':{after(){}},
    'firebase-admin/firestore': {Timestamp:{now:()=>({toMillis:()=>now}),fromMillis:v=>v}},
    '@/lib/server/firebase-admin': {verifiedUser:async()=>({uid:'buyer',db}),ApiError:class extends Error{},safeResponse:e=>{throw e;}},
  }, {Response});
  const response = await POST({headers:new Headers(),json:async()=>({action:'create',sellerId:'seller-12345',productId:'cake-1',occasion:'Birthday',description:'Chocolate cake with flowers',budget:1000,requestedDate:new Date(now+86400000).toISOString().slice(0,10),referenceUrl:'https://res.cloudinary.com/test/image/upload/example.jpg'})});
  assert.equal(response.status,200);
  assert.equal(created.sellerName,'Little Bakery');
  assert.equal(created.productName,'Chocolate Cake');
  assert.equal(created.referenceUrl,'https://res.cloudinary.com/test/image/upload/example.jpg');
});

test('reference photo uploads authenticate buyers, keep file checks and enforce a daily quota', async () => {
  let count = 0, upstreamCalls = 0, authenticated = true;
  const {POST} = load('src/app/api/cloudinary/upload/route.ts', {
    'firebase-admin/app': {getApps:()=>[{name:'treatstory-image-upload'}]},
    'firebase-admin/auth': {getAuth:()=>({verifyIdToken:async()=>{if(!authenticated)throw Error('invalid');return {uid:'buyer'};}})},
    'next/server': {NextResponse:{json:(data,options)=>Response.json(data,options)}},
    '@/lib/server/firebase-admin': {getServerFirebase:()=>({db:{collection:()=>({doc:()=>({})}),runTransaction:async fn=>fn({get:async()=>({data:()=>({count})}),set:(_ref,data)=>{count=data.count;}})}}),ApiError:class extends Error {constructor(status,message){super(message);this.status=status;}},safeResponse:error=>Response.json({error:error.message},{status:error.status})},
  }, {process:{env:{NEXT_PUBLIC_FIREBASE_PROJECT_ID:'test',CLOUDINARY_CLOUD_NAME:'test',CLOUDINARY_API_KEY:'test',CLOUDINARY_API_SECRET:'test'}},Blob,FormData,Buffer,Response,
    fetch:async(_url,options)=>{upstreamCalls++;assert.equal(options.body.get('folder'),'treatstory/references/buyer');return {ok:true,json:async()=>({secure_url:'https://res.cloudinary.com/test/image/upload/photo.png',public_id:'photo'})};}});
  const png = new Blob([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],{type:'image/png'});
  const request = file => ({headers:new Headers({authorization:'Bearer test'}),formData:async()=>new Map([['kind','reference'],['file',file]])});
  let response = await POST(request(png));
  assert.equal(response.status,200);assert.equal(count,1);assert.equal(upstreamCalls,1);
  count=10;
  response=await POST(request(png));
  assert.equal(response.status,429);assert.equal(upstreamCalls,1);
  authenticated=false;
  response=await POST(request(png));
  assert.equal(response.status,401);assert.equal(upstreamCalls,1);
  authenticated=true;
  response=await POST(request(new Blob(['not an image'],{type:'image/png'})));
  assert.equal(response.status,400);assert.equal(upstreamCalls,1);
});

test('server credentials normalize escaped key newlines and reject invalid project configuration', () => {
  let usedKey;
  const env={NEXT_PUBLIC_FIREBASE_PROJECT_ID:'test-project',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'test-project',client_email:'server@example.test',private_key:'line1\\nline2'})};
  const server=load('src/lib/server/firebase-admin.ts',{
    'firebase-admin/app':{getApps:()=>[],cert:value=>{usedKey=value;return value;},initializeApp:()=>({})},
    'firebase-admin/auth':{getAuth:()=>({})},'firebase-admin/firestore':{getFirestore:()=>({})},
  },{process:{env},Response,console:{error(){}}});
  server.getServerFirebase();
  assert.equal(usedKey.privateKey,'line1\nline2');
  env.FIREBASE_SERVICE_ACCOUNT_JSON='null';
  assert.throws(()=>server.getServerFirebase(),e=>e.status===503&&e.details.code==='SERVICE_NOT_CONFIGURED');
});

test('direct purchases are session drafts and never add to or increase the saved cart', () => {
  function storage() { const values = new Map(); return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; }
  const localStorage=storage(),sessionStorage=storage();
  const {CartProvider,useCart}=load('src/context/cart-context.tsx',{}, {localStorage,sessionStorage});
  let current;function Probe(){current=useCart();return null;}
  let tree;act(()=>{tree=create(React.createElement(CartProvider,null,React.createElement(Probe)));});
  const existing={id:'seller:existing',name:'Existing item',price:20,showPrice:true,description:'',category:'Cake',categoryId:'Cake',imageUrls:[]};
  act(()=>current.addToCart(existing,3));
  act(()=>current.startDirectCheckout(existing,1));
  assert.equal(current.cartItems[0].quantity,3,'direct purchase of an existing cart line must not increase it');
  const direct={...existing,id:'seller:direct',name:'Birthday cake',price:450,selectedWeight:{value:500,unit:'g'},customizationNote:'Happy birthday',minimumOrderQuantity:2};
  sessionStorage.setItem('treatstory-pending-checkout','keep-cart-reference');
  act(()=>current.startDirectCheckout(direct,2));
  act(()=>current.startDirectCheckout(direct,2));
  assert.equal(current.cartCount,3);assert.equal(current.cartItems.length,1);assert.equal(current.cartItems[0].id,'seller:existing');
  assert.equal(current.directItem.quantity,2);assert.equal(current.directItem.selectedWeight.value,500);assert.equal(current.directItem.customizationNote,'Happy birthday');
  assert.equal(JSON.parse(localStorage.getItem('treatstory-cart-v2')).some(i=>i.id==='seller:direct'),false);
  assert.equal(sessionStorage.getItem('treatstory-pending-checkout'),'keep-cart-reference');
  act(()=>current.updateDirectPrice(500));assert.equal(current.directItem.price,500);assert.equal(current.cartItems[0].price,20);
  act(()=>tree.unmount());
  act(()=>{tree=create(React.createElement(CartProvider,null,React.createElement(Probe)));});
  assert.equal(current.directItem.price,500);assert.equal(current.cartCount,3);
  act(()=>current.clearDirectCheckout());assert.equal(current.directItem,null);assert.equal(current.cartCount,3);assert.equal(sessionStorage.getItem('treatstory-direct-checkout-v1'),null);
  act(()=>tree.unmount());
});

test('purchase destinations reset scroll instantly only when the destination changes', () => {
  const calls=[];
  const {useScrollToTop}=load('src/hooks/use-scroll-to-top.ts',{}, {window:{scrollTo:options=>calls.push(options)}});
  function Probe({destination}){useScrollToTop(destination);return null;}
  let tree;act(()=>{tree=create(React.createElement(Probe,{destination:'seller:cake'}));});
  act(()=>tree.update(React.createElement(Probe,{destination:'seller:cake'})));
  act(()=>tree.update(React.createElement(Probe,{destination:'buy=direct&product=cake'})));
  assert.equal(calls.length,2);assert.equal(calls[1].top,0);assert.equal(calls[1].behavior,'instant');act(()=>tree.unmount());
});

test('direct checkout uses its draft, never falls back to cart, and keeps confirmation after clearing the draft', () => {
  let params='buy=direct&product=direct';
  let draft={id:'seller:direct',lineId:'direct',name:'Direct cake',price:450,quantity:1,showPrice:true};
  const cart=[{id:'seller:cart',lineId:'cart',name:'Cart cookie',price:50,quantity:2,showPrice:true}];
  function CheckoutMock(){return React.createElement('div',null,'Confirmed direct order');}
  const {default:Page}=load('src/app/checkout/page.tsx',{
    'next/link':'a','next/navigation':{useSearchParams:()=>new URLSearchParams(params)},
    '@/hooks/use-scroll-to-top':{useScrollToTop(){}},'@/components/header':{Header:()=>null},
    '@/components/loading-states':{SectionSkeleton:()=>null},'@/components/creator-checkout':{CreatorCheckout:CheckoutMock},
    '@/context/cart-context':{useCart:()=>({cartItems:cart,directItem:draft,hydrated:true})},
  });
  let tree;act(()=>{tree=create(React.createElement(Page));});
  assert.equal(tree.root.findByType(CheckoutMock).props.direct,true);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Direct cake'));assert.equal(JSON.stringify(tree.toJSON()).includes('Cart cookie'),false);
  params='buy=direct&product=cart';act(()=>tree.update(React.createElement(Page)));
  assert.ok(JSON.stringify(tree.toJSON()).includes('Your checkout is empty'),'stale direct link cannot silently order cart contents');
  params='buy=direct&product=direct';act(()=>tree.update(React.createElement(Page)));
  act(()=>{tree.root.findByType(CheckoutMock).props.onComplete();draft=null;tree.update(React.createElement(Page));});
  assert.equal(tree.root.findAllByType(CheckoutMock).length,1);
  assert.equal(JSON.stringify(tree.toJSON()).includes('Your checkout is empty'),false);
  assert.equal(cart.length,1);act(()=>tree.unmount());
});

test('action errors give accurate credential, connection, access and upload recovery without leaking SDK details', () => {
  const {getErrorNotice,ActionError,validateEmail}=sharedModule('@/lib/user-notices');
  for(const code of ['auth/invalid-credential','auth/wrong-password','auth/user-not-found']) {
    const notice=getErrorNotice({code,message:'Firebase secret diagnostic'},'sign-in');
    assert.equal(notice.field,'credentials');assert.match(notice.description,/both details/);
  }
  assert.equal(validateEmail('bad').field,'email');assert.equal(validateEmail(' name@example.com '),null);
  assert.equal(getErrorNotice({code:'auth/weak-password'},'register').field,'password');
  assert.match(getErrorNotice({code:'auth/network-request-failed'},'sign-in').title,/Connection/);
  assert.match(getErrorNotice({code:'auth/too-many-requests'},'sign-in').description,/Wait/);
  assert.match(getErrorNotice({code:'permission-denied'},'seller-access').title,/Administrator/);
  assert.match(getErrorNotice(new ActionError('Raw Firebase configuration https://private.example',503),'quote').title,/Temporarily/);
  assert.match(getErrorNotice(new ActionError('This seller is no longer accepting requests.',409),'quote').description,/no longer accepting/);
  assert.doesNotMatch(JSON.stringify(getErrorNotice(new Error('Firebase API_KEY private trace'),'save-product')),/Firebase|API_KEY|trace/);
  assert.match(getErrorNotice(new ActionError('Choose JPG or PNG.',415),'upload-photo').title,/file type/);
  assert.match(getErrorNotice(new ActionError('Reduce this photo.',413),'upload-photo').title,/too large/);
  assert.match(getErrorNotice({code:'UPLOAD_NOT_CONFIGURED'},'upload-photo').title,/not ready/);
});

test('order feedback distinguishes requests, completion and seller-recorded payment', () => {
  const {orderFeedback}=sharedModule('@/lib/order-feedback');
  assert.match(orderFeedback('request-cancellation','Cake').description,/not cancelled yet/);
  assert.match(orderFeedback('placed','Cake').description,/No online payment/);
  assert.equal(orderFeedback('ready','Cake','pickup').title,'Ready for pickup');
  assert.equal(orderFeedback('completed','Cake','pickup').title,'Order marked collected');
  assert.match(orderFeedback('cod-collected','Cake').description,/marked as collected by the seller/);
});

test('seller access confirmation opens without a write, awaits acknowledgment and prevents duplicate writes', async () => {
  let writes=0, resolveWrite, rejectWrite;
  const notices=[];
  class Timestamp {constructor(date){this.date=date;}toDate(){return this.date;}static fromDate(date){return new Timestamp(date);}static fromMillis(ms){return new Timestamp(new Date(ms));}}
  const seller={id:'seller-a',businessName:'As Production',accessType:'trial',status:'active',accessEndsAt:Timestamp.fromDate(new Date('2026-11-15T23:59:59')),contactEmail:'seller@example.com'};
  const db={}; const Dialog=()=>null;
  const {SellerManagement}=load('src/components/admin/seller-management.tsx',{
    '@/firebase':{useUser:()=>({user:{uid:'admin'}}),useFirestore:()=>db,useMemoFirebase:fn=>fn(),useCollection:()=>({data:[seller],isLoading:false})},
    'firebase/firestore':{Timestamp,collection:()=>({}),doc:()=>({}),serverTimestamp:()=>0,updateDoc:()=>{writes++;return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});}},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/components/confirm-action-dialog':{ConfirmActionDialog:Dialog},'@/components/loading-states':{LoadError:()=>null},'@/hooks/use-toast':{useToast:()=>({toast:notice=>notices.push(notice)})},
  },{window:{confirm:()=>{throw Error('Native dialog must not run');}}});
  let tree;act(()=>{tree=create(React.createElement(SellerManagement));});
  const button=label=>tree.root.findAllByType('button').find(n=>n.children.includes(label));
  act(()=>button('Manage access').props.onClick());
  act(()=>button('Save expiry').props.onClick());
  let dialog=tree.root.findByType(Dialog);
  assert.equal(dialog.props.open,true);assert.equal(writes,0);
  assert.match(JSON.stringify(dialog.props.children,(key,value)=>key==="_owner"?undefined:value),/15 November 2026/);
  act(()=>dialog.props.onOpenChange(false));assert.equal(writes,0);
  act(()=>button('Save expiry').props.onClick());
  let first;
  act(()=>{first=tree.root.findByType(Dialog).props.onConfirm();});
  assert.equal(writes,1);assert.equal(tree.root.findByType(Dialog).props.busy,true);assert.equal(notices.length,0);
  await act(async()=>{await tree.root.findByType(Dialog).props.onConfirm();});assert.equal(writes,1);
  await act(async()=>{rejectWrite({code:'permission-denied'});await first;});
  assert.equal(tree.root.findByType(Dialog).props.open,true);assert.match(tree.root.findByType(Dialog).props.error,/correct account/);
  act(()=>{first=tree.root.findByType(Dialog).props.onConfirm();});
  await act(async()=>{resolveWrite();await first;});
  assert.equal(writes,2);assert.equal(tree.root.findByType(Dialog).props.open,false);assert.equal(notices.at(-1).title,'Seller access saved');
  act(()=>tree.unmount());
});

test('sign-in validates fields before requesting authentication and preserves password whitespace', async () => {
  let attempts=0,args,code='auth/invalid-credential';const notices=[];
  const {default:Login}=load('src/app/login/page.tsx',{
    'next/navigation':{useRouter:()=>({replace(){}})},'next/link':'a',
    '@/firebase':{useAuth:()=>({}),useUser:()=>({user:null,isUserLoading:false})},
    'firebase/auth':{signInWithEmailAndPassword:async(...values)=>{attempts++;args=values;throw {code,message:'Firebase private diagnostic'};},sendPasswordResetEmail:async()=>{throw {code:'auth/user-not-found'};}},
    '@/components/ui/toast':{ToastAction:'button'},'@/components/ui/button':{Button:'button'},
    '@/components/ui/input':{Input:React.forwardRef((props,ref)=>React.createElement('input',{...props,ref}))},'@/components/ui/label':{Label:'label'},
    '@/hooks/use-toast':{useToast:()=>({toast:n=>notices.push(n)})},
  });
  let tree;act(()=>{tree=create(React.createElement(Login));});
  const input=id=>tree.root.findByProps({id});
  const submit=()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}});
  act(()=>input('email').props.onChange({target:{value:'bad'}}));await act(submit);assert.equal(attempts,0);assert.equal(notices.at(-1).title,'Check your email address');
  act(()=>input('email').props.onChange({target:{value:' buyer@example.com '}}));await act(submit);assert.equal(attempts,0);assert.equal(notices.at(-1).title,'Enter your password');
  act(()=>input('password').props.onChange({target:{value:' password '}}));await act(submit);assert.equal(attempts,1);assert.equal(args[1],'buyer@example.com');assert.equal(args[2],' password ');assert.equal(notices.at(-1).title,'Email or password does not match');
  code='auth/too-many-requests';await act(submit);assert.match(notices.at(-1).title,/pause/);
  act(()=>tree.root.findAllByType('button').find(n=>n.children.includes('Forgot password?')).props.onClick());
  await act(submit);assert.equal(notices.at(-1).title,'Check your inbox');assert.match(notices.at(-1).description,/If an account uses/);
  act(()=>tree.unmount());
});

test('category save announces success only after the actual write and keeps failed edits open', async () => {
  let resolveWrite,rejectWrite,finished=0;const notices=[];
  const write=()=>new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});
  const wrap=({children})=>React.createElement('div',null,children);
  const {CategoryForm}=load('src/components/admin/category-form.tsx',{
    'react-hook-form':{useForm:()=>({handleSubmit:fn=>()=>fn({name:'Bakes',description:'Fresh local bakes'}),formState:{isValid:true}})},
    '@hookform/resolvers/zod':{zodResolver(){}},
    '@/firebase':{useFirestore:()=>({}),useUser:()=>({user:{uid:'admin'}})},
    'firebase/firestore':{collection:()=>({}),doc:()=>({}),serverTimestamp:()=>0,addDoc:write,updateDoc:write},
    '@/components/ui/form':{Form:wrap,FormControl:wrap,FormField:()=>null,FormItem:wrap,FormLabel:wrap,FormMessage:()=>null},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'../ui/textarea':{Textarea:'textarea'},
    '@/hooks/use-toast':{useToast:()=>({toast:n=>notices.push(n)})},
  },{console:{error(){}}});
  let tree,pending;act(()=>{tree=create(React.createElement(CategoryForm,{onFinished:()=>finished++}));});
  act(()=>{pending=tree.root.findByType('form').props.onSubmit();});assert.equal(notices.length,0);assert.equal(finished,0);assert.equal(tree.root.findByType('button').props.disabled,true);
  await act(async()=>{rejectWrite({code:'permission-denied'});await pending;});assert.equal(notices.at(-1).variant,'destructive');assert.equal(finished,0);
  act(()=>{pending=tree.root.findByType('form').props.onSubmit();});await act(async()=>{resolveWrite();await pending;});assert.equal(notices.at(-1).title,'Category Added');assert.equal(finished,1);act(()=>tree.unmount());
});
