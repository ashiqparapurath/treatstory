const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const requireModule = (id) => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/'))
      return load('src/' + id.slice(2) + '.ts', mocks, globals);
    if (id.startsWith('.'))
      return load(path.join(path.dirname(file), id) + '.ts', mocks, globals);
    return require(id);
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: requireModule,
      console,
      process,
      URL,
      URLSearchParams,
      Response,
      Request,
      Buffer,
      AbortSignal,
      TextDecoder,
      Uint8Array,
      setTimeout,
      clearTimeout,
      ...globals,
    },
  );
  return module.exports;
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function memoryDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  let seq = 0;
  const doc = (p) => ({
    path: p,
    id: p.split('/').at(-1),
    get: async () => snap(p),
    collection: (n) => collection(p + '/' + n),
  });
  const snap = (p) => ({ exists: records.has(p), data: () => records.get(p) });
  const collection = (n) => ({
    doc: (id) => doc(n + '/' + (id || 'new-' + ++seq)),
  });
  const db = {
    doc,
    collection,
    runTransaction: async (fn) => {
      const pending = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        create: (ref, v) =>
          pending.push(() => {
            if (records.has(ref.path)) throw Error('Exists');
            records.set(ref.path, v);
          }),
        set: (ref, v) => pending.push(() => records.set(ref.path, v)),
        update: (ref, v) =>
          pending.push(() =>
            records.set(ref.path, { ...records.get(ref.path), ...v }),
          ),
      };
      const value = await fn(tx);
      pending.forEach((f) => f());
      return value;
    },
  };
  return { db, records };
}
test('trial is six calendar months with month-end and leap-year clamping', () => {
  const { sellerTrialEnd } = load('src/lib/seller-policy.ts');
  for (const [start, end] of [
    ['2026-08-31', '2027-02-28'],
    ['2023-08-31', '2024-02-29'],
    ['2026-11-14', '2027-05-14'],
  ])
    assert.equal(
      sellerTrialEnd(new Date(start + 'T10:00:00Z')).toISOString(),
      end + 'T10:00:00.000Z',
    );
});
test('store slugs are readable, stable, collision separated and do not reveal UIDs', () => {
  const { storeSlug } = load('src/lib/server/store-slug.ts');
  const a = storeSlug('Little Bloom Bakery', 'private-buyer-uid');
  assert.match(a, /^little-bloom-bakery-[a-f0-9]{12}$/);
  assert.equal(a, storeSlug('Little Bloom Bakery', 'private-buyer-uid'));
  assert.notEqual(a, storeSlug('Little Bloom Bakery', 'different'));
  assert.ok(!a.includes('private-buyer-uid'));
});
test('guest submissions cannot set privileges; approval requires admin and verified email; trial is not reset', async () => {
  const { db, records } = memoryDb();
  let uid = 'visitor',
    verified = false;
  const auth = {
    getUser: async () => ({ emailVerified: verified, disabled: false }),
    getUserByEmail: async () => ({
      uid: 'new-seller',
      emailVerified: verified,
      disabled: false,
    }),
  };
  const mocks = {
    '@/lib/server/firebase-admin': {
      getServerFirebase: () => ({ db, auth }),
      verifiedUser: async () => ({ db, auth, uid }),
      ApiError,
      safeResponse: (e) =>
        Response.json({ error: e.message }, { status: e.status || 500 }),
    },
  };
  const { POST, PATCH } = load(
    'src/app/api/seller-applications/route.ts',
    mocks,
  );
  const request = (body, method = 'POST') =>
    new Request('https://test/api/seller-applications', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const data = {
    businessName: 'A Bakery',
    businessCategory: 'home-bakery',
    contactEmail: 'person@example.test',
    contactPhone: '12345678',
    description: 'Handmade cakes',
  };
  assert.equal(
    (await POST(request({ ...data, ownerUid: 'victim' }))).status,
    400,
  );
  assert.equal((await POST(request({ ...data, website: 'spam' }))).status, 400);
  assert.equal((await POST(request(data))).status, 200);
  const entry = [...records.entries()].find(([k]) =>
    k.startsWith('seller_applications/'),
  );
  assert.equal(entry[1].ownerUid, '');
  const id = entry[0].split('/')[1];
  assert.equal((await POST(request(data))).status, 409);
  assert.equal(
    (await PATCH(request({ id, approved: true }, 'PATCH'))).status,
    403,
  );
  uid = 'admin';
  records.set('roles_admin/admin', {});
  assert.equal(
    (await PATCH(request({ id, approved: true }, 'PATCH'))).status,
    409,
  );
  verified = true;
  assert.equal(
    (await PATCH(request({ id, approved: true }, 'PATCH'))).status,
    200,
  );
  const seller = records.get('sellers/new-seller');
  assert.equal(seller.accessType, 'trial');
  assert.match(seller.slug, /^a-bakery-/);
  const { sellerTrialEnd } = load('src/lib/seller-policy.ts');
  assert.equal(
    seller.accessEndsAt.toMillis(),
    sellerTrialEnd(seller.accessStartsAt.toDate()).getTime(),
  );
  assert.equal(
    (await PATCH(request({ id, approved: true }, 'PATCH'))).status,
    409,
  );
});
test('private photos require ownership or the assigned quote seller and never fetch arbitrary URLs', async () => {
  const { db } = memoryDb({
    'media_assets/photo': {
      ownerUid: 'buyer',
      kind: 'reference',
      type: 'authenticated',
      publicId: 'private',
      format: 'png',
      quoteId: 'q',
    },
    'custom_quotes/q': { buyerUid: 'buyer', sellerId: 'seller' },
  });
  let uid = 'stranger',
    calls = 0;
  const mocks = {
    '@/lib/server/firebase-admin': {
      verifiedUser: async () => ({ uid, db }),
      ApiError,
      safeResponse: (e) =>
        Response.json({ error: e.message }, { status: e.status || 500 }),
    },
    '@/lib/server/media': {
      signedMediaDownload: () => 'https://api.cloudinary.com/test',
    },
  };
  const { GET } = load('src/app/api/reference-media/[id]/route.ts', mocks, {
    fetch: async () => {
      calls++;
      return new Response('png');
    },
  });
  const get = () =>
    GET(new Request('https://test'), {
      params: Promise.resolve({ id: 'photo' }),
    });
  assert.equal((await get()).status, 403);
  assert.equal(calls, 0);
  uid = 'buyer';
  assert.equal((await get()).status, 200);
  uid = 'seller';
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(calls, 2);
});
test('search prefix generation is bounded and indexes Unicode names and SKU', () => {
  const { productSearchPrefixes, searchIndexTerm } = load(
    'src/lib/search-index.ts',
  );
  const index = productSearchPrefixes({
    name: 'Chocolate Cake',
    category: 'Bakes',
    sku: 'TS-AB23CD45',
  });
  assert.ok(index.includes('choc'));
  assert.ok(index.includes('cake'));
  assert.ok(index.includes('ab23'));
  assert.equal(searchIndexTerm(' CHOC cake'), 'choc');
  assert.ok(productSearchPrefixes({ name: 'x'.repeat(100000) }).length <= 800);
});

test('seller access API rejects non-admins and stale edits and records approved changes', async()=>{
  const {db,records}=memoryDb({'sellers/seller':{status:'active',accessEndsAt:{toMillis:()=>Date.now()+86400000}}});
  let uid='buyer';
  const {POST}=load('src/app/api/admin/seller-access/route.ts',{'@/lib/server/firebase-admin':{verifiedUser:async()=>({uid,db}),ApiError,safeResponse:e=>Response.json({error:e.message},{status:e.status||500})}});
  const change=(expectedUpdatedAt=null)=>POST(new Request('https://test/api/admin/seller-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sellerId:'seller',expectedUpdatedAt,patch:{status:'suspended'}})}));
  assert.equal((await change()).status,403);
  uid='admin';records.set('roles_admin/admin',{});
  assert.equal((await change(123)).status,409);
  assert.equal((await change()).status,200);
  assert.equal(records.get('sellers/seller').status,'suspended');
  assert.equal([...records.keys()].filter(k=>k.startsWith('admin_audit/')).length,1);
});
