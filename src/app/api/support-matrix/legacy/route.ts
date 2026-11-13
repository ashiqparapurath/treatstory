import type { NextRequest } from 'next/server';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { publicSupportKeySchema } from '@/lib/support-key-schema';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { authorizedConversation, digest, matrixConfig, matrixService, matrixUserId, requireTrustedDevice, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function publicLegacyKey(value: Record<string, unknown> | undefined) {
  const result = publicSupportKeySchema.safeParse(value && { kty: value.kty, n: value.n, e: value.e, alg: value.alg, ext: value.ext, key_ops: value.key_ops });
  if (!result.success) throw new ApiError(409, 'Historical public-key metadata is damaged. Original records have not been changed.');
  return result.data;
}

async function context(request: NextRequest) {
  matrixConfig(); const { uid, db } = await verifiedUser(request); const admin = await supportRole(db, uid);
  const token = request.headers.get('x-matrix-token') ?? '';
  const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
  if (session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging session required.');
  await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
  return { uid, db, admin, deviceId: session.data()!.deviceId };
}
async function legacy(request: NextRequest, ticketId: string, roomId: string) {
  const ctx = await context(request);
  if (!ticketId || /[\/\\]/.test(ticketId)) throw new ApiError(400, 'Invalid legacy conversation.');
  const target = await authorizedConversation(ctx.db, ctx.uid, roomId);
  const source = await ctx.db.doc('support_tickets/' + ticketId).get();
  const ticket = source.data();
  if (!ticket?.encrypted || target.data().ownerUid !== ticket.ownerUid) throw new ApiError(403, 'History must stay with its original customer.');
  let role: 'owner' | 'team' = 'owner';
  if (ticket.ownerUid !== ctx.uid) {
    const original = await ctx.db.doc('support_chat_keys/' + (ticket.teamKeyVersion === 2 ? 'team_device' : 'team')).get();
    if (!ctx.admin || target.data().agentUid !== ctx.uid || (ticket.teamKeyVersion === 2 && original.data()?.createdBy !== ctx.uid)) throw new ApiError(403, 'Only the original authorized support identity can migrate this history.');
    role = 'team';
  }
  return { ...ctx, source, target, ticket, role };
}
export async function GET(request: NextRequest) {
  try {
    const ticketId = request.nextUrl.searchParams.get('ticketId');
    if (!ticketId) {
      const ctx = await context(request);
      const roomId = request.nextUrl.searchParams.get('roomId');
      const target = roomId ? await authorizedConversation(ctx.db, ctx.uid, roomId) : null;
      const ownerUid = target?.data().ownerUid ?? ctx.uid;
      const after = request.nextUrl.searchParams.get('listAfter');
      if (after && /[\/\\]/.test(after)) throw new ApiError(400, 'Invalid history-list cursor.');
      let query = ctx.db.collection('support_tickets').where('ownerUid', '==', ownerUid).where('encrypted', '==', true).orderBy(FieldPath.documentId()).limit(100);
      if (after) query = query.startAfter(after);
      const [tickets, ownKey, teamDevice] = await Promise.all([query.get(), ctx.db.doc('support_chat_keys/user_' + ctx.uid).get(), ctx.db.doc('support_chat_keys/team_device').get()]);
      const own = ownerUid === ctx.uid;
      const visible = tickets.docs.filter(doc => own || (ctx.admin && target?.data().agentUid === ctx.uid && (doc.data().teamKeyVersion !== 2 || teamDevice.data()?.createdBy === ctx.uid)));
      return Response.json({ tickets: visible.map(doc => ({ id: doc.id, category: doc.data().category, orderId: doc.data().orderId, status: doc.data().status, createdAt: doc.data().createdAt?.toMillis(), requiresPassphrase: own ? ownKey.data()?.version === 1 : doc.data().teamKeyVersion !== 2 })), next: tickets.size === 100 ? tickets.docs.at(-1)!.id : null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const ctx = await legacy(request, ticketId, request.nextUrl.searchParams.get('roomId') ?? '');
    const cursor = request.nextUrl.searchParams.get('cursor');
    if (cursor && /[\/\\]/.test(cursor)) throw new ApiError(400, 'Invalid migration cursor.');
    let query = ctx.source.ref.collection('messages').orderBy(FieldPath.documentId()).limit(20);
    if (cursor) query = query.startAfter(cursor);
    const messages = await query.get();
    const output = [];
    for (const doc of messages.docs) {
      const receipt = await ctx.target.ref.collection('migration').doc(digest(ticketId + ':' + doc.id)).get();
      output.push({ id: doc.id, ciphertext: doc.data().ciphertext, iv: doc.data().iv, ownerKey: doc.data().ownerKey, teamKey: doc.data().teamKey, version: doc.data().version, senderUid: doc.data().senderUid, createdAt: doc.data().createdAt?.toMillis(), migrated: receipt.exists && receipt.data()?.status !== 'pending' });
    }
    const oldKey = ctx.role === 'owner' ? 'user_' + ctx.uid : ctx.ticket.teamKeyVersion === 2 ? 'team_device' : 'team';
    const key = (await ctx.db.doc('support_chat_keys/' + oldKey).get()).data();
    return Response.json({ source: { ticketId, ownerUid: ctx.ticket.ownerUid, category: ctx.ticket.category, orderId: ctx.ticket.orderId ?? '', status: ctx.ticket.status, createdAt: ctx.ticket.createdAt?.toMillis(), updatedAt: ctx.ticket.updatedAt?.toMillis() }, messages: output, role: ctx.role, publicKey: publicLegacyKey(ctx.role === 'owner' ? ctx.ticket.ownerPublicKey : ctx.ticket.teamPublicKey),
      // Only the original passphrase-wrapped legacy record; never a plaintext private key.
      lockedKey: key?.version === 1 ? { publicKey: publicLegacyKey(key.publicKey), version: 1, lockedPrivateKey: key.lockedPrivateKey, salt: key.salt, iv: key.iv } : null, next: messages.size === 20 ? messages.docs.at(-1)!.id : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const data = z.object({ action: z.enum(['reserve','commit']), ticketId: z.string().max(160), roomId: z.string().max(255), messageId: z.string().max(160), eventId: z.string().max(255).optional() }).strict().parse(await readJsonBody(request, 2048));
    const ctx = await legacy(request, data.ticketId, data.roomId);
    if (/[\/\\]/.test(data.messageId)) throw new ApiError(400, 'Invalid source message.');
    const source = await ctx.source.ref.collection('messages').doc(data.messageId).get();
    if (!source.exists) throw new ApiError(404, 'Source message unavailable.');
    const journal = ctx.target.ref.collection('migration').doc(digest(data.ticketId + ':' + data.messageId));
    const sourceHash = digest(JSON.stringify(source.data()));
    if (data.action === 'reserve') {
      const skip = await ctx.db.runTransaction(async tx => {
        const current = await tx.get(journal);
        if (current.exists && current.data()?.status !== 'pending') return true;
        if (current.exists && (current.data()?.deviceId !== ctx.deviceId || current.data()?.actorUid !== ctx.uid)) throw new ApiError(409, 'Resume this history import on the device that started it. No original data was changed.');
        tx.set(journal, { status: 'pending', ticketId: data.ticketId, messageId: data.messageId, deviceId: ctx.deviceId, actorUid: ctx.uid, sourceHash, createdAt: Timestamp.now() });
        return false;
      });
      return Response.json({ skip });
    }
    if (!data.eventId) throw new ApiError(400, 'An encrypted target event is required.');
    const event = await matrixService('/_matrix/client/v3/rooms/' + encodeURIComponent(data.roomId) + '/event/' + encodeURIComponent(data.eventId));
    if (event.type !== 'm.room.encrypted' || event.sender !== matrixUserId(ctx.uid, matrixConfig().domain)) throw new ApiError(400, 'Migration target must be an encrypted event from this account.');
    await ctx.db.runTransaction(async tx => {
      const current = await tx.get(journal);
      if (current.exists && current.data()?.status !== 'pending') return;
      if (!current.exists || (current.data()?.deviceId !== ctx.deviceId || current.data()?.actorUid !== ctx.uid) || current.data()?.sourceHash !== sourceHash) throw new ApiError(409, 'Migration reservation changed.');
      tx.set(journal, { status: 'complete', deviceId: ctx.deviceId, ticketId: data.ticketId, messageId: data.messageId, eventId: data.eventId, actorUid: ctx.uid,
        sourceHash, createdAt: Timestamp.now() });
    });
    return Response.json({ ok: true });
  } catch (error) { return safeResponse(error instanceof z.ZodError ? new ApiError(400, 'Invalid migration receipt.') : error); }
}
