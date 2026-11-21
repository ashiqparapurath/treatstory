import { firestoreDocumentId } from '@/lib/document-id';
import { readJsonBody } from '@/lib/server/request-body';
import { queueNotification, queueMail, processMailQueue } from '@/lib/server/mail';
import { after } from 'next/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    subject: z.string().trim().min(5).max(140),
    category: z.enum(['order','delivery','payment','seller','account','other']),
    message: z.string().trim().min(15).max(2000),
    orderId: z.union([z.literal(''),firestoreDocumentId(160)]).default(''),
    sellerId: z.union([z.literal(''),firestoreDocumentId(128)]).default(''),
  }).strict(),
  z.object({
    action: z.literal('reply'), ticketId: firestoreDocumentId(160),
    message: z.string().trim().min(5).max(2000),
  }).strict(),
  z.object({
    action: z.literal('followup'), ticketId: firestoreDocumentId(160),
    message: z.string().trim().min(5).max(2000),
  }).strict(),
  z.object({ action: z.literal('close'), ticketId: firestoreDocumentId(160) }).strict(),
]);

function sendQueuedMail(db: Parameters<typeof processMailQueue>[0], auth: Parameters<typeof processMailQueue>[1]) {
  after(async () => {
    try { await processMailQueue(db, auth, 3); }
    catch { console.error('Mail queue processing unavailable'); }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { uid, db, auth } = await verifiedUser(request);
    if (Number(request.headers.get('content-length') || 0) > 5000)
      throw new ApiError(413, 'Support message is too large.');
    const parsed = requestSchema.safeParse(await readJsonBody(request, 5000));
    if (!parsed.success) throw new ApiError(400, 'Review the support details.');
    const data = parsed.data;

    if (data.action === 'create') {
      const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const result = await db.runTransaction(async tx => {
        const quotaRef = db.collection('support_limits').doc(uid + '_' + date);
        const orderRef = data.orderId ? db.collection('seller_orders').doc(data.orderId) : null;
        const selfSellerRef = db.doc('sellers/' + uid);
        const targetSellerRef = data.sellerId ? db.doc('sellers/' + data.sellerId) : null;
        const [quota, order, selfSeller, targetSeller] = await Promise.all([
          tx.get(quotaRef),
          orderRef ? tx.get(orderRef) : Promise.resolve(null),
          tx.get(selfSellerRef),
          targetSellerRef ? tx.get(targetSellerRef) : Promise.resolve(null),
        ]);
        if ((quota.data()?.count || 0) >= 5)
          throw new ApiError(429, 'You have reached the daily support request limit.');

        // Buyer-to-seller messages require an active, server-verified destination.
        // Sellers contacting TreatStory admin do not supply a target seller ID.
        const route = data.sellerId ? 'seller' : 'admin';
        if (route === 'admin' && !selfSeller.exists)
          throw new ApiError(400, 'Choose a seller to contact from their store page.');
        if (route === 'seller' && (
          data.sellerId === uid || !targetSeller?.exists || targetSeller.data()?.status !== 'active'
        )) throw new ApiError(404, 'This seller is not available for messages.');

        if (orderRef && (!order?.exists || (route === 'seller'
          ? order.data()?.buyerUid !== uid || order.data()?.sellerId !== data.sellerId
          : ![order.data()?.buyerUid, order.data()?.sellerId].includes(uid))))
          throw new ApiError(403, 'This order is not available for this conversation.');

        const ref = db.collection('support_tickets').doc();
        const now = Timestamp.now();
        const sellerName = route === 'seller'
          ? String(targetSeller?.data()?.businessName || 'Seller').slice(0, 120)
          : '';
        tx.create(ref, {
          ownerUid: uid, route,
          ...(route === 'seller' ? { sellerId: data.sellerId, sellerName } : {}),
          subject: data.subject, category: data.category, orderId: data.orderId,
          message: data.message, status: 'open', response: '',
          createdAt: now, updatedAt: now,
        });
        tx.set(quotaRef, { ownerUid: uid, date, count: (quota.data()?.count || 0) + 1, updatedAt: now });

        if (route === 'seller') {
          queueNotification(tx, db, data.sellerId, {
            template: 'support_new',
            title: 'New customer message',
            message: 'A customer sent a message about “' + data.subject + '”. Open your seller inbox to respond.',
            href: '/seller/messages', kind: 'support', createdAt: now, read: false,
          });
        } else if (process.env.MAIL_SUPPORT_EMAIL) {
          queueMail(tx, db, uid, {
            template: 'support_new', title: 'New seller support request',
            message: 'A seller submitted “' + data.subject + '”. Review it in the admin support inbox.',
            href: '/admin?tab=support',
          }, undefined, false, process.env.MAIL_SUPPORT_EMAIL);
        }
        queueNotification(tx, db, uid, {
          template: 'support_received',
          title: route === 'seller' ? 'Message sent to seller' : 'Support request received',
          message: 'We received “' + data.subject + '”. Open your conversations to see replies.',
          href: '/support', kind: 'support', createdAt: now, read: false,
        });
        return { ticketId: ref.id, status: 'open' };
      });
      sendQueuedMail(db, auth);
      return Response.json(result);
    }

    const adminRef = db.collection('roles_admin').doc(uid);
    const sellerRef = db.doc('sellers/' + uid);
    const result = await db.runTransaction(async tx => {
      const ticketRef = db.collection('support_tickets').doc(data.ticketId);
      const [admin, seller, ticket] = await Promise.all([
        tx.get(adminRef), tx.get(sellerRef), tx.get(ticketRef),
      ]);
      if (!ticket.exists) throw new ApiError(404, 'This conversation is unavailable.');
      const previous = ticket.data()!;
      const route = previous.route === 'seller' ? 'seller' : 'admin';
      if (data.action === 'followup') {
        if (previous.ownerUid !== uid)
          throw new ApiError(403, 'You cannot respond to this support request.');
      } else if (route === 'seller') {
        if (previous.sellerId !== uid || !seller.exists || (seller.data()?.ownerUid && seller.data()?.ownerUid !== uid))
          throw new ApiError(403, 'This customer conversation belongs to another seller.');
      } else if (!admin.exists) {
        throw new ApiError(403, 'Administrator access required.');
      }
      if (previous.encrypted === true)
        throw new ApiError(403, 'Encrypted conversations are not available through the ticket API.');
      if (previous.status === 'closed')
        throw new ApiError(409, 'This request is already closed.');

      const now = Timestamp.now();
      if (data.action === 'close') {
        tx.update(ticketRef, { status: 'closed', updatedAt: now });
        queueNotification(tx, db, previous.ownerUid, {
          template: 'support_closed', title: 'Your conversation was closed',
          message: '“' + previous.subject + '” was marked closed. Start a new conversation if you need more help.',
          kind: 'support', href: '/support', orderId: previous.orderId || '',
          createdAt: now, read: false,
        });
        return { ticketId: data.ticketId, status: 'closed' };
      }

      // Preserve older single-response records while appending new messages.
      const history = Array.isArray(previous.thread) ? [...previous.thread] : [];
      if (!history.length && typeof previous.response === 'string' && previous.response.trim()) {
        history.push({
          id: 'legacy-support-response', sender: 'support', body: previous.response,
          sentAt: previous.updatedAt || previous.createdAt || now,
        });
      }
      if (history.length >= 80)
        throw new ApiError(409, 'This conversation has reached its message limit. Please start a new support request.');
      history.push({
        id: randomUUID(), sender: data.action === 'reply' ? 'support' : 'customer',
        body: data.message, sentAt: now,
      });
      const status = data.action === 'reply' ? 'responded' : 'open';
      tx.update(ticketRef, {
        status, thread: history, updatedAt: now,
        ...(data.action === 'reply' ? { response: data.message, respondedBy: uid } : {}),
      });
      if (data.action === 'reply') {
        queueNotification(tx, db, previous.ownerUid, {
          template: 'support_reply',
          title: route === 'seller' ? 'Seller replied to your message' : 'TreatStory support replied to your request',
          message: 'There is a response to “' + previous.subject + '”. Open your conversation to read it.',
          kind: 'support', href: '/support', orderId: previous.orderId || '',
          createdAt: now, read: false,
        });
      } else if (route === 'seller') {
        queueNotification(tx, db, previous.sellerId, {
          template: 'support_new',
          title: 'Customer replied to your message',
          message: 'There is a new reply about “' + previous.subject + '”. Open your seller inbox.',
          href: '/seller/messages', kind: 'support', createdAt: now, read: false,
        });
      } else if (process.env.MAIL_SUPPORT_EMAIL) {
        queueMail(tx, db, uid, {
          template: 'support_new', title: 'Seller support request updated',
          message: 'A seller followed up on “' + previous.subject + '”. Open the admin inbox.',
          href: '/admin?tab=support',
        }, undefined, false, process.env.MAIL_SUPPORT_EMAIL);
      }
      return { ticketId: data.ticketId, status };
    });
    sendQueuedMail(db, auth);
    return Response.json(result);
  } catch (error) {
    return safeResponse(error);
  }
}
