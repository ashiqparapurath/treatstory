const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const { Timestamp } = require('firebase-admin/firestore');

function load(path, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id),
    Response, Request, URL, console, process,
  }, { filename: path });
  return module.exports;
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const safeResponse = error => Response.json({ error: error.message }, { status: error.status || 503 });
const mail = { processMailQueue: async () => ({ configured: true }), queueNotification() {} };
const now = Timestamp.fromDate(new Date('2026-11-19T12:00:00.000Z'));

test('admin selection is required; a guest can be approved without a Firebase user', async () => {
  let data = {
    ownerUid: '', status: 'pending', businessName: 'Sample Bakery', businessCategory: 'home-bakery',
    contactEmail: 'guest@example.com', contactPhone: '1234567890',
    description: 'Homemade cakes', submittedAt: now,
  };
  const deliveries = [], audits = [];
  const ref = path => ({ path, get: async () => ({ exists: true, data: () => data }) });
  const db = {
    doc: ref,
    collection: name => ({ doc: id => ref(name + '/' + (id || 'audit')) }),
    runTransaction: fn => fn({
      get: async reference => ({ exists: true, data: () =>
        reference.path.startsWith('seller_applications/') ? data : { admin: true } }),
      update: (reference, patch) => { if (reference.path.startsWith('seller_applications/')) data = { ...data, ...patch }; },
      create: (reference, payload) => audits.push({ path: reference.path, payload }),
    }),
  };
  const mocks = {
    '@/lib/seller-profile-details': load('src/lib/seller-profile-details.ts', {}),
    'next/server': { after() {} },
    '@/lib/server/firebase-admin': { verifiedUser: async () => ({ db, uid: 'admin', auth: { getUser: () => { throw Error('Guest approval must not require an account'); } } }), ApiError, safeResponse },
    '@/lib/server/request-body': { readJsonBody: request => request.json() },
    '@/lib/server/mail': mail,
    '@/lib/server/seller-activation': { activateApprovedSeller: () => { throw Error('Guest must not be activated at approval'); } },
    '@/lib/server/seller-application-email': {
      queueApprovedSellerApplicationMail: (...args) => deliveries.push(args),
      queueRejectedSellerApplicationMail() {},
    },
  };
  const { PATCH } = load('src/app/api/seller-applications/route.ts', mocks);
  const approve = payload => PATCH(new Request('https://shop.example.com/api/seller-applications', {
    method: 'PATCH', body: JSON.stringify({ id: 'guest_fixture', approved: true, ...payload }),
  }));
  const missing = await approve({});
  assert.equal(missing.status, 400);
  assert.equal(data.status, 'pending');
  const success = await approve({ plan: 'three_months' });
  assert.equal(success.status, 200, await success.text?.());
  assert.equal(data.status, 'approved');
  assert.equal(data.approvalPlan, 'three_months');
  assert.equal(data.ownerUid, '');
  assert.equal(data.activatedAt, undefined);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0][4], 'three_months');
  assert.ok(audits.some(item => item.path.startsWith('admin_audit/')));
});

test('activation requires a verified matching email and claims guest approval once', async () => {
  let account = { email: 'guest@example.com', emailVerified: false, disabled: false };
  const guestId = 'guest_' + createHash('sha256').update(account.email).digest('hex');
  let data = {
    status: 'approved', ownerUid: '', contactEmail: account.email, approvalPlan: 'six_months',
    businessName: 'Guest Studio', businessCategory: 'handmade', contactPhone: '1234567890',
    description: 'Artwork',
  };
  const refs = [];
  let activationCalls = 0;
  const ref = path => ({ path, id: path.split('/').at(-1) });
  const db = {
    doc: ref,
    collection: name => ({ doc: id => ref(name + '/' + (id || 'audit')) }),
    runTransaction: fn => fn({
      get: async reference => ({ exists: reference.path === 'seller_applications/' + guestId,
        data: () => reference.path === 'seller_applications/' + guestId ? data : undefined }),
      update: (reference, patch) => { assert.equal(reference.path, 'seller_applications/' + guestId); data = { ...data, ...patch }; },
      create: (reference, record) => refs.push({ reference, record }),
    }),
  };
  const mocks = {
    'next/server': { after() {} },
    '@/lib/server/firebase-admin': { verifiedUser: async () => ({ db, uid: 'new-firebase-uid', auth: { getUser: async () => account } }), ApiError, safeResponse },
    '@/lib/server/mail': mail,
    '@/lib/server/seller-activation': {
      activateApprovedSeller: async (tx, firestore, application, uid) => {
        assert.equal(firestore, db);
        assert.equal(uid, 'new-firebase-uid');
        assert.equal(application.approvalPlan, 'six_months');
        activationCalls++;
      },
    },
  };
  const { POST } = load('src/app/api/seller-applications/activate/route.ts', mocks);
  const request = () => new Request('https://shop.example.com/api/seller-applications/activate', { method: 'POST' });
  assert.equal((await POST(request())).status, 403, 'unverified email may not claim');
  account = { ...account, emailVerified: true };
  const done = await POST(request());
  assert.equal(done.status, 200);
  assert.equal(data.ownerUid, 'new-firebase-uid');
  assert.ok(data.activatedAt);
  assert.equal(activationCalls, 1);
  assert.equal((await POST(request())).status, 409, 'replay must not recreate seller');
  account = { ...account, email: 'someone-else@example.com' };
  assert.equal((await POST(request())).status, 404, 'a different email cannot discover or claim the approval');
  assert.equal(activationCalls, 1);
});

