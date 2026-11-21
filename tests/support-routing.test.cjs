const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const z = require('zod');

function loadSupport(mocks) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/app/api/support/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name),
    Request, Response, console, process, Date,
  }, { filename: 'src/app/api/support/route.ts' });
  return module.exports.POST;
}

function fixture() {
  let uid = 'buyer-1';
  let idCounter = 0;
  const records = new Map([
    ['sellers/shop-a', { ownerUid: 'shop-a', businessName: 'Bloom Studio', status: 'active' }],
    ['sellers/shop-b', { ownerUid: 'shop-b', businessName: 'Clay Works', status: 'active' }],
    ['seller_orders/order-a', { buyerUid: 'buyer-1', sellerId: 'shop-a' }],
    ['seller_orders/order-b', { buyerUid: 'buyer-1', sellerId: 'shop-b' }],
    ['roles_admin/admin', {}],
  ]);
  const notices = [], emails = [];
  const doc = path => ({ path, id: path.split('/').at(-1) });
  const db = {
    doc, collection: path => ({ doc: id => doc(path + '/' + (id || 'generated-' + ++idCounter)) }),
    runTransaction: callback => callback({
      get: async ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
      create: (ref, value) => { assert.equal(records.has(ref.path), false); records.set(ref.path,value); },
      set: (ref, value) => records.set(ref.path, value),
      update: (ref, patch) => { assert.ok(records.has(ref.path)); records.set(ref.path, { ...records.get(ref.path), ...patch }); },
    }),
  };
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const POST = loadSupport({
    '@/lib/document-id': { firestoreDocumentId: max => z.string().min(1).max(max).regex(/^[^/]+$/) },
    '@/lib/server/request-body': { readJsonBody: req => req.json() },
    '@/lib/server/mail': {
      queueNotification: (tx,db,account,notice) => notices.push({ account, notice }),
      queueMail: (tx,db,account,content) => emails.push({ account, content }),
      processMailQueue: async () => {},
    },
    'next/server': { after: () => {} },
    'firebase-admin/firestore': { Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }) } },
    '@/lib/server/firebase-admin': {
      ApiError, verifiedUser: async () => ({ uid, db, auth: {} }),
      safeResponse: err => Response.json({ error: err.message }, { status: err.status || 500 }),
    },
  });
  async function action(body, as = uid) {
    uid = as;
    const response = await POST(new Request('https://treatstory.in/api/support', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    return { status: response.status, data: await response.json() };
  }
  const create = overrides => ({ action: 'create', subject: 'A question about delivery',
    category: 'delivery', message: 'Can you deliver my order on Saturday?',
    sellerId: 'shop-a', orderId: '', ...overrides });
  return { action, create, records, notices, emails };
}

test('buyer message goes only to the chosen seller, not admin', async () => {
  const f = fixture();
  const created = await f.action(f.create({orderId:'order-a'}), 'buyer-1');
  assert.equal(created.status, 200);
  const ticket = f.records.get('support_tickets/' + created.data.ticketId);
  assert.equal(ticket.route, 'seller');
  assert.equal(ticket.sellerId, 'shop-a');
  assert.equal(ticket.sellerName, 'Bloom Studio');
  assert.equal(ticket.ownerUid, 'buyer-1');
  assert.equal(ticket.orderId, 'order-a');
  assert.ok(f.notices.some(n => n.account === 'shop-a' && n.notice.href === '/seller/messages'));
  assert.ok(!f.notices.some(n => n.account === 'admin'));
  const adminReply = await f.action({ action: 'reply', ticketId: created.data.ticketId, message: 'Please allow a moment.' }, 'admin');
  assert.equal(adminReply.status, 403, 'the admin cannot impersonate the seller');
  const wrongSeller = await f.action({ action: 'reply', ticketId: created.data.ticketId, message: 'Please allow a moment.' }, 'shop-b');
  assert.equal(wrongSeller.status, 403, 'other sellers cannot reply');
  const correctSeller = await f.action({ action: 'reply', ticketId: created.data.ticketId, message: 'Yes, Saturday delivery is available.' }, 'shop-a');
  assert.equal(correctSeller.status, 200);
  assert.equal(f.records.get('support_tickets/' + created.data.ticketId).status, 'responded');
  assert.ok(f.notices.some(n => n.account === 'buyer-1' && n.notice.template === 'support_reply'));
  const followup = await f.action({ action: 'followup', ticketId: created.data.ticketId, message: 'Thank you for confirming.' }, 'buyer-1');
  assert.equal(followup.status, 200);
  assert.equal(f.records.get('support_tickets/' + created.data.ticketId).status, 'open');
  assert.ok(f.notices.filter(n => n.account === 'shop-a').length >= 2);
  const closed = await f.action({ action: 'close', ticketId: created.data.ticketId }, 'shop-a');
  assert.equal(closed.status, 200);
  assert.equal((await f.action({ action: 'followup', ticketId: created.data.ticketId, message: 'Another question.' }, 'buyer-1')).status, 409);
});

test('buyers cannot target unrelated orders, their own seller account, or unknown stores', async () => {
  const f = fixture();
  assert.equal((await f.action(f.create({ sellerId: 'shop-b', orderId:'order-a' }), 'buyer-1')).status, 403);
  assert.equal((await f.action(f.create({ sellerId: 'shop-a', orderId:'order-b' }), 'buyer-1')).status, 403);
  assert.equal((await f.action(f.create({ sellerId: 'unknown' }), 'buyer-1')).status, 404);
  assert.equal((await f.action(f.create({ sellerId: '' }), 'buyer-1')).status, 400);
  assert.equal((await f.action(f.create({ sellerId: 'shop-a' }), 'shop-a')).status, 404);
  assert.equal(Array.from(f.records.keys()).filter(path => path.startsWith('support_tickets/')).length, 0);
});

test('seller support goes to platform administrators; previous admin tickets still work', async () => {
  const f = fixture();
  const created = await f.action(f.create({ sellerId: '', orderId: '', category: 'account' }), 'shop-a');
  assert.equal(created.status, 200);
  const ticket = f.records.get('support_tickets/' + created.data.ticketId);
  assert.equal(ticket.route, 'admin');
  assert.equal(ticket.ownerUid, 'shop-a');
  assert.equal(ticket.sellerId, undefined);
  assert.equal((await f.action({ action: 'reply', ticketId: created.data.ticketId, message: 'Please confirm your account.' }, 'shop-b')).status, 403);
  assert.equal((await f.action({ action: 'reply', ticketId: created.data.ticketId, message: 'We have checked your request.' }, 'admin')).status, 200);
  f.records.set('support_tickets/old-admin-ticket', { ownerUid: 'buyer-1', subject: 'Old request', message: 'Legacy help', status:'open', response:'' });
  assert.equal((await f.action({ action: 'reply', ticketId: 'old-admin-ticket', message: 'Your earlier request is handled.' }, 'admin')).status, 200);
  assert.ok(!f.notices.some(n => n.account === 'shop-b'));
});

test('seller and buyer interfaces are separated and Firestore access is scoped', () => {
  const rules = fs.readFileSync('firestore.rules','utf8');
  const indexes = JSON.parse(fs.readFileSync('firestore.indexes.json','utf8'));
  const admin = fs.readFileSync('src/components/admin/support-legacy-inbox.tsx','utf8');
  const seller = fs.readFileSync('src/components/seller-message-inbox.tsx','utf8');
  const buyer = fs.readFileSync('src/components/support-legacy-page.tsx','utf8');
  const store = fs.readFileSync('src/components/seller-store-client.tsx','utf8');
  const order = fs.readFileSync('src/components/order-management.tsx','utf8');
  assert.match(rules,/match \/support_tickets\/\{ticketId\}/);
  assert.match(rules,/resource.data.get\('route', ''\) == 'seller'/);
  assert.match(rules,/resource.data.get\('sellerId', ''\) == request.auth.uid/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.ok(indexes.indexes.some(item => item.collectionGroup === 'support_tickets' &&
    item.fields?.some(f => f.fieldPath === 'sellerId') && item.fields?.some(f => f.fieldPath === 'route')));
  assert.match(admin,/ticket.route !== 'seller'/);
  assert.match(seller,/where\('sellerId', '==', user.uid\)/);
  assert.match(seller,/where\('route', '==', 'seller'\)/);
  assert.match(buyer,/sellerId: isSeller \? '' : targetSellerId/);
  assert.match(store,/Message seller/);
  assert.match(order,/Message seller about this order/);
  assert.match(fs.readFileSync('src/app/seller/dashboard/page.tsx','utf8'),/href="\/seller\/messages"/);
});
