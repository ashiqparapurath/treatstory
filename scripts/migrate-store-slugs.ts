import { getServerFirebase } from '../src/lib/server/firebase-admin';
import { ensureFriendlyStoreSlug } from '../src/lib/server/store-slug';

// Run once with server credentials after deployment (or rerun safely).
// Stores get readable canonical URLs, and all previously shared slugs stay mapped.
// Old /shop/<seller-uid> links continue resolving via the seller document ID.
async function main() {
  const { db } = getServerFirebase();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let scanned = 0, changed = 0, unchanged = 0, failed = 0;

  do {
    const query = db.collection('sellers').orderBy('__name__').limit(100);
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    for (const doc of page.docs) {
      scanned++;
      try {
        const result = await db.runTransaction(async tx => {
          const snapshot = await tx.get(doc.ref);
          if (!snapshot.exists) return 'skipped';
          const oldSlug = snapshot.data()?.slug;
          const newSlug = await ensureFriendlyStoreSlug(tx, db, doc.ref, snapshot.data()!);
          return oldSlug === newSlug ? 'unchanged' : 'changed';
        });
        if (result === 'changed') changed++; else unchanged++;
      } catch {
        failed++;
        // Do not log store names, personal details, or Firebase UIDs.
        console.error('Unable to migrate a store link; check slug collisions and permissions.');
      }
    }
    cursor = page.docs.length === 100 ? page.docs.at(-1) : undefined;
  } while (cursor);

  console.log({ scanned, changed, unchanged, failed });
  if (failed) process.exitCode = 1;
}
main().catch(() => {
  console.error('Store-link migration failed. Check server credentials.');
  process.exitCode = 1;
});
