const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(path, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : require(name),
    URL, encodeURIComponent,
  }, { filename: path });
  return module.exports;
}

const roleNav = loadTs('src/lib/mobile-navigation.ts');
const fakeIcons = new Proxy({}, { get: (_, name) => () => String(name) });
const menu = loadTs('src/lib/more-navigation.ts', { 'lucide-react': fakeIcons });
const attention = { orders: true, applications: true };
const routes = group => Array.from(group, item => item.href);

test('mobile Profile sends admin seller and buyer to their existing dashboards', () => {
  const base = { authenticated: true, authLoading: false, roleLoading: false, roleError: false };
  const scenarios = [
    { role: 'admin', href: '/admin' },
    { role: 'seller', href: '/seller/dashboard' },
    { role: 'customer', href: '/account' },
  ];
  for (const { role, href } of scenarios) {
    assert.equal(roleNav.mobileProfileHref({ ...base, role }), href, role);
    assert.equal(roleNav.isMobileProfilePath(href, role), true, role + ' active state');
  }
  assert.equal(roleNav.mobileProfileHref({ ...base, role: 'admin', roleLoading: true }), '/dashboard');
  assert.equal(roleNav.mobileProfileHref({ ...base, role: 'customer', roleError: true }), '/dashboard');
  assert.equal(roleNav.mobileProfileHref({ ...base, role: null }), '/dashboard');
  assert.equal(roleNav.mobileProfileHref({ ...base, role: null, authenticated: false }), '/login');
  assert.equal(roleNav.mobileProfileHref({ ...base, role: null, authenticated: false, authLoading: true }), '/dashboard');
  assert.equal(roleNav.isMobileProfilePath('/admin', 'customer'), false);
  assert.equal(roleNav.isMobileProfilePath('/account', 'seller'), false);
  assert.equal(roleNav.mobileNavIsActive('/product/seller:abc', 'shop'), true);
  assert.equal(roleNav.mobileNavIsActive('/products', 'shop'), true);
  assert.equal(roleNav.mobileNavIsActive('/more', 'shop'), false);
});

test('More menu offers only role-relevant, existing routes and actionable dots', () => {
  const admin = menu.morePageSections('admin', true, attention);
  const seller = menu.morePageSections('seller', true, attention);
  const buyer = menu.morePageSections('customer', true, attention);
  const guest = menu.morePageSections(null, false, attention);
  const resolving = menu.morePageSections(null, true, attention);

  assert.ok(routes(admin.marketplace).includes('/admin?tab=applications'));
  assert.ok(routes(admin.marketplace).includes('/admin?tab=orders'));
  assert.ok(admin.marketplace.some(item => item.href === '/admin?tab=applications' && item.attention));
  assert.ok(!routes(admin.marketplace).includes('/seller/dashboard?section=store'));
  assert.ok(!routes(admin.marketplace).includes('/become-a-seller'));
  assert.ok(routes(seller.marketplace).includes('/seller/dashboard?section=orders'));
  assert.ok(routes(seller.marketplace).includes('/seller/dashboard?section=store'));
  assert.ok(seller.marketplace.some(item => item.href === '/seller/dashboard?section=orders' && item.attention));
  assert.ok(!routes(seller.marketplace).includes('/admin?tab=applications'));
  assert.ok(!routes(seller.marketplace).includes('/become-a-seller'));
  assert.ok(routes(buyer.marketplace).includes('/become-a-seller'));
  assert.ok(routes(buyer.marketplace).includes('/orders'));
  assert.ok(!routes(buyer.marketplace).includes('/admin'));
  assert.ok(!routes(buyer.marketplace).includes('/seller/dashboard'));
  assert.ok(routes(guest.marketplace).includes('/become-a-seller'));
  assert.equal(guest.account.length, 0);
  assert.ok(!routes(guest.marketplace).includes('/orders'));
  assert.ok(!routes(resolving.marketplace).includes('/become-a-seller'), 'Unknown logged-in role is not guessed as buyer');
  assert.ok(!routes(resolving.marketplace).includes('/admin'));
  for(const variant of [admin, seller, buyer, guest]) {
    const all = [...variant.account, ...variant.marketplace, ...variant.information];
    const urls = all.map(x => x.href);
    assert.equal(urls.length, new Set(urls).size, 'No repeated More page destinations');
    assert.ok(urls.every(x => x.startsWith('/') && !x.startsWith('//')));
    assert.ok(!urls.includes('/language'), 'Do not link to unimplemented language preferences');
  }
});

test('mobile bottom nav has five balanced destinations, role shortcut, More and dot-only attention', () => {
  const header = fs.readFileSync('src/components/header.tsx', 'utf8');
  const more = fs.readFileSync('src/app/more/page.tsx', 'utf8');
  const hook = fs.readFileSync('src/hooks/use-mobile-attention.ts', 'utf8');
  const firebase = fs.readFileSync('src/firebase/provider.tsx', 'utf8');
  assert.match(header, /grid-cols-5/);
  assert.match(header, /item.label === 'Cart' && cartCount/);
  assert.doesNotMatch(header, /item.label === 'Cart' && cartCount > 0 && <span/);
  assert.match(header, /label: 'More', icon: Menu, active: pathname === '\/more'/);
  assert.match(header, /label: 'Profile', icon: UserRound, active: isMobileProfilePath/);
  assert.match(header, /href: profileHref/);
  assert.doesNotMatch(header, /label:'Sell'|label: 'Sell'/);
  assert.match(header, /className="absolute -right-1 -top-1 h-2\.5 w-2\.5 rounded-full/);
  assert.match(header, /\(item\.label === 'More' \|\| item\.label === 'Profile'\) && actionPending/);
  assert.doesNotMatch(header, /\{attention\.orders \+ attention\.applications\}/);
  assert.match(header, /md:hidden/);
  assert.match(header, /className="hidden items-center justify-end/);
  assert.match(more, /morePageSections\(roleReady && user \? role : null, !!user, attention\)/);
  assert.match(more, /aria-label="Account actions"/);
  assert.match(hook, /const unsubscribe: Array<\(\) => void> = \[\]/);
  assert.match(hook, /where\('sellerId', '==', uid\).*where\('status', '==', 'pending'\)/);
  assert.match(hook, /where\('status', '==', 'pending'\), limit\(1\)/);
  assert.match(hook, /role !== 'admin' && role !== 'seller'/);
  assert.match(hook, /window\.matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(firebase, /if \(admin === true\) \{/);
  assert.match(firebase, /role: 'admin'/);
});

test('Next.js More route exports only a default page component', () => {
  const page = fs.readFileSync('src/app/more/page.tsx', 'utf8');
  assert.match(page, /export default function MorePage/);
  assert.doesNotMatch(page, /export (?:const|function|type|interface) /);
  assert.match(fs.readFileSync('src/lib/more-navigation.ts','utf8'), /export function morePageSections/);
});
