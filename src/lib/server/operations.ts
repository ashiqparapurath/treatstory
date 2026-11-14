import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { queueNotification } from './mail';
/** Cursor makes recurring work bounded without starving later sellers. */
export async function remindSellerTrials(db: Firestore) {
  const state = db.doc('operations/trial-reminders');
  const cursor = (await state.get()).data()?.cursor;
  const base = db.collection('sellers').orderBy('__name__').limit(10);
  const page = await (cursor ? base.startAfter(cursor) : base).get();
  for (const doc of page.docs)
    await db.runTransaction(async (tx) => {
      const seller = await tx.get(doc.ref);
      const data = seller.data();
      if ((await tx.get(db.doc('account_deletions/' + doc.id))).exists) return;
      if (
        data?.accessType !== 'trial' ||
        data.status !== 'active' ||
        !data.accessEndsAt?.toMillis
      )
        return;
      const end = data.accessEndsAt.toMillis();
      const days = Math.ceil((end - Date.now()) / 86400000);
      if (days > 7) return;
      const stage = days <= 0 ? 'expired' : 'week';
      const notice = db.doc(
        'trial_notices/' + doc.id + '_' + end + '_' + stage,
      );
      const prior = await tx.get(notice);
      if (prior.exists) return;
      tx.create(notice, { sellerId: doc.id, createdAt: Timestamp.now() });
      queueNotification(tx, db, doc.id, {
        title:
          days <= 0
            ? 'Your seller trial has ended'
            : 'Your seller trial ends soon',
        message:
          days <= 0
            ? 'New sales are paused. Existing orders remain your responsibility. Contact support only if you choose to continue. No automatic charge.'
            : `Your free access ends in ${days} days. Contact support if you choose to continue; there is no automatic charge or renewal.`,
        href: '/seller/dashboard',
        createdAt: Timestamp.now(),
        read: false,
      });
    });
  await state.set({
    cursor: page.size === 10 ? page.docs.at(-1)!.id : null,
    checkedAt: Timestamp.now(),
  });
}
