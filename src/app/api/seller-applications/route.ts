import { instagramProfileUrl, fssaiNumberPattern } from '@/lib/seller-profile-details';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getServerFirebase,
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { activateApprovedSeller } from '@/lib/server/seller-activation';
import { processMailQueue } from '@/lib/server/mail';
import { queueNewSellerApplicationMails, queueRejectedSellerApplicationMail, queueApprovedSellerApplicationMail, sellerAdminMailRecipient } from '@/lib/server/seller-application-email';
export const runtime = 'nodejs';
const applicationSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    businessCategory: z.enum(['home-bakery', 'art', 'handmade', 'other']),
    businessCity: z.string().trim().min(2).max(80).optional(),
    businessState: z.string().trim().min(2).max(80).optional(),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    contactPhone: z.string().trim().min(5).max(40),
    description: z.string().trim().min(1).max(2000),
    instagramUrl: z.string().max(512).default('').transform(value => instagramProfileUrl(value)).pipe(z.string()),
    fssaiRegistered: z.boolean().default(false),
    fssaiNumber: z.union([z.literal(''), z.string().regex(fssaiNumberPattern)]).default(''),
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
    const { db, auth } = getServerFirebase();
    const adminEmail=sellerAdminMailRecipient();
    const uid = request.headers.has('authorization')
      ? (await verifiedUser(request)).uid
      : '';
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');
    if (uid) {
      const account = await auth.getUser(uid);
      if (account.email?.trim().toLowerCase() !== data.contactEmail)
        throw new ApiError(400, 'Use your signed-in account email for your seller application.');
    }
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
      const [limit, prior, seller, guestPrior] = await Promise.all([
        tx.get(rate),
        tx.get(ref),
        uid ? tx.get(db.doc('sellers/' + uid)) : Promise.resolve(null),
        uid ? tx.get(db.collection('seller_applications').doc('guest_' + hash(data.contactEmail))) : Promise.resolve(null),
      ]);
      if (seller?.exists)
        throw new ApiError(409, 'You already have a seller account.');
      if (prior.exists || guestPrior?.exists)
        throw new ApiError(
          409,
          'An application already exists. Contact support for an update.',
        );
      if ((limit.data()?.count || 0) >= 5)
        throw new ApiError(
          429,
          'Too many applications. Please try again tomorrow.',
        );
      const submittedAt=Timestamp.now();
      tx.create(ref, {
        ...data,
        fssaiNumber: data.fssaiRegistered ? data.fssaiNumber : '',
        ownerUid: uid,
        status: 'pending',
        submittedAt,
      });
      // An application, the applicant's receipt and the admin alert commit
      // together. No browser-side request or prior Firebase account is needed.
      queueNewSellerApplicationMails(tx,db,{id,...data,submittedAt},adminEmail);
      tx.set(rate, {
        count: (limit.data()?.count || 0) + 1,
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400000),
      });
    });
    after(async()=>{try{
      const result=await processMailQueue(db,auth,3);
      if(!result.configured)console.error('Seller application mail queue is not configured.');
    }catch{console.error('Seller application mail worker unavailable; queued messages remain retryable.');}});
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

    const parsed = z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
      approved: z.boolean(),
      plan: z.enum(['three_months', 'six_months', 'full']).optional(),
    }).strict().safeParse(await readJsonBody(request, 1024));
    if (!parsed.success || (parsed.data?.approved && !parsed.data.plan))
      throw new ApiError(400, 'Choose a 3-month trial, 6-month trial or full access before approving.');

    const { id, approved, plan } = parsed.data!;
    const ref = db.doc('seller_applications/' + id);
    const initial = await ref.get();
    if (!initial.exists) throw new ApiError(404, 'Application not found.');
    const application = initial.data()!;

    // A registered, verified applicant can activate immediately. Guest and
    // unverified applicants can be approved WITHOUT creating a seller record.
    // A verified account with the application contact email claims it later.
    let activeUid = '';
    if (approved && application.ownerUid) {
      const account = await auth.getUser(application.ownerUid).catch(() => null);
      if (account && !account.disabled && account.emailVerified &&
          account.email?.trim().toLowerCase() === application.contactEmail)
        activeUid = account.uid;
    }

    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.data()?.status !== 'pending')
        throw new ApiError(409, 'This application was already reviewed.');
      if (current.data()?.contactEmail !== application.contactEmail ||
          current.data()?.ownerUid !== application.ownerUid)
        throw new ApiError(409, 'Application changed; refresh before reviewing.');

      const now = Timestamp.now();
      if (approved) {
        if (activeUid) {
          await activateApprovedSeller(tx, db, { ...application, approvalPlan: plan }, activeUid, now);
        } else {
          queueApprovedSellerApplicationMail(tx, db, {
            id, businessName: String(application.businessName),
            businessCategory: String(application.businessCategory),
            businessCity: application.businessCity, businessState: application.businessState,
            contactEmail: String(application.contactEmail),
            submittedAt: application.submittedAt,
          }, now, plan!);
        }
      } else {
        queueRejectedSellerApplicationMail(tx, db, {
          id, businessName: String(application.businessName),
          businessCategory: String(application.businessCategory),
          businessCity: application.businessCity, businessState: application.businessState,
          contactEmail: String(application.contactEmail),
          submittedAt: application.submittedAt,
        }, now);
      }

      tx.update(ref, {
        status: approved ? 'approved' : 'rejected',
        ...(approved ? { approvalPlan: plan } : {}),
        ...(activeUid ? { ownerUid: activeUid, activatedAt: now } : {}),
        reviewedAt: now,
        reviewedBy: uid,
      });
      tx.create(db.collection('admin_audit').doc(), {
        actorUid: uid,
        action: approved ? 'seller_approved' : 'seller_rejected',
        applicationId: id,
        ...(approved ? { approvalPlan: plan, awaitingActivation: !activeUid } : {}),
        createdAt: now,
      });
    });

    after(async () => {
      try {
        const result = await processMailQueue(db, auth, 3);
        if (!result.configured) console.error('Seller review mail queue is not configured.');
      } catch {
        console.error('Seller review mail worker unavailable; queued messages remain retryable.');
      }
    });
    return Response.json({ reviewed: true, awaitingActivation: !!approved && !activeUid });
  } catch (error) {
    return safeResponse(error);
  }
}