test('plan duration starts on activation, clamps months correctly, and full access remains non-trial', () => {
  const plans = load('src/lib/seller-policy.ts');
  const start = new Date('2026-01-31T12:00:00.000Z');
  assert.equal(plans.sellerApprovalEnd(start, 'three_months').toISOString(), '2026-04-30T12:00:00.000Z');
  assert.equal(plans.sellerApprovalEnd(start, 'six_months').toISOString(), '2026-07-31T12:00:00.000Z');
  assert.equal(plans.sellerApprovalEnd(start, 'full').toISOString(), '2099-12-31T23:59:59.000Z');
  assert.ok(!plans.isSellerApprovalPlan(''));
  assert.ok(!plans.isSellerApprovalPlan('premium'));
});

test('approval email goes directly to original guest contact email and includes the chosen plan', () => {
  const deliveries = [];
  const helper = load('src/lib/server/seller-application-email.ts', {
    '@/lib/server/mail': { mailId: value => value, queueMail: (...args) => deliveries.push(args) },
  });
  const application = {
    id: 'guest_fixture', businessName: 'Studio', businessCategory: 'art',
    contactEmail: 'guest@example.com', submittedAt: now,
  };
  helper.queueApprovedSellerApplicationMail({}, {}, application, now, 'six_months');
  assert.equal(deliveries.length, 1);
  const [,,,,id,account,recipient] = deliveries[0];
  assert.equal(account, false);
  assert.equal(recipient, 'guest@example.com');
  assert.match(id, /approved/);
  assert.match(deliveries[0][3].message, /6-month free trial/);
  assert.match(deliveries[0][3].href, /become-a-seller/);
});

test('activation persists the admin-selected access plan with existing seller fields and no client-controlled expiry', async () => {
  const notices = [], writes = [], sets = [];
  const policy = load('src/lib/seller-policy.ts');
  const activation = load('src/lib/server/seller-activation.ts', {
    '@/lib/server/firebase-admin': { ApiError },
    '@/lib/server/mail': { queueNotification: (...args) => notices.push(args) },
    '@/lib/server/store-slug': { reserveFriendlyStoreSlug: async (tx, db, name, uid) => { tx.set(db.doc('store_slugs/studio-' + uid), {sellerId:uid}); return 'studio-' + uid; } },
    '@/lib/seller-policy': policy,
  });
  const db = { doc: path => ({ path }) };
  const tx = {
    get: async () => ({ exists: false }),
    set: (ref, data) => sets.push({ path: ref.path, data }),
    create: (ref, data) => writes.push({ path: ref.path, data }),
  };
  for (const plan of ['three_months', 'six_months', 'full']) {
    await activation.activateApprovedSeller(tx, db, {
      businessName: 'Studio', businessCategory: 'home-bakery', fssaiNumber: '01234567890123', contactEmail: 'guest@example.com',
      contactPhone: '1234567890', description: 'Original artwork', approvalPlan: plan,
    }, 'seller-uid', now);
    const seller = writes.at(-1);
    assert.equal(seller.path, 'sellers/seller-uid');
    assert.equal(seller.data.status, 'active');
    assert.equal(seller.data.fssaiNumber, '01234567890123');
    assert.equal(seller.data.approvalPlan, plan);
    assert.equal(seller.data.accessType, plan === 'full' ? 'full' : 'trial');
    assert.equal(seller.data.accessStartsAt.toMillis(), now.toMillis());
    assert.equal(seller.data.accessEndsAt.toDate().toISOString(), policy.sellerApprovalEnd(now.toDate(), plan).toISOString());
  }
  assert.equal(notices.length, 3);
  assert.equal(sets.length, 3, 'each activation reserves its store slug');
  assert.equal(writes.length, 3, 'each test activation creates one seller');
});

test('submitting the saved registration and expiry requests review for the signed-in baker', async () => {
  const uid = 'fixture-baker';
  const records = new Map([['sellers/' + uid, { businessName: 'Fixture Bakery', fssaiNumber: '01234567890123' }]]);
  const db = {
    doc: path => path,
    runTransaction: fn => fn({
      get: async path => ({ exists: records.has(path), data: () => records.get(path) }),
      set: (path, data) => records.set(path, data),
      update: (path, data) => records.set(path, { ...records.get(path), ...data }),
    }),
  };
  const { POST } = load('src/app/api/seller/compliance/route.ts', {
    '@/lib/server/firebase-admin': { verifiedUser: async () => ({ uid, db }), ApiError, safeResponse },
    '@/lib/server/request-body': { readJsonBody: request => request.json() },
  });
  const response = await POST(new Request('https://shop.example.com/api/seller/compliance', {
    method: 'POST',
    body: JSON.stringify({ action: 'submit', licenseNumber: records.get('sellers/' + uid).fssaiNumber, expiresOn: '2099-06-30' }),
  }));
  assert.equal(response.status, 200);
  const submission = records.get('seller_compliance/' + uid);
  assert.equal(submission.status, 'pending');
  assert.equal(submission.licenseNumber, '01234567890123');
  assert.equal(submission.expiresOn, '2099-06-30');
  assert.equal(records.get('sellers/' + uid).foodLicenseVerifiedUntil, null);
});
