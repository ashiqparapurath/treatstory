import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { digest, invalidateAgentDirectory, loginJWT, matrixConfig, matrixFetch, matrixUserId, supportRole } from '@/lib/server/support-matrix';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Login creates an independent Matrix device, NOT decryption authorization.
// Cross-signing / SAS / recovery remain entirely in the browser crypto stack.
export async function POST(request: NextRequest) {
  try {
    const config = matrixConfig();
    const { uid, db, auth } = await verifiedUser(request);
    const agent = await supportRole(db, uid);
    const displayName = ((await auth.getUser(uid)).displayName ?? '').slice(0, 80);
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).strict().parse(await readJsonBody(request, 1024));
    const account = db.doc('support_matrix_accounts/' + uid);
    const now = Timestamp.now();
    await db.runTransaction(async tx => {
      const existing = await tx.get(account);
      const windowAt = existing.data()?.loginWindowAt?.toMillis?.() ?? 0;
      const inWindow = now.toMillis() - windowAt < 600000;
      const count = inWindow ? (existing.data()?.loginCount ?? 0) : 0;
      if (count >= 10) throw new ApiError(429, 'Too many new devices. Try again later.');
      tx.set(account, { agent, displayName, userId: matrixUserId(uid, config.domain), lastLoginAt: now, loginWindowAt: inWindow ? existing.data()!.loginWindowAt : now, loginCount: count + 1 }, { merge: true });
    });
    const response = await matrixFetch('/_matrix/client/v3/login', { method: 'POST', body: JSON.stringify({
      type: 'org.matrix.login.jwt', token: loginJWT(uid, config.secret), initial_device_display_name: name,
    }) });
    if (!response.ok) throw new ApiError(503, 'Unable to create a messaging device.');
    const session = await response.json() as { access_token: string; device_id: string; user_id: string };
    if (session.user_id !== matrixUserId(uid, config.domain) || !session.access_token || !session.device_id) throw new ApiError(503, 'Invalid messaging identity.');
    const batch = db.batch();
    batch.create(db.doc('support_matrix_sessions/' + digest(session.access_token)), {
      uid, deviceId: session.device_id, createdAt: now, revoked: false,
    });
    batch.create(db.collection('support_matrix_audit').doc(), { actorUid: uid, action: 'device_login_pending', deviceId: session.device_id, createdAt: now });
    await batch.commit();
    if (agent) invalidateAgentDirectory();
    return Response.json({ accessToken: session.access_token, deviceId: session.device_id, userId: session.user_id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error instanceof z.ZodError ? new ApiError(400, 'Invalid device name.') : error); }
}

export async function GET(request: NextRequest) {
  try {
    matrixConfig(); const { uid, db } = await verifiedUser(request); await supportRole(db, uid);
    const token = request.headers.get('x-matrix-token') ?? '';
    const session = await db.doc('support_matrix_sessions/' + digest(token)).get();
    if (session.data()?.uid !== uid || session.data()?.revoked) throw new ApiError(401, 'Messaging session required.');
    const account = await db.doc('support_matrix_accounts/' + uid).get();
    return Response.json({ masterKey: account.data()?.masterKey ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
