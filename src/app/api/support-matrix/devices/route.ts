import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { digest, matrixConfig, matrixService, matrixUserId, requireTrustedDevice, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const config = matrixConfig();
    const { uid, db } = await verifiedUser(request);
    await supportRole(db, uid);
    const data = z.object({ deviceId: z.string().min(1).max(255) }).strict().parse(await readJsonBody(request, 1024));
    const token = request.headers.get('x-matrix-token') ?? '';
    const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
    if (session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging session required.');
    await requireTrustedDevice(db, uid, session.data()!.deviceId, token);
    if (data.deviceId === session.data()!.deviceId) throw new ApiError(400, 'Use another approved device to remove this device.');
    const sessions = await db.collection('support_matrix_sessions').where('uid', '==', uid).get();
    const batch = db.batch();
    for (const doc of sessions.docs) if (doc.data().deviceId === data.deviceId) batch.update(doc.ref, { revoked: true });
    batch.create(db.collection('support_matrix_audit').doc(), { action: 'device_revoked', actorUid: uid, deviceId: data.deviceId, createdAt: Timestamp.now() });
    await batch.commit();
    await matrixService('/_synapse/admin/v2/users/' + encodeURIComponent(matrixUserId(uid, config.domain)) + '/devices/' + encodeURIComponent(data.deviceId), 'DELETE');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error instanceof z.ZodError ? new ApiError(400, 'Invalid device.') : error); }
}
