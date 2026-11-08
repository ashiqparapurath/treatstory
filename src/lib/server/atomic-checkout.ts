import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { CheckoutPayload, CheckoutLine } from '@/lib/checkout-schema';
import { ApiError } from '@/lib/server/firebase-admin';

type SellerRecord = {
  ownerUid?: string;
  businessName?: string;
  status?: string;
  isOpen?: boolean;
  accessEndsAt?: Timestamp;
  deliveryMethods?: string[];
  deliveryPincodes?: string[];
  deliveryFee?: number;
  deliverySlots?: string[];
  pickupAddress?: string;
  dailyOrderCapacity?: number;
  acceptanceHours?: number;
};
type Weight = { value: number; unit: string; price?: number; stockQuantity?: number };
type Listing = {
  name: string; sellerId: string; status: string; availability: string; price: number;
  showPrice: boolean; minimumOrderQuantity?: number; stockQuantity: number; preparationDays?: number;
  weightOptions?: Weight[];
};
type StockReservation = { productId: string; quantity: number; stockSource: 'product' | 'option' | 'none'; weight: Weight | null };
type Working = { listing: Listing; refPath: string; reservations: StockReservation[] };

function isoDateInIndia(now = Date.now()) {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}
function dateDifference(today: string, target: string) {
  const day = Date.parse(today + 'T00:00:00Z');
  const chosen = Date.parse(target + 'T00:00:00Z');
  if (!Number.isFinite(chosen) || new Date(chosen).toISOString().slice(0, 10) !== target) {
    throw new ApiError(400, 'Choose a valid delivery or pickup date.');
  }
  return Math.round((chosen - day) / 86_400_000);
}
function positiveNumber(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback;
}
function findWeight(product: Listing, choice: CheckoutLine['weight']) {
  const options = product.weightOptions ?? [];
  if (!options.length) {
    if (choice) throw new ApiError(409, 'This product no longer offers the selected size.');
    return null;
  }
  if (!choice) throw new ApiError(409, 'Select a size for each product.');
  const result = options.find(w => w.value === choice.value && w.unit === choice.unit);
  if (!result) throw new ApiError(409, 'The selected size is no longer offered.');
  return result;
}
function lineKey(line: CheckoutLine) {
  return JSON.stringify([line.productId, line.weight?.value ?? null, line.weight?.unit ?? null, line.customizationNote]);
}
function validValue(value: number) { return Number.isFinite(value) && value >= 0 && value <= 10000000; }

/**
 * One Firestore transaction creates a grouped checkout, its seller orders,
 * booking reservations and inventory changes. A checkout UUID is unique per
 * buyer and is persisted: retrying cannot double-charge or double-reserve.
 */
