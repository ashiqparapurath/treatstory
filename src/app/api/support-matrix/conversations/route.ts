import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { authorizedConversation, availableAgents, digest, matrixConfig, matrixService, matrixUserId, requireTrustedDevice, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uidSchema = z.string().min(1).max(128).refine(value => !/[\/\\\x00-\x1f]/.test(value) && value !== '.' && value !== '..');
const roomSchema = z.string().min(1).max(255);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), requestId: z.string().uuid(), agentUid: uidSchema, category: z.enum(['order','delivery','payment','seller','account','other']), orderId: z.string().max(160).default('') }).strict(),
  z.object({ action: z.literal('reassign'), roomId: roomSchema, agentUid: uidSchema }).strict(),
  z.object({ action: z.enum(['close','reopen']), roomId: roomSchema }).strict(),
]);
export async function GET(request: NextRequest) {
  try {
    const config = matrixConfig();
    const { uid, db } = await verifiedUser(request);
    const agent = await supportRole(db, uid);
    const agentsOnly = request.nextUrl.searchParams.get('agentsOnly') === '1';
    const [own, assigned, agents] = await Promise.all([
      agentsOnly ? null : db.collection('support_matrix_conversations').where('ownerUid', '==', uid).orderBy('updatedAt', 'desc').limit(100).get(),
      agent && !agentsOnly ? db.collection('support_matrix_conversations').where('agentUid', '==', uid).orderBy('updatedAt', 'desc').limit(100).get() : null,
      availableAgents(db),
    ]);
    const tickets = [...new Map([...(own?.docs ?? []), ...(assigned?.docs ?? [])].map(doc => [doc.id, doc])).values()]
      .filter(doc => doc.data().status !== 'provisioning').map(doc => ({ id: doc.id, ...doc.data(),
        ownerUserId: matrixUserId(doc.data().ownerUid, config.domain), agentUserId: matrixUserId(doc.data().agentUid, config.domain),
        createdAt: doc.data().createdAt?.toMillis(), updatedAt: doc.data().updatedAt?.toMillis(),
      }));
    return Response.json({ tickets, agents: agents.filter(agent => agent.uid !== uid) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const config = matrixConfig();
    const { uid, db, auth } = await verifiedUser(request);
    await supportRole(db, uid);
    const token = request.headers.get('x-matrix-token') ?? '';
    const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
    if (session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging session required.');
    await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
    const data = action.parse(await readJsonBody(request, 2048));
    const now = Timestamp.now();
    if (data.action === 'create') {
      if (data.agentUid === uid) throw new ApiError(400, 'Choose another support agent.');
      const [role, agent] = await Promise.all([db.doc('roles_admin/' + data.agentUid).get(), db.doc('support_matrix_accounts/' + data.agentUid).get()]);
      if (!role.exists || !agent.data()?.agent || !agent.data()?.masterKey) throw new ApiError(409, 'This support agent has not finished secure setup.');
      if (data.orderId) {
        if (/[\/\\]/.test(data.orderId) || ['.','..'].includes(data.orderId)) throw new ApiError(400, 'Invalid order reference.');
        const order = await db.doc('seller_orders/' + data.orderId).get();
        if (!order.exists || ![order.data()?.buyerUid, order.data()?.sellerId].includes(uid)) throw new ApiError(403, 'Order unavailable.');
      }
      const id = digest(uid + ':' + data.requestId);
      const ref = db.doc('support_matrix_conversations/' + id);
      const seller = await db.doc('sellers/' + uid).get();
      const storeName = seller.data()?.ownerUid === uid && typeof seller.data()?.businessName === 'string' ? seller.data()?.businessName : undefined;
      const ownerLabel = (storeName || (await auth.getUser(uid)).displayName || 'Customer').slice(0, 80);
      const agentLabel = agent.data()?.displayName || 'Support ' + data.agentUid.slice(0, 8);
      await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        if (previous.exists) {
          if (previous.data()?.agentUid !== data.agentUid || previous.data()?.category !== data.category || previous.data()?.orderId !== data.orderId) throw new ApiError(409, 'Request identifier already used.');
          return;
        }
        const quotaRef = db.doc('support_matrix_limits/' + uid + '_' + new Date().toISOString().slice(0,10));
        const quota = await tx.get(quotaRef);
        if ((quota.data()?.count ?? 0) >= 5) throw new ApiError(429, 'Daily support conversation limit reached.');
        tx.set(quotaRef, { count: (quota.data()?.count ?? 0) + 1 });
        tx.create(ref, { ownerUid: uid, agentUid: data.agentUid, ownerLabel, agentLabel, category: data.category, orderId: data.orderId, status: 'provisioning', encrypted: true, createdAt: now, updatedAt: now });
      });
      let ticket = (await ref.get()).data()!;
      if (!ticket.roomId) {
        const alias = '#ts_' + id + ':' + config.domain;
        const creation = await matrixService('/_matrix/client/v3/createRoom', 'POST', {
          room_alias_name: 'ts_' + id, visibility: 'private', preset: 'private_chat',
          invite: [matrixUserId(uid, config.domain), matrixUserId(data.agentUid, config.domain)],
          initial_state: [
            { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2', rotation_period_msgs: 1, rotation_period_ms: 3600000 } },
            { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
          ],
          power_level_content_override: { users_default: 0, events_default: 0, state_default: 100, invite: 100, kick: 100, ban: 100, redact: 100,
            events: { 'm.room.encryption': 100, 'm.room.power_levels': 100, 'm.room.history_visibility': 100, 'm.room.name': 100, 'm.room.topic': 100 } },
        }).catch(async () => matrixService('/_matrix/client/v3/directory/room/' + encodeURIComponent(alias)));
        if (typeof creation.room_id !== 'string') throw new ApiError(503, 'Unable to provision encrypted conversation.');
        await db.runTransaction(async tx => {
          const [existing, currentRole] = await Promise.all([tx.get(ref), tx.get(db.doc('roles_admin/' + data.agentUid))]);
          if (existing.data()?.roomId) return;
          if (!currentRole.exists) throw new ApiError(409, 'The assigned support role was removed.');
          tx.update(ref, { roomId: creation.room_id, status: 'open' });
          tx.create(db.collection('support_matrix_audit').doc(), { action: 'conversation_created', actorUid: uid, conversationId: id, agentUid: data.agentUid, createdAt: now });
        });
        ticket = (await ref.get()).data()!;
      }
      return Response.json({ roomId: ticket.roomId, id }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (data.action === 'reassign') {
      const result = await db.collection('support_matrix_conversations').where('roomId', '==', data.roomId).limit(1).get();
      const ref = result.docs[0]?.ref;
      if (!ref) throw new ApiError(404, 'Conversation unavailable.');
      const agent = await db.doc('support_matrix_accounts/' + data.agentUid).get();
      if (!(await db.doc('roles_admin/' + data.agentUid).get()).exists || !agent.data()?.agent || !agent.data()?.masterKey) throw new ApiError(409, 'The new support agent must finish secure setup first.');
      const old = await db.runTransaction(async tx => {
        const [current, actorRole] = await Promise.all([tx.get(ref), tx.get(db.doc('roles_admin/' + uid))]);
        const ticket = current.data()!;
        if (!['open','closed','reassigning'].includes(ticket.status)) throw new ApiError(409, 'Conversation is not ready for reassignment.');
        if (ticket.ownerUid !== uid && !(ticket.agentUid === uid && actorRole.exists)) throw new ApiError(403, 'Only a participant can reassign this conversation.');
        if ([ticket.ownerUid, ticket.agentUid].includes(data.agentUid)) throw new ApiError(400, 'Choose a different support agent.');
        if (ticket.status === 'reassigning' && ticket.nextAgentUid !== data.agentUid) throw new ApiError(409, 'Finish the pending reassignment before choosing another agent.');
        tx.update(ref, { status: 'reassigning', nextAgentUid: data.agentUid, previousStatus: ticket.previousStatus ?? ticket.status });
        return ticket;
      });
      const prefix = '/_matrix/client/v3/rooms/' + encodeURIComponent(data.roomId);
      const oldId = matrixUserId(old.agentUid, config.domain), newId = matrixUserId(data.agentUid, config.domain);
      const previous = await matrixService(prefix + '/state/m.room.member/' + encodeURIComponent(oldId));
      if (['join','invite'].includes(previous.membership)) await matrixService(prefix + '/kick', 'POST', { user_id: oldId, reason: 'Support reassignment' });
      const next = await matrixService(prefix + '/state/m.room.member/' + encodeURIComponent(newId)).catch(() => ({ membership: 'leave' }));
      if (!['join','invite'].includes(next.membership)) await matrixService(prefix + '/invite', 'POST', { user_id: newId });
      await db.runTransaction(async tx => {
        const [current, role, actorRole] = await Promise.all([tx.get(ref), tx.get(db.doc('roles_admin/' + data.agentUid)), tx.get(db.doc('roles_admin/' + uid))]);
        if (current.data()?.ownerUid !== uid && !actorRole.exists) throw new ApiError(403, 'Support role removed during reassignment.');
        if (!role.exists || current.data()?.nextAgentUid !== data.agentUid) throw new ApiError(409, 'Assignment authorization changed.');
        tx.update(ref, { agentUid: data.agentUid, agentLabel: agent.data()?.displayName || 'Support ' + data.agentUid.slice(0, 8), status: current.data()?.previousStatus ?? 'open', previousStatus: null, nextAgentUid: null, updatedAt: now });
        tx.create(db.collection('support_matrix_audit').doc(), { action: 'conversation_reassigned', actorUid: uid, conversationId: ref.id, oldAgentUid: old.agentUid, agentUid: data.agentUid, createdAt: now });
      });
      return Response.json({ ok: true });
    }
    const ticket = await authorizedConversation(db, uid, data.roomId);
    await db.runTransaction(async tx => {
      const current = await tx.get(ticket.ref);
      if (![current.data()?.ownerUid, current.data()?.agentUid].includes(uid)) throw new ApiError(403, 'Conversation access changed.');
      tx.update(ticket.ref, { status: data.action === 'close' ? 'closed' : 'open', updatedAt: now });
      tx.create(db.collection('support_matrix_audit').doc(), { action: data.action, actorUid: uid, conversationId: ticket.id, createdAt: now });
    });
    return Response.json({ ok: true });
  } catch (error) { return safeResponse(error instanceof z.ZodError ? new ApiError(400, 'Invalid conversation request.') : error); }
}
