/** Buyer/seller/admin ticket isolation against the actual Firestore rules emulator.
 * Refuses execution unless connected to a loopback test emulator.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, terminate, collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, where, addDoc } from 'firebase/firestore';

async function main() {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''))
    throw Error('Refusing to test ticket security outside the local Firestore emulator.');

  const projectId = process.env.GCLOUD_PROJECT || 'demo-treatstory';
  const prefix = 'support-' + randomUUID();
  const buyerId = prefix + '-buyer';
  const sellerId = prefix + '-shop';
  const otherSellerId = prefix + '-other';
  const adminId = prefix + '-admin';

  const adminApp = initializeAdminApp({ projectId }, prefix + '-service');
  const server = adminFirestore(adminApp);
  const [sellerTicket, platformTicket, oldTicket] = [
    prefix + '-seller-ticket', prefix + '-platform-ticket', prefix + '-old-ticket',
  ];
  const now = Timestamp.now();
  await Promise.all([
    server.doc('sellers/' + sellerId).set({ ownerUid: sellerId, businessName: 'Example seller', status: 'active' }),
    server.doc('sellers/' + otherSellerId).set({ ownerUid: otherSellerId, businessName: 'Other seller', status: 'active' }),
    server.doc('roles_admin/' + adminId).set({ enabled: true }),
    server.doc('support_tickets/' + sellerTicket).set({
      ownerUid: buyerId, sellerId, route: 'seller', sellerName: 'Example seller',
      status: 'open', subject: 'Where is my order?', message: 'Buyer seller-only ticket', updatedAt: now, createdAt: now,
    }),
    server.doc('support_tickets/' + platformTicket).set({
      ownerUid: sellerId, route: 'admin', status: 'open', subject: 'Seller account help',
      message: 'Seller administration ticket', updatedAt: now, createdAt: now,
    }),
    server.doc('support_tickets/' + oldTicket).set({
      ownerUid: buyerId, status: 'open', subject: 'Historical buyer support', message: 'Legacy platform ticket',
      updatedAt: now, createdAt: now,
    }),
  ]);

  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
  function client(uid: string) {
    const app = initializeApp({ projectId, apiKey: 'emulator-only-key' }, prefix + '-' + uid);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } });
    return { app, db };
  }
  const buyer = client(buyerId);
  const seller = client(sellerId);
  const other = client(otherSellerId);
  const admin = client(adminId);
  const everyone = [buyer, seller, other, admin];
  const denied = (error: unknown) => (error as { code?: string }).code === 'permission-denied';
  try {
    assert.equal((await getDoc(doc(buyer.db, 'support_tickets', sellerTicket))).exists(), true);
    assert.equal((await getDoc(doc(buyer.db, 'support_tickets', oldTicket))).exists(), true);
    await assert.rejects(() => getDoc(doc(buyer.db, 'support_tickets', platformTicket)), denied);

    assert.equal((await getDoc(doc(seller.db, 'support_tickets', sellerTicket))).exists(), true);
    assert.equal((await getDoc(doc(seller.db, 'support_tickets', platformTicket))).exists(), true);
    await assert.rejects(() => getDoc(doc(seller.db, 'support_tickets', oldTicket)), denied);

    await assert.rejects(() => getDoc(doc(other.db, 'support_tickets', sellerTicket)), denied);
    await assert.rejects(() => getDoc(doc(other.db, 'support_tickets', platformTicket)), denied);

    assert.equal((await getDoc(doc(admin.db, 'support_tickets', sellerTicket))).exists(), true);
    assert.equal((await getDoc(doc(admin.db, 'support_tickets', oldTicket))).exists(), true);

    const sellerInbox = await getDocs(query(
      collection(seller.db, 'support_tickets'),
      where('sellerId', '==', sellerId), where('route', '==', 'seller'), orderBy('updatedAt', 'desc'), limit(100),
    ));
    assert.equal(sellerInbox.docs.filter(x => x.id === sellerTicket).length, 1);
    await assert.rejects(() => getDocs(query(
      collection(other.db, 'support_tickets'),
      where('sellerId', '==', sellerId), where('route', '==', 'seller'), limit(100),
    )), denied);

    const buyerInbox = await getDocs(query(
      collection(buyer.db, 'support_tickets'), where('ownerUid', '==', buyerId), orderBy('updatedAt','desc'), limit(50),
    ));
    assert.ok(buyerInbox.docs.some(x => x.id === sellerTicket));
    assert.ok(buyerInbox.docs.some(x => x.id === oldTicket));

    const platformInbox = await getDocs(query(
      collection(admin.db, 'support_tickets'), where('route', '==', 'admin'), orderBy('updatedAt', 'desc'), limit(100),
    ));
    assert.ok(platformInbox.docs.some(x => x.id === platformTicket));
    assert.ok(!platformInbox.docs.some(x => x.id === sellerTicket));

    // All writes are server-only, including attempts by the addressed seller.
    for (const account of everyone) {
      await assert.rejects(
        () => updateDoc(doc(account.db, 'support_tickets', sellerTicket), { status: 'closed' }),
        denied,
      );
      await assert.rejects(
        () => addDoc(collection(account.db, 'support_tickets'), { ownerUid: buyerId, status: 'open' }),
        denied,
      );
    }
    console.log('PASS ticket owner, exact seller and admin access; deny other sellers and all direct writes');
  } finally {
    await Promise.all(everyone.map(async item => {
      await terminate(item.db);
      await deleteApp(item.app);
    }));
    await server.terminate();
    await deleteAdminApp(adminApp);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
