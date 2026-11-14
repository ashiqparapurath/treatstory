import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { db, uid } = await verifiedUser(request);
    if (!(await db.doc('roles_admin/' + uid).get()).exists)
      throw new ApiError(403, 'Administrator access required.');
    const [failed, review, oldest, heartbeat, deletions, backup] =
      await Promise.all([
        db
          .collection('mail_outbox')
          .where('status', '==', 'failed')
          .count()
          .get(),
        db
          .collection('mail_outbox')
          .where('status', '==', 'review')
          .count()
          .get(),
        db
          .collection('mail_outbox')
          .where('nextAttemptAt', '<=', Timestamp.now())
          .orderBy('nextAttemptAt')
          .limit(1)
          .get(),
        db.doc('operations/mail-worker').get(),
        db
          .collection('account_deletions')
          .where('state', '==', 'deleting')
          .count()
          .get(),
        db.doc('operations/backup-verification').get(),
      ]);
    const required = [
      'LEGAL_OPERATOR_NAME',
      'LEGAL_OPERATOR_ADDRESS',
      'LEGAL_CONTACT_EMAIL',
      'LEGAL_CONTACT_PHONE',
      'LEGAL_GRIEVANCE_OFFICER',
    ];
    return Response.json(
      {
        failedMail: failed.data().count,
        mailNeedingReview: review.data().count,
        pendingDeletions: deletions.data().count,
        oldestDueAt:
          oldest.docs[0]?.data().nextAttemptAt?.toDate().toISOString() || null,
        workerLastSeen:
          heartbeat.data()?.checkedAt?.toDate().toISOString() || null,
        backupVerifiedAt:
          backup.data()?.verifiedAt?.toDate().toISOString() || null,
        legalDetailsComplete: required.every(
          (key) => !!process.env[key]?.trim(),
        ),
        encryptedChatEnabled:
          process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return safeResponse(error);
  }
}
