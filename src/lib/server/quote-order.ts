import {
  Timestamp,
  type Firestore,
  type Transaction,
  type DocumentReference,
  type DocumentData,
} from 'firebase-admin/firestore';
import type { QuoteFulfillment } from '../quote-checkout-schema';
import { ApiError } from './firebase-admin';
import { orderReference } from './order-email';
import { queueNotification } from './mail';
/** Called inside the quote transaction, before any writes. One quote reserves one order. */
export async function convertQuote(
  tx: Transaction,
  db: Firestore,
  uid: string,
  ref: DocumentReference,
  q: DocumentData,
  seller: DocumentData,
  input: QuoteFulfillment,
) {
  if (q.buyerUid !== uid)
    throw new ApiError(403, 'Only the buyer can place this order.');
  if (q.orderId)
    return { id: ref.id, status: q.status, orderId: q.orderId, repeated: true };
  if (
    q.status !== 'quoted' ||
    !q.expiresAt?.toMillis ||
    q.expiresAt.toMillis() <= Date.now()
  )
    throw new ApiError(409, 'Quote expired or unavailable.');
  if (
    seller.status !== 'active' ||
    !seller.isOpen ||
    !seller.accessEndsAt?.toMillis ||
    seller.accessEndsAt.toMillis() <= Date.now()
  )
    throw new ApiError(409, 'Seller unavailable.');
  if (
    seller.businessCategory === 'home-bakery' &&
    (!seller.foodLicenseVerifiedUntil?.toMillis ||
      seller.foodLicenseVerifiedUntil.toMillis() <= Date.now())
  )
    throw new ApiError(
      409,
      'Food license verification is required before ordering.',
    );
  const orderId = 'quote_' + ref.id;
  if (q.orderId)
    return { id: ref.id, status: q.status, orderId: q.orderId, repeated: true };
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const offset =
    (Date.parse(q.requestedDate + 'T00:00:00Z') -
      Date.parse(today + 'T00:00:00Z')) /
    86400000;
  if (!Number.isFinite(offset) || offset < 0 || offset > 90)
    throw new ApiError(
      409,
      'The requested date is no longer available. Request a new quote.',
    );
  if (
    seller.deliveryMethods?.length &&
    !seller.deliveryMethods.includes(input.deliveryMode)
  )
    throw new ApiError(409, 'Choose a supported delivery method.');
  if (
    input.deliveryMode === 'delivery' &&
    seller.deliveryPincodes?.length &&
    !seller.deliveryPincodes.includes(input.pincode)
  )
    throw new ApiError(409, 'This seller does not deliver to that PIN code.');
  if (
    seller.deliverySlots?.length &&
    !seller.deliverySlots.includes(input.requestedSlot)
  )
    throw new ApiError(409, 'Choose an available time slot.');
  const fee = input.deliveryMode === 'delivery' ? seller.deliveryFee || 0 : 0;
  const total = q.quotedPrice + fee;
  if (
    !Number.isFinite(total) ||
    q.quotedPrice <= 0 ||
    fee < 0 ||
    total > 10000000 ||
    input.expectedTotal !== total
  )
    throw new ApiError(
      409,
      'The total changed. Review the quote and delivery fee.',
    );
  const bookingRef = db.doc(
    'seller_bookings/' + q.sellerId + '_' + q.requestedDate,
  );
  const productRef = q.productId
    ? db.doc('marketplace_products/' + q.productId)
    : null;
  const [booking, product, buyerDeletion, sellerDeletion] = await Promise.all([
    tx.get(bookingRef),
    productRef ? tx.get(productRef) : Promise.resolve(null),
    tx.get(db.doc('account_deletions/' + uid)),
    tx.get(db.doc('account_deletions/' + q.sellerId)),
  ]);
  if (buyerDeletion.exists || sellerDeletion.exists)
    throw new ApiError(409, 'An account is closing.');
  const count = booking.data()?.count || 0;
  if (seller.dailyOrderCapacity && count >= seller.dailyOrderCapacity)
    throw new ApiError(409, 'This creator is fully booked on that date.');
  const p = product?.data();
  let stockSource: 'none' | 'product' | 'option' = 'none';
  let options = p?.weightOptions?.map((w: DocumentData) => ({ ...w }));
  if (productRef) {
    if (
      !p ||
      p.sellerId !== q.sellerId ||
      p.status !== 'published' ||
      p.availability === 'unavailable'
    )
      throw new ApiError(409, 'The referenced product is unavailable.');
    if (p.advancePaymentRequired)
      throw new ApiError(
        409,
        'This product requires seller-arranged advance payment. Use its normal checkout or request a separate COD custom creation.',
      );
    if (offset < (p.preparationDays || 0))
      throw new ApiError(409, 'This product needs more preparation time.');
    if (options?.length) {
      const selected = options.find(
        (w: DocumentData) =>
          w.value === input.weight?.value && w.unit === input.weight?.unit,
      );
      if (!selected) throw new ApiError(400, 'Choose a product size.');
      if (
        p.availability === 'available' &&
        Number.isInteger(selected.stockQuantity)
      ) {
        if (selected.stockQuantity < 1)
          throw new ApiError(409, 'This size is out of stock.');
        selected.stockQuantity--;
        stockSource = 'option';
      }
    } else if (input.weight)
      throw new ApiError(409, 'The product sizes changed.');
    if (p.availability === 'available' && stockSource === 'none') {
      if (!Number.isInteger(p.stockQuantity) || p.stockQuantity < 1)
        throw new ApiError(409, 'This product is out of stock.');
      stockSource = 'product';
    }
  }
  const now = Timestamp.now();
  if (productRef && stockSource === 'option')
    tx.update(productRef, { weightOptions: options, updatedAt: now });
  if (productRef && stockSource === 'product')
    tx.update(productRef, {
      stockQuantity: p!.stockQuantity - 1,
      updatedAt: now,
    });
  tx.set(bookingRef, {
    sellerId: q.sellerId,
    date: q.requestedDate,
    count: count + 1,
    updatedAt: now,
  });
  tx.create(db.doc('seller_orders/' + orderId), {
    orderReference: orderReference(orderId),
    quoteId: ref.id,
    buyerUid: uid,
    sellerId: q.sellerId,
    productId: q.productId || 'custom_' + ref.id,
    productName: q.productName || q.occasion,
    quantity: 1,
    unitPrice: q.quotedPrice,
    subtotal: q.quotedPrice,
    deliveryFee: fee,
    selectedWeight: input.weight,
    stockReserved: stockSource !== 'none',
    stockSource,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    deliveryAddress: input.deliveryAddress,
    customerNote: q.description + '\n' + q.quotedNote,
    deliveryMode: input.deliveryMode,
    requestedDate: q.requestedDate,
    requestedSlot: input.requestedSlot,
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    acceptanceDeadline: Timestamp.fromMillis(
      now.toMillis() +
        Math.min(72, Math.max(1, seller.acceptanceHours || 24)) * 3600000,
    ),
    cancellationRequest: null,
    history: [{ at: now, by: uid, action: 'placed' }],
    createdAt: now,
    updatedAt: now,
  });
  tx.update(ref, {
    status: 'accepted',
    orderId,
    acceptedAt: now,
    updatedAt: now,
  });
  for (const recipient of [uid, q.sellerId])
    queueNotification(tx, db, recipient, {
      title: 'Custom order placed',
      message: `${q.productName || q.occasion}: order ${orderReference(orderId)} is ready for seller confirmation. Payment is due on delivery or pickup.`,
      href: '/orders',
      kind: 'order',
      orderId,
      createdAt: now,
      read: false,
    });
  return { id: ref.id, status: 'accepted', orderId, total };
}
