import { verifyMatrixSignature } from '@/lib/server/support-matrix-signatures';
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readBodyBytes } from '@/lib/server/request-body';
import { authorizedConversation, digest, invalidateAgentDirectory, matrixConfig, matrixFetch, matrixUserId, requireTrustedDevice, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const config = matrixConfig();
    const firebaseToken = request.headers.get('x-treatstory-auth');
    const authRequest = new Request(request.url, { headers: { Authorization: 'Bearer ' + (firebaseToken ?? '') } }) as NextRequest;
    const { uid, db } = await verifiedUser(authRequest);
    await supportRole(db, uid);
    const bearer = request.headers.get('authorization') ?? '';
    if (!bearer.startsWith('Bearer ')) throw new ApiError(401, 'Messaging session required.');
    const token = bearer.slice(7);
    const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
    if (!session.exists || session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging device has been revoked.');
    const parts = [...(await context.params).path];
    if (parts.at(-1) === '') parts.pop();
    if (parts.some((p, index) => !p || p === '.' || p === '..' || /[\\\x00-\x1f]/.test(p) || (p.includes('/') && !(index === 6 && parts[3] === 'room_keys' && parts[4] === 'keys' && /^[A-Za-z0-9+/_=-]{1,256}$/.test(p))))) throw new ApiError(400, 'Invalid messaging path.');
    const path = '/' + parts.map(encodeURIComponent).join('/') + (request.nextUrl.pathname.endsWith('/') || (parts[3] === 'pushrules' && parts.length === 4) ? '/' : '');
    const api = parts.slice(3);
    const method = request.method;
    const isRead = method === 'GET';
    let acceptedMessageRef: DocumentReference | undefined;
    let scopedRecipients: Set<string> | undefined;
    const expectedRoom = request.headers.get('x-treatstory-conversation');
    const expectedAgent = request.headers.get('x-treatstory-agent');
    if (expectedRoom || expectedAgent) {
      if (!expectedRoom || !expectedAgent) throw new ApiError(400, 'Incomplete encryption routing context.');
      const roomId = decodeURIComponent(expectedRoom);
      const conversation = await authorizedConversation(db, uid, roomId);
      if (conversation.data().status !== 'open' || digest(conversation.data().agentUid) !== expectedAgent) throw new ApiError(409, 'Conversation assignment changed before encryption completed.');
      if (api[0] === 'rooms' && api[1] !== roomId) throw new ApiError(400, 'Conversation routing context mismatch.');
      if (!(await db.doc('roles_admin/' + conversation.data().agentUid).get()).exists) throw new ApiError(409, 'The assigned support role was removed. Choose another support agent.');
      scopedRecipients = new Set([matrixUserId(conversation.data().ownerUid, config.domain), matrixUserId(conversation.data().agentUid, config.domain)]);
    }

    if (parts[0] !== '_matrix' || parts[1] !== 'client' || !['v3', 'r0', 'unstable', 'versions'].includes(parts[2])) throw new ApiError(403, 'Messaging path unavailable.');
    const ownId = matrixUserId(uid, config.domain);
    let allowed = parts[2] === 'versions' && isRead;
    allowed ||= isRead && ['sync', 'capabilities', 'pushrules', 'devices'].includes(api[0]);
    allowed ||= api[0] === 'keys' && ['query', 'claim', 'upload', 'changes', 'signatures', 'device_signing'].includes(api[1]);
    allowed ||= api[0] === 'sendToDevice' && method === 'PUT';
    allowed ||= api[0] === 'room_keys' && ['GET', 'POST', 'PUT'].includes(method);
    allowed ||= api[0] === 'user' && api[1] === ownId && api[2] === 'account_data' && ['GET', 'PUT'].includes(method);
    allowed ||= api[0] === 'user' && api[1] === ownId && api[2] === 'filter' && ['GET', 'POST'].includes(method);
    // No client createRoom/invite/kick/state/power-level mutation or plaintext send.
    if (api[0] === 'rooms') {
      const conversation = await authorizedConversation(db, uid, api[1]);
      allowed = isRead && ['messages', 'state', 'event', 'members', 'joined_members', 'context'].includes(api[2]);
      allowed ||= method === 'POST' && ['read_markers', 'receipt'].includes(api[2]);
      allowed ||= method === 'POST' && api[2] === 'join';
      if (method === 'PUT' && api[2] === 'send' && api[3] === 'm.room.encrypted') {
        if (!scopedRecipients) throw new ApiError(400, 'Encrypted sends require a conversation routing context.');
        if (conversation.data().status !== 'open') throw new ApiError(409, 'This conversation is closed.');
        await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
        allowed = true;
        acceptedMessageRef = conversation.ref;
      }
    }
    // The SDK uses /join/{roomId} on invitation acceptance.
    if (api[0] === 'join' && method === 'POST') {
      await authorizedConversation(db, uid, api[1]); allowed = true;
    }
    if (isRead && api[0] === 'voip' && api[1] === 'turnServer') return Response.json({ uris: [], username: '', password: '', ttl: 86400 }, { headers: { 'Cache-Control': 'no-store' } });
    if (!allowed) throw new ApiError(403, 'Messaging operation unavailable.');
    const bytes = isRead ? undefined : await readBodyBytes(request, 256_000);
    let body = bytes?.length ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) : undefined;
    if (api[0] === 'rooms' && api[2] === 'send' && (body?.algorithm !== 'm.megolm.v1.aes-sha2' || typeof body.ciphertext !== 'string' || 'body' in body)) throw new ApiError(400, 'Only encrypted messages are accepted.');
    if (isRead && api[0] === 'room_keys' && api[1] === 'keys') await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
    if (!isRead && (api[0] === 'room_keys' || (api[0] === 'user' && api[2] === 'account_data'))) await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
    if (api[0] === 'keys' && api[1] === 'upload' && body?.device_keys) {
      const device = body.device_keys; const deviceId = session.data()!.deviceId;
      const publicKeys = device.keys ?? {};
      const ed = publicKeys['ed25519:' + deviceId], curve = publicKeys['curve25519:' + deviceId];
      if (device.user_id !== ownId || device.device_id !== deviceId || Object.keys(publicKeys).length !== 2 ||
          ![ed, curve].every(value => typeof value === 'string' && /^[A-Za-z0-9+/]{43}$/.test(value) && Buffer.from(value, 'base64').length === 32) ||
          !verifyMatrixSignature(device, ownId, { ['ed25519:' + deviceId]: ed })) throw new ApiError(400, 'Invalid signed device identity.');
      const fingerprint = digest(JSON.stringify([ed, curve]));
      if (!session.data()?.deviceFingerprint) {
        const existing = await matrixFetch('/_matrix/client/v3/keys/query', { method: 'POST', body: JSON.stringify({ device_keys: { [ownId]: [deviceId] } }) }, token);
        if (!existing.ok) throw new ApiError(503, 'Unable to verify the original device identity.');
        const old = (await existing.json()).device_keys?.[ownId]?.[deviceId]?.keys;
        if (old && digest(JSON.stringify([old['ed25519:' + deviceId], old['curve25519:' + deviceId]])) !== fingerprint) throw new ApiError(409, 'Original device keys cannot be replaced. Use an approved device or recovery in a new browser; preserve existing browser storage.');
      }
      await db.runTransaction(async tx => {
        const current = await tx.get(session.ref);
        if (current.data()?.revoked) throw new ApiError(401, 'Messaging device has been revoked.');
        if (current.data()?.deviceFingerprint && current.data()?.deviceFingerprint !== fingerprint) throw new ApiError(409, 'Original device keys cannot be replaced. Enroll a separate device.');
        tx.update(session.ref, { deviceFingerprint: fingerprint });
      });
    }
    if (api[0] === 'keys' && api[1] === 'device_signing') {
      const account = await db.doc('support_matrix_accounts/' + uid).get();
      const root = body?.master_key?.keys ? Object.values(body.master_key.keys)[0] : account.data()?.masterKey;
      if (typeof root !== 'string') throw new ApiError(400, 'Account signing identity is missing.');
      for (const [field, usage] of [['self_signing_key','self_signing'], ['user_signing_key','user_signing']]) {
        const key = body?.[field];
        if (!key && account.data()?.masterKey) continue;
        if (!key || key.user_id !== ownId || key.usage?.length !== 1 || key.usage[0] !== usage || !verifyMatrixSignature(key, ownId, { ['ed25519:' + root]: root })) throw new ApiError(403, 'Signing-key replacement requires the original account identity.');
      }
    }
    if (api[0] === 'keys' && api[1] === 'device_signing' && body?.master_key) {
      const master = body.master_key;
      const key = Object.values(master.keys ?? {});
      if (master.user_id !== ownId || key.length !== 1 || typeof key[0] !== 'string' || !/^[A-Za-z0-9+/]{43}$/.test(key[0]) || Buffer.from(key[0], 'base64').length !== 32 || Object.keys(master.keys)[0] !== 'ed25519:' + key[0] || master.usage?.length !== 1 || master.usage[0] !== 'master') throw new ApiError(400, 'Invalid signing identity.');
      await db.runTransaction(async tx => {
        const ref = db.doc('support_matrix_accounts/' + uid);
        const account = await tx.get(ref);
        if (account.data()?.masterKey && account.data()?.masterKey !== key[0]) throw new ApiError(409, 'An existing signing identity cannot be replaced. Use verified linking or recovery.');
        tx.update(ref, { masterKey: key[0] });
      });
    }
    if (api[0] === 'keys' && api[1] === 'device_signing' && (await db.doc('support_matrix_accounts/' + uid).get()).data()?.agent) invalidateAgentDirectory();
    if (api[0] === 'user' && api[2] === 'account_data' && api[3] === 'm.secret_storage.default_key' && method === 'PUT') {
      if (typeof body?.key !== 'string' || !body.key || body.key.length > 255) throw new ApiError(400, 'Invalid recovery key reference.');
      await db.runTransaction(async tx => {
        const ref = db.doc('support_matrix_accounts/' + uid); const account = await tx.get(ref);
        if (account.data()?.recoveryKeyId && account.data()?.recoveryKeyId !== body.key) throw new ApiError(409, 'Recovery already has a key. The original recovery material has not been replaced.');
        tx.update(ref, { recoveryKeyId: body.key });
      });
    }
    if (api[0] === 'user' && api[2] === 'account_data') {
      if (!/^(m\.cross_signing\.|m\.secret_storage\.|m\.megolm_backup\.v1|m\.push_rules)/.test(api[3] ?? '')) throw new ApiError(403, 'Only encrypted key-storage account data is supported.');
    }
    if (api[0] === 'sendToDevice') {
      if (!/^(m\.room\.encrypted|m\.key\.verification\.[a-z_]+|m\.room_key_request|m\.room_key\.withheld|m\.secret\.request|m\.dummy)$/.test(api[1] ?? '') || !body?.messages || typeof body.messages !== 'object') throw new ApiError(400, 'Unsupported device message.');
      const conversations = await db.collection('support_matrix_conversations').where('ownerUid', '==', uid).get();
      const assigned = await db.collection('support_matrix_conversations').where('agentUid', '==', uid).get();
      const peers = scopedRecipients ?? new Set([ownId]);
      for (const doc of scopedRecipients ? [] : [...conversations.docs, ...assigned.docs]) {
        const data = doc.data();
        if (!['open', 'closed'].includes(data.status) || !(await db.doc('roles_admin/' + data.agentUid).get()).exists) continue;
        peers.add(matrixUserId(data.ownerUid, config.domain)); peers.add(matrixUserId(data.agentUid, config.domain));
      }
      for (const [target, devices] of Object.entries(body.messages)) {
        if (!peers.has(target) || !devices || typeof devices !== 'object') throw new ApiError(403, 'Device recipient is not a conversation participant.');
        const account = await db.collection('support_matrix_accounts').where('userId', '==', target).limit(1).get();
        if (!account.docs[0]) throw new ApiError(403, 'Unknown device recipient.');
        if (account.docs[0].data().agent && !(await db.doc('roles_admin/' + account.docs[0].id).get()).exists) throw new ApiError(403, 'The recipient support role was removed.');
        const sessions = await db.collection('support_matrix_sessions').where('uid', '==', account.docs[0].id).where('revoked', '==', true).get();
        for (const device of Object.keys(devices)) {
          if (device === '*' && api[1] === 'm.room.encrypted') throw new ApiError(400, 'Encrypted key sharing requires an individual recipient device.');
          if (sessions.docs.some(session => session.data().deviceId === device && session.data().revoked)) delete (devices as Record<string, unknown>)[device];
        }
      }
    }
    // Query parameters are allowlisted; no access_token or remote URL forwarding.
    const query = new URLSearchParams();
    for (const key of ['since', 'timeout', 'filter', 'full_state', 'from', 'to', 'dir', 'limit', 'version']) {
      const value = request.nextUrl.searchParams.get(key); if (value !== null) query.set(key, value);
    }
    if (api[0] === 'sync') query.set('timeout', '20000');
    const response = await matrixFetch(path + (query.size ? '?' + query : ''), { method,
      ...(bytes?.length ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) }, token);
    if (response.ok && acceptedMessageRef) await acceptedMessageRef.update({ updatedAt: Timestamp.now(), lastSenderUid: uid });
    // Never forward cookies, redirects, hop-by-hop or infrastructure headers.
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error instanceof SyntaxError || error instanceof URIError ? new ApiError(400, 'Invalid messaging request.') : error); }
}
export { proxy as GET, proxy as POST, proxy as PUT };
