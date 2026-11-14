import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
const schema = z
  .object({
    sellerId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    expectedUpdatedAt: z.number().nullable(),
    patch: z
      .object({
        status: z.enum(['active', 'suspended']).optional(),
        accessType: z.enum(['trial', 'full']).optional(),
        accessEndsAt: z.number().finite().optional(),
      })
      .strict(),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const parsed = schema.safeParse(await readJsonBody(request, 2000));
    if (!parsed.success)
      throw new ApiError(400, 'Invalid seller access change.');
    const { sellerId, patch, expectedUpdatedAt } = parsed.data;
    if (!Object.keys(patch).length)
      throw new ApiError(400, 'Choose an access change.');
    if (
      patch.accessEndsAt !== undefined &&
      (patch.accessEndsAt <= Date.now() ||
        patch.accessEndsAt > Date.now() + 3660 * 86400000)
    )
      throw new ApiError(400, 'Choose a future expiry within ten years.');
    await db.runTransaction(async (tx) => {
      const ref = db.doc('sellers/' + sellerId);
      const [admin, seller, deletion] = await Promise.all([
        tx.get(db.doc('roles_admin/' + uid)),
        tx.get(ref),
        tx.get(db.doc('account_deletions/' + sellerId)),
      ]);
      if (!admin.exists)
        throw new ApiError(403, 'Administrator access required.');
      if (!seller.exists || deletion.exists)
        throw new ApiError(409, 'Seller unavailable.');
      if (
        (seller.data()?.updatedAt?.toMillis?.() ?? null) !== expectedUpdatedAt
      )
        throw new ApiError(
          409,
          'Seller details changed. Refresh before saving.',
        );
      if (
        patch.status === 'active' &&
        (patch.accessEndsAt ??
          seller.data()?.accessEndsAt?.toMillis?.() ??
          0) <= Date.now()
      )
        throw new ApiError(409, 'Extend expired access before reactivating.');
      const now = Timestamp.now();
      tx.update(ref, {
        ...patch,
        ...(patch.accessEndsAt !== undefined
          ? { accessEndsAt: Timestamp.fromMillis(patch.accessEndsAt) }
          : {}),
        updatedAt: now,
      });
      tx.create(db.collection('admin_audit').doc(), {
        actorUid: uid,
        sellerId,
        action: 'seller_access_changed',
        changes: patch,
        createdAt: now,
      });
    });
    return Response.json({ saved: true });
  } catch (error) {
    return safeResponse(error);
  }
}
