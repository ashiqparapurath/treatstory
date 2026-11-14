import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { convertQuote } from '../src/lib/server/quote-order';
import { applyOrderAction } from '../src/lib/server/order-actions';
async function main() {
  if (
    !/^(127\.0\.0\.1|localhost):\d+$/.test(
      process.env.FIRESTORE_EMULATOR_HOST || '',
    )
  )
    throw Error('Loopback emulator required');
  const db = getFirestore(
    initializeApp({ projectId: 'demo-treatstory' }, 'quote-test'),
  );
  const sellerId = 'seller-' + randomUUID(),
    buyerUid = 'buyer-' + randomUUID(),
    productId = 'product-' + randomUUID();
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const seller = {
    status: 'active',
    isOpen: true,
    accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000),
    deliveryMethods: ['delivery'],
    deliveryPincodes: ['673001'],
    deliveryFee: 50,
    dailyOrderCapacity: 1,
  };
  await db.doc('sellers/' + sellerId).set(seller);
  await db
    .doc('marketplace_products/' + productId)
    .set({
      sellerId,
      status: 'published',
      availability: 'available',
      stockQuantity: 2,
      name: 'Cake',
    });
  const q = {
    sellerId,
    buyerUid,
    productId,
    requestedDate: date,
    quotedPrice: 500,
    status: 'quoted',
    expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    occasion: 'Birthday',
    description: 'Birthday cake',
    quotedNote: 'One cake',
  };
  const quote = db.collection('custom_quotes').doc();
  await quote.set(q);
  const input = {
    customerName: 'Test buyer',
    customerPhone: '12345678',
    deliveryAddress: 'Test address for delivery',
    deliveryMode: 'delivery' as const,
    pincode: '673001',
    requestedSlot: '',
    expectedTotal: 550,
    weight: null,
  };
  const place = (uid = buyerUid, extra = {}) =>
    db.runTransaction(async (tx) => {
      const current = await tx.get(quote);
      const store = await tx.get(db.doc('sellers/' + sellerId));
      return convertQuote(tx, db, uid, quote, current.data()!, store.data()!, {
        ...input,
        ...extra,
      });
    });
  await assert.rejects(place('stranger'), (e: any) => e.status === 403);
  await assert.rejects(
    place(buyerUid, { expectedTotal: 500 }),
    (e: any) => e.status === 409,
  );
  const result = await Promise.all([place(), place()]);
  assert.equal(result[0].orderId, result[1].orderId);
  assert.equal(
    (await db.doc('marketplace_products/' + productId).get()).data()!
      .stockQuantity,
    1,
  );
  assert.equal(
    (await db.doc('seller_bookings/' + sellerId + '_' + date).get()).data()!
      .count,
    1,
  );
  assert.equal(
    (
      await db
        .collection('seller_orders')
        .where('quoteId', '==', quote.id)
        .get()
    ).size,
    1,
  );
  const another = db.collection('custom_quotes').doc();
  await another.set(q);
  await assert.rejects(
    db.runTransaction(async (tx) => {
      const snap = await tx.get(another);
      return convertQuote(
        tx,
        db,
        buyerUid,
        another,
        snap.data()!,
        seller,
        input,
      );
    }),
    (e: any) => e.status === 409,
  );
  await applyOrderAction(db, sellerId, result[0].orderId, 'rejected');
  assert.equal((await quote.get()).data()!.status, 'cancelled');
  assert.equal(
    (await db.doc('marketplace_products/' + productId).get()).data()!
      .stockQuantity,
    2,
  );
  assert.equal(
    (await db.doc('seller_bookings/' + sellerId + '_' + date).get()).data()!
      .count,
    0,
  );
  console.log(
    'Quote authorization, totals, concurrent retries, capacity, stock and rejection rollback passed',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
