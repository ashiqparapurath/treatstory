import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
const schema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('submit'),
      licenseNumber: z.string().regex(/^[0-9]{14}$/),
      expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      sellerId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
      approved: z.boolean(),
      note: z.string().trim().min(10).max(500),
    })
    .strict(),
]);
export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const input = schema.safeParse(await readJsonBody(request, 2000));
    if (!input.success) throw new ApiError(400, 'Review the license details.');
    const data = input.data;
    const id = data.action === 'review' ? data.sellerId : uid;
    await db.runTransaction(async (tx) => {
      const sellerRef = db.doc('sellers/' + id),
        ref = db.doc('seller_compliance/' + id);
      const [seller, prior, admin] = await Promise.all([
        tx.get(sellerRef),
        tx.get(ref),
        tx.get(db.doc('roles_admin/' + uid)),
      ]);
      const deleting = await tx.get(db.doc('account_deletions/' + id));
      if (deleting.exists)
        throw new ApiError(409, 'This seller account is closing.');
      if (!seller.exists) throw new ApiError(404, 'Seller unavailable.');
      const now = Timestamp.now();
      if (data.action === 'submit') {
        const end = Date.parse(data.expiresOn + 'T23:59:59+05:30');
        if (!Number.isFinite(end) || end <= Date.now())
          throw new ApiError(400, 'Provide a current license expiry date.');
        tx.set(ref, {
          sellerId: id,
          businessName: seller.data()!.businessName,
          licenseNumber: data.licenseNumber,
          expiresOn: data.expiresOn,
          status: 'pending',
          submittedAt: now,
        });
        // Editing credentials withdraws the previous verification.
        tx.update(sellerRef, {
          foodLicenseNumber: data.licenseNumber,
          foodLicenseVerifiedUntil: null,
          updatedAt: now,
        });
      } else {
        if (!admin.exists)
          throw new ApiError(403, 'Administrator access required.');
        const record = prior.data();
        if (record?.status !== 'pending')
          throw new ApiError(409, 'No pending verification.');
        const end = Date.parse(record.expiresOn + 'T23:59:59+05:30');
        if (data.approved && (!Number.isFinite(end) || end <= Date.now()))
          throw new ApiError(409, 'The submitted license has expired.');
        tx.update(ref, {
          status: data.approved ? 'verified' : 'rejected',
          reviewNote: data.note,
          reviewedBy: uid,
          reviewedAt: now,
        });
        tx.update(sellerRef, {
          foodLicenseNumber: record.licenseNumber,
          foodLicenseVerifiedUntil: data.approved
            ? Timestamp.fromMillis(end)
            : null,
          updatedAt: now,
        });
        tx.create(db.collection('admin_audit').doc(), {
          actorUid: uid,
          sellerId: id,
          action: 'food_license_review',
          approved: data.approved,
          note: data.note,
          createdAt: now,
        });
      }
    });
    return Response.json({ saved: true });
  } catch (error) {
    return safeResponse(error);
  }
}
