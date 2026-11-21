const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: id => id in mocks ? mocks[id] : require(id),
    console, URL, Request, Response, encodeURIComponent,
  }, { filename: path });
  return module.exports;
}

const slugs = load('src/lib/server/store-slug.ts');
function fixture(seed = {}) {
  const records = new Map(Object.entries(seed));
  const writes = [];
  const db = { doc: path => ({ path, id: path.slice(path.lastIndexOf('/') + 1) }) };
  const tx = {
    get: async ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
    create: (ref, data) => {
      assert.equal(records.has(ref.path), false, 'reservation may not overwrite another store');
      records.set(ref.path, {...data}); writes.push(['create', ref.path, data]);
    },
    update: (ref, data) => {
      assert.equal(records.has(ref.path), true);
      records.set(ref.path, {...records.get(ref.path), ...data}); writes.push(['update', ref.path, data]);
    },
  };
  return { db, tx, records, writes };
}

test('clean store slugs are readable, stable and collision-safe without exposing UIDs', async () => {
  const f = fixture();
  const first = await slugs.reserveFriendlyStoreSlug(f.tx, f.db, 'Rose & Bloom', 'firebase-user-1');
  assert.equal(first, 'rose-bloom');
  assert.equal(f.records.get('store_slugs/rose-bloom').sellerId, 'firebase-user-1');
  const second = await slugs.reserveFriendlyStoreSlug(f.tx, f.db, 'Rose & Bloom', 'firebase-user-2');
  assert.equal(second, slugs.storeSlugCandidates('Rose & Bloom', 'firebase-user-2')[1]);
  assert.match(second, /^rose-bloom-[a-f0-9]{6}$/);
  assert.doesNotMatch(second, /firebase-user/);
  const third = await slugs.reserveFriendlyStoreSlug(f.tx, f.db, 'Rose & Bloom', 'firebase-user-2');
  assert.equal(third, second);
  assert.equal(f.records.get('store_slugs/rose-bloom').sellerId, 'firebase-user-1');
  assert.equal(slugs.storeSlugCandidates('Crème Café!', 'some-id')[0], 'creme-cafe');
});

test('friendly slugs avoid seller UID collisions and keep legacy aliases', async () => {
  const legacy = 'sweet-studio-012345abcdef';
  const f = fixture({
    'sellers/owner': { businessName: 'Sweet Studio', slug: legacy },
    ['store_slugs/' + legacy]: { sellerId: 'owner' },
    'sellers/sweet-studio': { businessName: 'A seller whose UID matches this slug' },
  });
  const slug = await slugs.ensureFriendlyStoreSlug(f.tx, f.db, f.db.doc('sellers/owner'), f.records.get('sellers/owner'));
  assert.match(slug, /^sweet-studio-[a-f0-9]{6}$/);
  assert.equal(f.records.get('sellers/owner').slug, slug);
  assert.equal(f.records.get('store_slugs/' + legacy).sellerId, 'owner');
  assert.equal(f.records.get('store_slugs/' + slug).sellerId, 'owner');

  const noChange = await slugs.ensureFriendlyStoreSlug(f.tx, f.db, f.db.doc('sellers/owner'), {
    ...f.records.get('sellers/owner'), businessName: 'Renamed Studio',
  });
  assert.equal(noChange, slug, 'renaming the store must not change a public URL');
  const updates = f.writes.filter(item => item[0] === 'update');
  assert.equal(updates.length, 1);
});

test('legacy UID-only stores gain a new slug and previous aliases stay reserved', async () => {
  const f = fixture({ 'sellers/owner': { businessName: 'Handmade Gifts' } });
  const slug = await slugs.ensureFriendlyStoreSlug(f.tx, f.db, f.db.doc('sellers/owner'), f.records.get('sellers/owner'));
  assert.equal(slug, 'handmade-gifts');
  assert.equal(f.records.get('store_slugs/handmade-gifts').sellerId, 'owner');
  assert.equal(f.records.get('sellers/owner').slug, 'handmade-gifts');
  const blocked = fixture({ 'store_slugs/rose-bloom': { retired: true } });
  const candidate = await slugs.reserveFriendlyStoreSlug(blocked.tx, blocked.db, 'Rose Bloom', 'new-owner');
  assert.notEqual(candidate, 'rose-bloom', 'deleted store URLs remain reserved');
});

test('conflicting legacy aliases cannot be silently reassigned', async () => {
  const f = fixture({ 'store_slugs/rose-012345abcdef': { sellerId: 'another-owner' } });
  await assert.rejects(
    () => slugs.reserveFriendlyStoreSlug(f.tx, f.db, 'Rose', 'owner', 'rose-012345abcdef'),
    /already assigned/,
  );
  assert.equal(f.writes.length, 0);
});

test('signed-in seller can upgrade only their own link; other origins are blocked', async () => {
  const f = fixture({ 'sellers/owner': { businessName: 'Sage Studio', ownerUid: 'owner', slug: 'sage-studio-012345abcdef' } });
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const route = load('src/app/api/seller/storefront-link/route.ts', {
    '@/lib/server/firebase-admin': {
      ApiError, verifiedUser: async () => ({uid:'owner',db:{...f.db,runTransaction:async callback => callback(f.tx)}}),
      safeResponse: error => Response.json({error:error.message},{status:error.status || 503}),
    },
    '@/lib/server/store-slug': slugs,
  });
  const request = origin => new Request('https://treatstory.in/api/seller/storefront-link', {
    method:'POST', headers:{origin},
  });
  const forbidden = await route.POST(request('https://untrusted.example'));
  assert.equal(forbidden.status, 403);
  const response = await route.POST(request('https://treatstory.in'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {slug:'sage-studio'});
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(f.records.get('sellers/owner').slug, 'sage-studio');
});

test('store sharing uses the primary custom domain for copying and WhatsApp', () => {
  const links = load('src/lib/storefront-share.ts');
  const url = links.storefrontShareUrl('rose-bloom');
  assert.equal(url, 'https://treatstory.in/shop/rose-bloom');
  assert.equal(links.storefrontShareUrl('store/name'), 'https://treatstory.in/shop/store%2Fname');
  const text = decodeURIComponent(links.storefrontWhatsAppUrl('rose-bloom', ' Rose & Bloom '));
  assert.match(text, /Discover Rose & Bloom on TreatStory/);
  assert.match(text, /https:\/\/treatstory\.in\/shop\/rose-bloom/);
  assert.doesNotMatch(text, /treatstory\.vercel\.app/);
});

test('existing sellers upgrade automatically before their dashboard offers store sharing', () => {
  const component = fs.readFileSync('src/components/seller-store-settings.tsx', 'utf8');
  const route = fs.readFileSync('src/app/shop/[id]/page.tsx', 'utf8');
  const migration = fs.readFileSync('scripts/migrate-store-slugs.ts', 'utf8');
  const deletion = fs.readFileSync('src/app/api/account/delete/route.ts','utf8');
  assert.match(component, /\/api\/seller\/storefront-link/);
  assert.match(component, /Preparing store link/);
  assert.match(component, /sellerId=\{shareSlug\}/);
  assert.match(route, /permanentRedirect/);
  assert.match(route, /storefrontShareUrl/);
  assert.match(migration, /ensureFriendlyStoreSlug/);
  assert.match(deletion, /retired: true/);
});
