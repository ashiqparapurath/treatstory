import type { NextRequest } from 'next/server';
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { ApiError, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FINAL_ORDERS = new Set(['completed', 'cancelled', 'rejected']);
const FINAL_QUOTES = new Set(['declined', 'cancelled', 'expired', 'completed']);
const NO_CACHE = { 'Cache-Control': 'no-store' };

async function fetchByUid(db: FirebaseDb, collection: string, key: string, uid: string) {
  return db.collection(collection).where(key, '==', uid).get();
}
type FirebaseDb = Awaited<ReturnType<typeof verifiedUser>>['db'];

function uniqueDocs(...groups: Array<{ docs: QueryDocumentSnapshot[] }>) {
  const map = new Map<string, QueryDocumentSnapshot>();
  for (const group of groups) for (const doc of group.docs) map.set(doc.ref.path, doc);
  return [...map.values()];
}

async function purgePersonalData(db: FirebaseDb, uid: string) {
  // Queries are UID-scoped. Never iterate all accounts or touch unrelated customers.
  const [buyerOrders, sellerOrders, checkouts, products, reviews, support, quoteBuyer, quoteSeller, bookings, mail, quoteLimits, supportLimits] = await Promise.all([
    fetchByUid(db, 'seller_orders', 'buyerUid', uid),
    fetchByUid(db, 'seller_orders', 'sellerId', uid),
    fetchByUid(db, 'checkout_orders', 'buyerUid', uid),
    fetchByUid(db, 'marketplace_products', 'sellerId', uid),
    fetchByUid(db, 'product_reviews', 'buyerUid', uid),
    fetchByUid(db, 'support_tickets', 'ownerUid', uid),
    fetchByUid(db, 'custom_quotes', 'buyerUid', uid),
    fetchByUid(db, 'custom_quotes', 'sellerId', uid),
    fetchByUid(db, 'seller_bookings', 'sellerId', uid),
    fetchByUid(db, 'mail_outbox', 'uid', uid),
    fetchByUid(db, 'quote_limits', 'buyerUid', uid),
    fetchByUid(db, 'support_limits', 'ownerUid', uid),
  ]);
  if ([...buyerOrders.docs, ...sellerOrders.docs].some(order => !FINAL_ORDERS.has(order.data().status))) {
    throw new ApiError(409, 'You still have an active order. Complete or cancel it before deleting your account.');
  }
  if (uniqueDocs(quoteBuyer, quoteSeller).some(quote => !FINAL_QUOTES.has(quote.data().status))) {
    throw new ApiError(409, 'You have an outstanding custom-order request. Contact support to close it before deleting your account.');
  }
  const writer = db.bulkWriter();
  writer.onWriteError(error => error.failedAttempts < 3);
  for (const order of buyerOrders.docs) {
    writer.update(order.ref, {
      buyerUid: 'deleted-account',
      customerName: 'Former TreatStory buyer',
      customerPhone: '',
      deliveryAddress: '',
      customerNote: '',
    });
  }
  for (const checkout of checkouts.docs) {
    writer.update(checkout.ref, {
      buyerUid: 'deleted-account',
      customerName: FieldValue.delete(),
      customerPhone: FieldValue.delete(),
      deliveryAddress: FieldValue.delete(),
      customerNote: FieldValue.delete(),
    });
  }
  for (const item of [...products.docs, ...reviews.docs, ...support.docs, ...uniqueDocs(quoteBuyer, quoteSeller), ...bookings.docs, ...mail.docs, ...quoteLimits.docs, ...supportLimits.docs]) {
    writer.delete(item.ref);
  }
  await writer.close();
  // Delete nested items as well as parent docs (deleting a parent alone leaves subcollections).
  await Promise.all([
    db.recursiveDelete(db.collection('favorites').doc(uid)),
    db.recursiveDelete(db.collection('notifications').doc(uid)),
  ]);
  await Promise.all([
    db.collection('customer_address_books').doc(uid).delete(),
    db.collection('customer_addresses').doc(uid).delete(),
    db.collection('seller_applications').doc(uid).delete(),
    db.collection('sellers').doc(uid).delete(),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 1024)
      throw new ApiError(413, 'Request is too large.');
    const raw = await readJsonBody(request, 1024);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      (raw as {confirm?: unknown}).confirm !== 'DELETE' || Object.keys(raw).length !== 1)
      throw new ApiError(400, 'Type DELETE to confirm permanent account deletion.');

    const { auth, db, uid } = await verifiedUser(request);
    const token = request.headers.get('authorization')!.slice(7).trim();
    const verified = await auth.verifyIdToken(token, true);
    if (verified.uid !== uid || !verified.auth_time || Date.now() / 1000 - verified.auth_time > 300)
      throw new ApiError(401, 'For your security, sign in again immediately before deleting your account.');
    if ((await db.collection('roles_admin').doc(uid).get()).exists)
      throw new ApiError(403, 'Administrator accounts must be removed by the platform owner.');

    // The marker prevents stale client sessions and checkout transactions from
    // creating new work while cleanup runs. Keep it after completion so that a
    // still-cached ID token cannot write to the database.
    const marker = db.collection('account_deletions').doc(uid);
    await db.runTransaction(async tx => {
      const current = await tx.get(marker);
      if (!current.exists) tx.create(marker, { state: 'deleting', startedAt: Timestamp.now() });
    });

    try {
      const [buyerOrders, sellerOrders, quoteBuyer, quoteSeller] = await Promise.all([
        fetchByUid(db, 'seller_orders', 'buyerUid', uid),
        fetchByUid(db, 'seller_orders', 'sellerId', uid),
        fetchByUid(db, 'custom_quotes', 'buyerUid', uid),
        fetchByUid(db, 'custom_quotes', 'sellerId', uid),
      ]);
      if (uniqueDocs(buyerOrders, sellerOrders).some(order => !FINAL_ORDERS.has(order.data().status))) {
        await marker.delete();
        throw new ApiError(409, 'You still have active orders. Complete or cancel them before deleting your account.');
      }
      if (uniqueDocs(quoteBuyer, quoteSeller).some(quote => !FINAL_QUOTES.has(quote.data().status))) {
        await marker.delete();
        throw new ApiError(409, 'You have outstanding custom-order requests. Contact support to close them before deleting your account.');
      }
      await purgePersonalData(db, uid);
      await auth.deleteUser(uid);
      await marker.set({ state: 'completed', completedAt: Timestamp.now() }).catch(() => {
        console.error('Account deletion marker completion could not be recorded');
      });
    } catch (error) {
      // For transient cleanup failures, keep the marker and permit a fresh
      // reauthentication and retry. Never remove it after partial cleanup.
      throw error;
    }
    return Response.json({ deleted: true }, { headers: NO_CACHE });
  } catch (error) {
    return safeResponse(error);
  }
}
