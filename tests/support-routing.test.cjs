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
    ['sellers/shop-a', { ownerUid: 'shop-a', businessName: 'Bloom Studio', status: 'active', accessEndsAt: { toMillis: () => Date.now() + 86400000 } }],
    ['sellers/shop-b', { ownerUid: 'shop-b', businessName: 'Clay Works', status: 'active', accessEndsAt: { toMillis: () => Date.now() + 86400000 } }],
    ['seller_orders/order-a', { buyerUid: 'buyer-1', sellerId: 'shop-a' }],
    ['seller_orders/order-b', { buyerUid: 'buyer-1', sellerId: 'shop-b' }],
    ['roles_admin/admin', {}],
    ['custom_quotes/quote-a', { sellerId: 'shop-a', buyerUid: 'buyer-1', productName: 'Rose bouquet', occasion: 'Anniversary', status: 'requested' }],
    ['custom_quotes/quote-b', { sellerId: 'shop-b', buyerUid: 'buyer-1', productName: 'Clay vase', status: 'quoted' }],
    ['custom_quotes/quote-self', { sellerId: 'shop-a', buyerUid: 'shop-a', productName: 'Self request' }],
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

test('a seller can open a private quote-linked buyer conversation without duplicate tickets', async () => {
  const f = fixture();
  const first = await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'shop-a');
  assert.equal(first.status, 200);
  assert.equal(first.data.ticketId, 'quote_quote-a');
  assert.equal(first.data.created, true);
  const ticket = f.records.get('support_tickets/quote_quote-a');
  assert.equal(ticket.route, 'seller');
  assert.equal(ticket.quoteId, 'quote-a');
  assert.equal(ticket.ownerUid, 'buyer-1');
  assert.equal(ticket.sellerId, 'shop-a');
  assert.equal(ticket.initialSender, 'system', 'opening a chat must not impersonate a written message from the seller');
  assert.match(ticket.subject,/Rose bouquet/);
  assert.equal(f.notices.filter(n => n.account === 'buyer-1' && n.notice.href === '/support?ticket=quote_quote-a').length, 1);
  assert.ok(!f.notices.some(n => n.account === 'admin'));

  const repeated = await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'shop-a');
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.ticketId, first.data.ticketId);
  assert.equal(repeated.data.created, false);
  assert.equal(f.notices.filter(n => n.account === 'buyer-1').length, 1, 'reopening must not notify buyer again');
  assert.equal(Array.from(f.records.keys()).filter(p => p.startsWith('support_tickets/')).length, 1);

  const sellerReply = await f.action({ action: 'reply', ticketId: first.data.ticketId, message: 'We can confirm availability for this bouquet.' }, 'shop-a');
  assert.equal(sellerReply.status, 200);
  assert.ok(f.notices.some(n => n.account === 'buyer-1' && n.notice.template === 'support_reply'));
  const buyerReply = await f.action({ action: 'followup', ticketId: first.data.ticketId, message: 'That sounds great, thank you!' }, 'buyer-1');
  assert.equal(buyerReply.status, 200);
  assert.ok(f.notices.some(n => n.account === 'shop-a' && n.notice.href === '/seller/messages'));
  assert.equal((await f.action({ action: 'reply', ticketId: first.data.ticketId, message: 'Not my customer.' }, 'shop-b')).status, 403);
  assert.equal((await f.action({ action: 'followup', ticketId: first.data.ticketId, message: 'Not my quotation.' }, 'shop-b')).status, 403);
});

test('quote chat open is restricted to the addressed active seller; no guessing other buyer IDs', async () => {
  const f = fixture();
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'shop-b')).status, 403);
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'buyer-1')).status, 403);
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'admin')).status, 403);
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'not-a-quote' }, 'shop-a')).status, 403);
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'quote-self' }, 'shop-a')).status, 403);
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: '../quote-a' }, 'shop-a')).status, 400);
  f.records.set('sellers/shop-a', {...f.records.get('sellers/shop-a'),status:'suspended'});
  assert.equal((await f.action({ action: 'open_quote_chat', quoteId: 'quote-a' }, 'shop-a')).status, 403);
  f.records.set('sellers/shop-a', {...f.records.get('sellers/shop-a'),status:'active',accessEndsAt:{toMillis:()=>Date.now()-1000}});
  assert.equal((await f.action({action:'open_quote_chat',quoteId:'quote-a'},'shop-a')).status,403,'expired seller must not initiate chat');
  assert.equal(f.notices.length, 0);
  assert.equal(Array.from(f.records.keys()).filter(p => p.startsWith('support_tickets/')).length, 0);
});

test('received quotation view and scoped seller chat are linked in one seller workflow', () => {
  const dashboard = fs.readFileSync('src/app/seller/dashboard/page.tsx', 'utf8');
  const quotes = fs.readFileSync('src/app/custom-orders/page.tsx', 'utf8');
  const sellerInbox = fs.readFileSync('src/components/seller-message-inbox.tsx', 'utf8');
  const buyerInbox = fs.readFileSync('src/components/support-legacy-page.tsx', 'utf8');
  const thread = fs.readFileSync('src/components/support-ticket-thread.tsx', 'utf8');
  assert.match(dashboard,/href="\/custom-orders\?view=received"/);
  assert.match(quotes,/sellerReceivedView \? 'Received quotations'/);
  assert.match(quotes,/href=\{'\/seller\/messages\?quote=' \+ encodeURIComponent\(q.id\)\}/);
  assert.match(quotes,/Open buyer chat/);
  assert.match(sellerInbox,/action: 'open_quote_chat', quoteId: requestedQuoteId/);
  assert.match(sellerInbox,/openTicketId=\{openTicketId\}/);
  assert.match(buyerInbox,/query.get\('ticket'\)/);
  assert.match(thread,/ticket.initialSender \|\| 'customer'/);
  assert.match(thread,/View linked quotation/);
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
  assert.match(admin,/ticket.route === 'admin'/);
  assert.match(admin,/!ticket.route/);
  assert.match(admin,/where\('route', '==', 'admin'\)/);
  assert.match(seller,/where\('sellerId', '==', user.uid\)/);
  assert.match(seller,/where\('route', '==', 'seller'\)/);
  assert.match(buyer,/sellerId: supportToAdmin \? '' : targetSellerId/);
  assert.match(buyer,/const supportToAdmin = isSeller && !targetSellerId/);
  assert.match(buyer,/\^\[A-Za-z0-9_-\]/);
  assert.match(fs.readFileSync('src/components/support-ticket-thread.tsx','utf8'),/ticket.route !== 'seller'/);
  assert.match(store,/Message seller/);
  assert.match(order,/Message seller about this order/);
  assert.match(fs.readFileSync('src/app/seller/dashboard/page.tsx','utf8'),/href="\/seller\/messages"/);
});
