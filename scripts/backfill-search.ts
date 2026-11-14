import { getServerFirebase } from '../src/lib/server/firebase-admin';
import { productSearchPrefixes } from '../src/lib/search-index';
async function main() {
  const { db } = getServerFirebase();
  for (const name of ['products', 'marketplace_products']) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    do {
      const query = db.collection(name).orderBy('__name__').limit(100);
      const page = await (cursor ? query.startAfter(cursor) : query).get();
      // Transactions prevent a concurrent edit from receiving a stale index.
      for (const doc of page.docs)
        await db.runTransaction(async (tx) => {
          const current = await tx.get(doc.ref);
          if (current.exists)
            tx.update(doc.ref, {
              searchPrefixes: productSearchPrefixes(current.data()!),
            });
        });
      cursor = page.size === 100 ? page.docs.at(-1) : undefined;
    } while (cursor);
  }
}
main().catch(() => {
  console.error('Search backfill failed');
  process.exitCode = 1;
});