export async function placeAtomicCheckout(db: Firestore, uid: string, input: CheckoutPayload) {
  const today = isoDateInIndia();
  const dayOffset = dateDifference(today, input.requestedDate);
  if (dayOffset < 0 || dayOffset > 90) throw new ApiError(400, 'Choose a date from today through the next 90 days.');
  const uniqueLineKeys = new Set(input.lines.map(lineKey));
  if (uniqueLineKeys.size !== input.lines.length) throw new ApiError(400, 'Combine identical sizes and customizations into one order line.');
  const checkoutRef = db.collection('checkout_orders').doc(uid + '_' + input.checkoutId);
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const result = await db.runTransaction(async tx => {
    const prior = await tx.get(checkoutRef);
    if (prior.exists) {
      const original = prior.data()!;
      if (original.buyerUid !== uid || original.requestHash !== requestHash) {
        throw new ApiError(409, 'This checkout reference was already used. Refresh checkout to start a new order.');
      }
      return { checkoutId: input.checkoutId, orderIds: original.orderIds as string[], total: original.total as number, repeated: true };
    }
    const productIds = [...new Set(input.lines.map(l => l.productId))];
    const products = await Promise.all(productIds.map(id => tx.get(db.collection('marketplace_products').doc(id))));
    const working = new Map<string, Working>();
    for (const [idx, snap] of products.entries()) {
      if (!snap.exists) throw new ApiError(409, 'A selected product was removed. Review your shopping bag.');
      const p = snap.data() as Listing;
      if (p.status !== 'published' || p.availability === 'unavailable' || p.showPrice !== true) {
        throw new ApiError(409, p.name + ' is no longer available to order.');
      }
      working.set(productIds[idx], { listing: { ...p, weightOptions: p.weightOptions?.map(w => ({ ...w })) }, refPath: snap.ref.path, reservations: [] });
    }
    const sellerIds = [...new Set([...working.values()].map(x => x.listing.sellerId))];
    const sellers = await Promise.all(sellerIds.map(id => tx.get(db.collection('sellers').doc(id))));
    const storeById = new Map<string, SellerRecord>();
    const now = Timestamp.now();
    for (const [idx, snap] of sellers.entries()) {
      if (!snap.exists) throw new ApiError(409, 'A seller is no longer available.');
      const s = snap.data() as SellerRecord;
      if (s.status !== 'active' || !s.isOpen || !s.accessEndsAt?.toMillis || s.accessEndsAt.toMillis() <= now.toMillis()) {
        throw new ApiError(409, (s.businessName || 'A seller') + ' is not accepting new orders.');
      }
      if (s.deliveryMethods?.length && !s.deliveryMethods.includes(input.deliveryMode)) {
        throw new ApiError(409, (s.businessName || 'A seller') + ' does not offer the selected fulfillment method.');
      }
      if (input.deliveryMode === 'delivery' && s.deliveryPincodes?.length && !s.deliveryPincodes.includes(input.pincode || '')) {
        throw new ApiError(409, (s.businessName || 'A seller') + ' does not deliver to this PIN code.');
      }
      if (s.deliverySlots?.length && !s.deliverySlots.includes(input.requestedSlot)) {
        throw new ApiError(409, (s.businessName || 'A seller') + ' does not offer the chosen delivery slot.');
      }
      storeById.set(sellerIds[idx], s);
    }

    // Every document that might be written is read before the first write.
    const bookingRefs = sellerIds.map(id => db.collection('seller_bookings').doc(id + '_' + input.requestedDate));
    const bookings = await Promise.all(bookingRefs.map(ref => tx.get(ref)));
    const bookingsBySeller = new Map(sellerIds.map((id, i) => [id, {
      ref: bookingRefs[i], current: (bookings[i].data()?.count as number | undefined) ?? 0,
    }]));

    const pendingPrices: Array<{ lineIndex: number; productId: string; name: string; expected: number; current: number }> = [];
    const orders: Array<{ refId: string; record: Record<string, unknown> }> = [];
    let itemSubtotal = 0;
    const qtyBySeller = new Map<string, number>();
    const sellersWithDeliveryFee = new Set<string>();
    for (const [idx, line] of input.lines.entries()) {
      const work = working.get(line.productId)!;
      const p = work.listing;
      if (!Number.isInteger(line.quantity) || line.quantity < Math.max(1, p.minimumOrderQuantity || 1)) {
        throw new ApiError(400, `Order at least ${p.minimumOrderQuantity || 1} of ${p.name}.`);
      }
      if (dayOffset < (p.preparationDays || 0)) throw new ApiError(409, `${p.name} requires ${p.preparationDays} preparation days.`);
      const choice = findWeight(p, line.weight);
      const price = positiveNumber(choice?.price, p.price);
      if (!validValue(price)) throw new ApiError(409, 'A product price is invalid. Contact the seller.');
      if (price !== line.expectedPrice) pendingPrices.push({ lineIndex: idx, productId: line.productId, name: p.name, expected: line.expectedPrice, current: price });
      // For made-to-order products, only booking capacity is enforced.
      let source: StockReservation['stockSource'] = 'none';
      if (p.availability === 'available') {
        if (choice && Number.isInteger(choice.stockQuantity)) {
          if (choice.stockQuantity! < line.quantity) throw new ApiError(409, `${p.name}: insufficient stock for the selected size.`);
          choice.stockQuantity = choice.stockQuantity! - line.quantity;
          source = 'option';
        } else {
          if (!Number.isInteger(p.stockQuantity) || p.stockQuantity < line.quantity) {
            throw new ApiError(409, `${p.name}: only ${Math.max(0, p.stockQuantity || 0)} left in stock.`);
          }
          p.stockQuantity -= line.quantity;
          source = 'product';
        }
      }
      work.reservations.push({ productId: line.productId, quantity: line.quantity, stockSource: source, weight: choice ? { value: choice.value, unit: choice.unit } : null });
      qtyBySeller.set(p.sellerId, (qtyBySeller.get(p.sellerId) || 0) + 1);
      const seller = storeById.get(p.sellerId)!;
      // One delivery charge per seller per grouped checkout, not per product line.
      const fee = input.deliveryMode === 'delivery' && !sellersWithDeliveryFee.has(p.sellerId)
        ? positiveNumber(seller.deliveryFee) : 0;
      sellersWithDeliveryFee.add(p.sellerId);
      const amount = price * line.quantity;
      itemSubtotal += amount;
      const id = uid + '_' + input.checkoutId + '_' + idx;
      orders.push({ refId: id, record: {
        buyerUid: uid, sellerId: p.sellerId, checkoutId: input.checkoutId, productId: line.productId,
        productName: p.name, quantity: line.quantity, unitPrice: price, subtotal: amount,
        selectedWeight: choice ? { value: choice.value, unit: choice.unit } : null,
        stockReserved: source !== 'none', stockSource: source,
        customerName: input.customerName, customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress, customerNote: [line.customizationNote, input.customerNote].filter(Boolean).join('\n\n'),
        deliveryMode: input.deliveryMode, deliveryFee: fee,
        requestedDate: input.requestedDate, requestedSlot: input.requestedSlot,
        giftRecipient: input.giftRecipient, giftMessage: input.giftMessage,
        status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending',
        acceptanceDeadline: Timestamp.fromMillis(now.toMillis() + Math.min(72, Math.max(1, seller.acceptanceHours || 24)) * 3600000),
        cancellationRequest: null,
        history: [{ at: now, by: uid, action: 'placed' }],
        createdAt: now, updatedAt: now,
      } });
    }
    if (pendingPrices.length) throw new ApiError(409, 'Product prices changed. Review the latest prices before placing your order.', { priceChanges: pendingPrices });
    for (const id of sellerIds) {
      const seller = storeById.get(id)!;
      const booked = bookingsBySeller.get(id)!;
      if (seller.dailyOrderCapacity && booked.current + (qtyBySeller.get(id) || 0) > seller.dailyOrderCapacity) {
        throw new ApiError(409, (seller.businessName || 'A seller') + ' is fully booked for this date.');
      }
    }
    const deliveryTotal = orders.reduce((s, o) => s + (o.record.deliveryFee as number), 0);
    const total = itemSubtotal + deliveryTotal;
    if (!validValue(total)) throw new ApiError(400, 'Your order total exceeds the supported limit.');

    for (const [, work] of working) {
      if (work.reservations.some(x => x.stockSource !== 'none')) {
        tx.update(db.doc(work.refPath), { stockQuantity: work.listing.stockQuantity,
          weightOptions: work.listing.weightOptions || [], updatedAt: now });
      }
    }
    for (const id of sellerIds) {
      const booking = bookingsBySeller.get(id)!;
      tx.set(booking.ref, { sellerId: id, date: input.requestedDate,
        count: booking.current + (qtyBySeller.get(id) || 0), updatedAt: now });
    }
    for (const order of orders) tx.create(db.collection('seller_orders').doc(order.refId), order.record);
    // Private in-app alerts are transactionally created for both parties.
    for (const order of orders) {
      const sellerId = order.record.sellerId as string;
      const buyerAlert = db.collection('notifications').doc(uid).collection('items').doc();
      const sellerAlert = db.collection('notifications').doc(sellerId).collection('items').doc();
      tx.create(buyerAlert, { title: 'Your TreatStory order was placed', orderId: order.refId, createdAt: now, read: false });
      tx.create(sellerAlert, { title: 'You have a new order', orderId: order.refId, createdAt: now, read: false });
    }
    tx.create(checkoutRef, { buyerUid: uid, requestHash, orderIds: orders.map(x => x.refId),
      total, currency: 'INR', paymentMethod: 'cod', status: 'placed', createdAt: now });
    return { checkoutId: input.checkoutId, orderIds: orders.map(x => x.refId), total, repeated: false };
  }, { maxAttempts: 5 });
  return result;
}
