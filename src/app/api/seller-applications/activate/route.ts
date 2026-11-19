import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { after, type NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { activateApprovedSeller } from '@/lib/server/seller-activation';
import { processMailQueue } from '@/lib/server/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Link a previously approved application to its verified contact email. No public claim tokens. */
export async function POST(request: NextRequest) {
  try {
    const { uid, db, auth } = await verifiedUser(request);
    // Firebase Admin, not the browser or an old ID-token claim, is authoritative
    // after the applicant clicks the email verification link.
    const account = await auth.getUser(uid);
    if (account.disabled || !account.emailVerified || !account.email)
      throw new ApiError(403, 'Verify your TreatStory account email, then try activating again.');
    const email = account.email.trim().toLowerCase();
    const guestId = 'guest_' + createHash('sha256').update(email).digest('hex');

    const result = await db.runTransaction(async tx => {
      const ownRef = db.doc('seller_applications/' + uid);
      const guestRef = db.doc('seller_applications/' + guestId);
      const [own, guest] = await Promise.all([tx.get(ownRef), tx.get(guestRef)]);
      const chosen = own.data()?.status === 'approved'
        ? { ref: ownRef, data: own.data()! }
        : guest.data()?.status === 'approved'
        ? { ref: guestRef, data: guest.data()! }
        : null;
      if (!chosen)
        throw new ApiError(404, 'No approved seller application found for this email. Check your approval message or contact support.');
      const data = chosen.data;
      if (data.contactEmail !== email || (data.ownerUid && data.ownerUid !== uid))
        throw new ApiError(403, 'The verified account email must match the approved application email.');
      if (data.activatedAt)
        throw new ApiError(409, 'This seller application is already activated. Refresh your dashboard.');

      const now = Timestamp.now();
      await activateApprovedSeller(tx, db, data, uid, now);
      tx.update(chosen.ref, { ownerUid: uid, activatedAt: now });
      tx.create(db.collection('admin_audit').doc(), {
        actorUid: uid,
        action: 'seller_approval_activated',
        applicationId: chosen.ref.id,
        approvalPlan: data.approvalPlan,
        createdAt: now,
      });
      return { activated: true };
    });

    after(async () => {
      try { await processMailQueue(db, auth, 3); }
      catch { console.error('Seller activation notification queued for later delivery.'); }
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return safeResponse(error);
  }
}
