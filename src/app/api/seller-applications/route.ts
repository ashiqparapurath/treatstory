import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getServerFirebase,
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { sellerTrialEnd } from '@/lib/seller-policy';
import { storeSlug } from '@/lib/server/store-slug';
import { queueNotification } from '@/lib/server/mail';
export const runtime = 'nodejs';
const applicationSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    businessCategory: z.enum(['home-bakery', 'art', 'handmade', 'other']),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    contactPhone: z.string().trim().min(5).max(40),
    description: z.string().trim().min(1).max(2000),
    website: z.string().max(0).default(''),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const input = applicationSchema.safeParse(
      await readJsonBody(request, 8000),
    );
    if (!input.success)
      throw new ApiError(400, 'Review your business and contact details.');
    const { website, ...data } = input.data;
    const { db } = getServerFirebase();
    const uid = request.headers.has('authorization')
      ? (await verifiedUser(request)).uid
      : '';
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');
    const id = uid || 'guest_' + hash(data.contactEmail);
    const ip =
      request.headers.get('x-vercel-forwarded-for') ||
      request.headers.get('x-forwarded-for') ||
      'unknown';
    const rate = db
      .collection('application_limits')
      .doc(hash(ip) + '_' + new Date().toISOString().slice(0, 10));
    await db.runTransaction(async (tx) => {
      const ref = db.collection('seller_applications').doc(id);
      const [limit, prior, seller] = await Promise.all([
        tx.get(rate),
        tx.get(ref),
        uid ? tx.get(db.doc('sellers/' + uid)) : Promise.resolve(null),
      ]);
      if (seller?.exists)
        throw new ApiError(409, 'You already have a seller account.');
      if (prior.exists)
        throw new ApiError(
          409,
          'An application already exists. Contact support for an update.',
        );
      if ((limit.data()?.count || 0) >= 5)
        throw new ApiError(
          429,
          'Too many applications. Please try again tomorrow.',
        );
      tx.create(ref, {
        ...data,
        ownerUid: uid,
        status: 'pending',
        submittedAt: Timestamp.now(),
      });
      tx.set(rate, {
        count: (limit.data()?.count || 0) + 1,
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400000),
      });
    });
    return Response.json(
      { submitted: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return safeResponse(error);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const { db, auth, uid } = await verifiedUser(request);
    if (!(await db.doc('roles_admin/' + uid).get()).exists)
      throw new ApiError(403, 'Administrator access required.');
    const parsed = z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
        approved: z.boolean(),
      })
      .strict()
      .safeParse(await readJsonBody(request, 1024));
    if (!parsed.success) throw new ApiError(400, 'Invalid review.');
    const { id, approved } = parsed.data;
    const ref = db.doc('seller_applications/' + id);
    const initial = await ref.get();
    if (!initial.exists) throw new ApiError(404, 'Application not found.');
    const application = initial.data()!;
    let ownerUid = application.ownerUid;
    if (approved && !ownerUid) {
      const account = await auth
        .getUserByEmail(application.contactEmail)
        .catch(() => null);
      if (!account?.emailVerified || account.disabled)
        throw new ApiError(
          409,
          'Ask this applicant to register and verify their contact email, then approve again.',
        );
      ownerUid = account.uid;
    }
    if (approved) {
      const account = await auth.getUser(ownerUid);
      if (!account.emailVerified || account.disabled)
        throw new ApiError(
          409,
          'The seller must verify their account email before activation.',
        );
    }
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.data()?.status !== 'pending')
        throw new ApiError(409, 'This application was already reviewed.');
      if (
        current.data()?.contactEmail !== application.contactEmail ||
        current.data()?.ownerUid !== application.ownerUid
      )
        throw new ApiError(
          409,
          'Application changed; refresh before reviewing.',
        );
      const now = Timestamp.now();
      if (approved) {
        const sellerRef = db.doc('sellers/' + ownerUid);
        const slug = storeSlug(application.businessName, ownerUid);
        const slugRef = db.doc('store_slugs/' + slug);
        const [seller, reserved, deleting] = await Promise.all([
          tx.get(sellerRef),
          tx.get(slugRef),
          tx.get(db.doc('account_deletions/' + ownerUid)),
        ]);
        if (seller.exists || deleting.exists)
          throw new ApiError(
            409,
            'Account already has seller access or is closing.',
          );
        if (reserved.exists && reserved.data()?.sellerId !== ownerUid)
          throw new ApiError(409, 'Store address unavailable.');
        tx.set(slugRef, { sellerId: ownerUid });
        tx.create(sellerRef, {
          ownerUid,
          slug,
          businessName: application.businessName,
          businessCategory: application.businessCategory,
          contactEmail: application.contactEmail,
          contactPhone: application.contactPhone,
          description: application.description,
          logoUrl: '',
          coverUrl: '',
          isOpen: true,
          status: 'active',
          accessType: 'trial',
          accessStartsAt: now,
          accessEndsAt: Timestamp.fromDate(sellerTrialEnd(now.toDate())),
          createdAt: now,
          updatedAt: now,
        });
        queueNotification(tx, db, ownerUid, {
          title: 'Your six-month trial is ready',
          message:
            'Your free trial starts today. No automatic renewal or charge. Contact support if you choose to continue.',
          href: '/seller/dashboard',
          createdAt: now,
          read: false,
        });
      }
      tx.update(ref, {
        status: approved ? 'approved' : 'rejected',
        ...(ownerUid ? { ownerUid } : {}),
        reviewedAt: now,
        reviewedBy: uid,
      });
      tx.create(db.collection('admin_audit').doc(), {
        actorUid: uid,
        action: approved ? 'seller_approved' : 'seller_rejected',
        applicationId: id,
        createdAt: now,
      });
    });
    return Response.json({ reviewed: true });
  } catch (error) {
    return safeResponse(error);
  }
}
