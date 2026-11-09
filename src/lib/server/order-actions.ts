import { queueMail, type MailTemplate } from '@/lib/server/mail';
import { orderFeedback } from '@/lib/order-feedback';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { ApiError } from '@/lib/server/firebase-admin';

export type OrderAction = 'accepted' | 'rejected' | 'preparing' | 'ready' | 'out-for-delivery' | 'completed' |
  'cancelled' | 'request-cancellation' | 'decline-cancellation' | 'cod-collected';

const allowed: Record<string, string[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out-for-delivery', 'completed', 'cancelled'],
  'out-for-delivery': ['completed'],
  completed: [], rejected: [], cancelled: [],
};
type OrderInfo = {
  buyerUid: string; sellerId: string; productId: string; status: string; productName?: string; deliveryMode?: string;
  quantity: number; stockSource?: 'product' | 'option' | 'none';
  stockReserved?: boolean; stockReleasedAt?: Timestamp; bookingReleasedAt?: Timestamp;
  selectedWeight?: {value: number; unit: string}|null;
  requestedDate?: string;
  cancellationRequest?: { reason: string; requestedAt: Timestamp }|null;
  history?: Array<{ at: Timestamp; by: string; action: string; note?: string }>;
  paymentStatus?: string;
};
export async function applyOrderAction(db: Firestore, uid: string, orderId: string, action: OrderAction, reason = '') {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(orderId)) throw new ApiError(400, 'Invalid order identifier.');
  const orderRef = db.collection('seller_orders').doc(orderId);
  return db.runTransaction(async (tx: Transaction) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new ApiError(404, 'Order not found.');
    const order = orderSnap.data() as OrderInfo;
    const isBuyer = order.buyerUid === uid;
    const isSeller = order.sellerId === uid;
    const adminSnap = await tx.get(db.collection('roles_admin').doc(uid));
    const isAdmin = adminSnap.exists;
    if (!isBuyer && !isSeller && !isAdmin) throw new ApiError(403, 'You cannot manage this order.');

    const now = Timestamp.now();
    const event = { at: now, by: uid, action, ...(reason ? { note: reason } : {}) };
    const history = [...(order.history || []).slice(-29), event];
    const notify = (receiver: string, event: string) => {
      const text=orderFeedback(event,order.productName,order.deliveryMode,receiver===order.buyerUid?'buyer':'seller');
      const templates:Record<string,MailTemplate>={accepted:'order_accepted',preparing:'order_preparing',ready:order.deliveryMode==='pickup'?'order_ready_pickup':'order_ready_delivery','out-for-delivery':'order_out_for_delivery',completed:order.deliveryMode==='pickup'?'order_collected':'order_delivered',rejected:'order_declined',cancelled:'order_cancelled','request-cancellation':'order_cancel_requested','decline-cancellation':'order_cancel_declined','cod-collected':'payment_recorded'};
      queueMail(tx,db,receiver,{template:templates[event]||'update',title:text.title,message:text.description,href:'/orders'});
      const ref = db.collection('notifications').doc(receiver).collection('items').doc();
      tx.create(ref, {title:text.title,message:text.description,kind:'order',href:'/orders',orderId,createdAt:now,read:false});
    };

    if (action === 'request-cancellation') {
      if (!isBuyer || ['completed','cancelled','rejected','out-for-delivery'].includes(order.status))
        throw new ApiError(409, 'This order cannot be cancelled through a request.');
      if (reason.trim().length < 5 || reason.trim().length > 300) throw new ApiError(400, 'Provide a reason between 5 and 300 characters.');
      if (order.cancellationRequest) throw new ApiError(409, 'You already requested cancellation.');
      tx.update(orderRef, { cancellationRequest: { reason: reason.trim(), requestedAt: now }, updatedAt: now, history });
      notify(order.sellerId, 'request-cancellation');
      return { status: order.status, action, orderId };
    }
    if (action === 'decline-cancellation') {
      if (!isSeller && !isAdmin) throw new ApiError(403, 'Only the seller can respond to cancellation requests.');
      if (!order.cancellationRequest) throw new ApiError(409, 'No cancellation request is pending.');
      tx.update(orderRef, { cancellationRequest: null, updatedAt: now, history });
      notify(order.buyerUid, 'decline-cancellation');
      return { status: order.status, action, orderId };
    }
    if (action === 'cod-collected') {
      if (!isSeller && !isAdmin) throw new ApiError(403, 'Only a seller or administrator can record payment.');
      if (order.status !== 'completed') throw new ApiError(409, 'Complete the order before recording COD collection.');
      if (order.paymentStatus === 'collected') return { status: order.status, action, orderId };
      tx.update(orderRef, { paymentStatus: 'collected', paymentCollectedAt: now, updatedAt: now, history });
      notify(order.buyerUid, 'cod-collected');
      return { status: order.status, action, orderId };
    }
    if (!isSeller && !isAdmin) throw new ApiError(403, 'Only the seller can change fulfillment status.');
    if (!allowed[order.status]?.includes(action)) throw new ApiError(409, 'This status change is no longer available. Refresh the order.');
    if (action === 'cancelled' && !order.cancellationRequest && !reason.trim()) {
      throw new ApiError(400, 'Provide a reason for cancelling this order.');
    }

    // Every involved document is fetched before any transactional write.
    const willRelease = (action === 'rejected' || action === 'cancelled');
    const productRef = db.collection('marketplace_products').doc(order.productId);
    const bookingRef = order.requestedDate ? db.collection('seller_bookings').doc(order.sellerId + '_' + order.requestedDate) : null;
    const [productSnap, bookingSnap] = willRelease ? await Promise.all([
      order.stockReserved && !order.stockReleasedAt ? tx.get(productRef) : Promise.resolve(null),
      bookingRef && !order.bookingReleasedAt ? tx.get(bookingRef) : Promise.resolve(null),
    ]) : [null, null];

    let needsInventoryReview = false;
    if (productSnap?.exists && order.stockReserved && !order.stockReleasedAt) {
      const p = productSnap.data() as { stockQuantity?: number; weightOptions?: Array<{value:number;unit:string;stockQuantity?:number}> };
      if (order.stockSource === 'option') {
        const options = (p.weightOptions || []).map(o => ({ ...o }));
        const selected = options.find(o => o.value === order.selectedWeight?.value && o.unit === order.selectedWeight?.unit);
        if (selected && Number.isInteger(selected.stockQuantity)) {
          selected.stockQuantity = selected.stockQuantity! + order.quantity;
          tx.update(productRef, { weightOptions: options, updatedAt: now });
        } else { needsInventoryReview = true; }
      } else if (order.stockSource === 'product') {
        tx.update(productRef, { stockQuantity: (p.stockQuantity || 0) + order.quantity, updatedAt: now });
      }
    } else if (willRelease && order.stockReserved && !order.stockReleasedAt && !productSnap?.exists) {
      needsInventoryReview = true;
    }
    if (bookingSnap?.exists && bookingRef && !order.bookingReleasedAt) {
      const booked = bookingSnap.data()?.count as number | undefined;
      tx.update(bookingRef, { count: Math.max(0, (booked || 0) - 1), updatedAt: now });
    }

    tx.update(orderRef, {
      status: action,
      updatedAt: now,
      history,
      ...(willRelease ? {
        stockReleasedAt: now, bookingReleasedAt: now, cancellationRequest: null,
        inventoryReleaseReview: needsInventoryReview,
      } : {}),
    });
    notify(order.buyerUid, action);
    return { status: action, action, orderId, inventoryReleaseReview: needsInventoryReview };
  }, { maxAttempts: 5 });
}
