import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { authorizedConversation, digest, matrixConfig, matrixService, matrixUserId, requireTrustedDevice, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const config = matrixConfig(); const { uid, db } = await verifiedUser(request); await supportRole(db, uid);
    const token = request.headers.get('x-matrix-token') ?? '';
    const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
    if (session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging session required.');
    await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
    const data = z.object({ action: z.enum(['reserve','commit']), roomId: z.string().max(255), agentUid: z.string().max(128), sourceEventId: z.string().max(255), eventId: z.string().max(255).optional() }).strict().parse(await readJsonBody(request, 2048));
    const ticket = await authorizedConversation(db, uid, data.roomId);
    if (ticket.data().ownerUid !== uid || ticket.data().agentUid !== data.agentUid || ticket.data().status !== 'open') throw new ApiError(403, 'Only the conversation owner can share history with the current assigned agent.');
    const source = await matrixService('/_matrix/client/v3/rooms/' + encodeURIComponent(data.roomId) + '/event/' + encodeURIComponent(data.sourceEventId));
    if (source.type !== 'm.room.encrypted') throw new ApiError(400, 'Only encrypted conversation history can be transferred.');
    const ref = ticket.ref.collection('transfers').doc(digest(data.agentUid + ':' + data.sourceEventId));
    const deviceId = session.data()!.deviceId;
    if (data.action === 'reserve') {
      const skip = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.data()?.status === 'complete') return true;
        if (existing.exists && (existing.data()?.deviceId !== deviceId || existing.data()?.actorUid !== uid)) throw new ApiError(409, 'Resume history sharing on the device that started it.');
        tx.set(ref, { status: 'pending', sourceEventId: data.sourceEventId, agentUid: data.agentUid, deviceId, actorUid: uid, createdAt: Timestamp.now() });
        return false;
      });
      return Response.json({ skip });
    }
    if (!data.eventId) throw new ApiError(400, 'Encrypted target event required.');
    const target = await matrixService('/_matrix/client/v3/rooms/' + encodeURIComponent(data.roomId) + '/event/' + encodeURIComponent(data.eventId));
    if (target.type !== 'm.room.encrypted' || target.sender !== matrixUserId(uid, config.domain)) throw new ApiError(400, 'Invalid encrypted transfer event.');
    await db.runTransaction(async tx => {
      const [existing, current] = await Promise.all([tx.get(ref), tx.get(ticket.ref)]);
      if (current.data()?.agentUid !== data.agentUid) throw new ApiError(409, 'Conversation assignment changed.');
      if (existing.data()?.status === 'complete') return;
      if (existing.data()?.deviceId !== deviceId || existing.data()?.actorUid !== uid) throw new ApiError(409, 'Transfer reservation changed.');
      tx.update(ref, { status: 'complete', eventId: data.eventId, sourceHash: digest(JSON.stringify(source)), completedAt: Timestamp.now() });
      tx.create(db.collection('support_matrix_audit').doc(), { action: 'history_transferred', actorUid: uid, conversationId: ticket.id, sourceEventId: data.sourceEventId, agentUid: data.agentUid, createdAt: Timestamp.now() });
    });
    return Response.json({ ok: true });
  } catch (error) { return safeResponse(error instanceof z.ZodError ? new ApiError(400, 'Invalid history transfer.') : error); }
}
