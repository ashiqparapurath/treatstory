import { getServerFirebase } from '../src/lib/server/firebase-admin';
import { storeSlug } from '../src/lib/server/store-slug';
// Run with the target project's server credentials. Idempotent; old UID links redirect.
async function main() {
  const { db } = getServerFirebase();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let migrated = 0;
  do {
    const query = db.collection('sellers').orderBy('__name__').limit(100);
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    for (const doc of page.docs)
      await db.runTransaction(async (tx) => {
        const seller = await tx.get(doc.ref);
        const data = seller.data()!;
        const slug =
          data.slug && data.slug !== doc.id
            ? data.slug
            : storeSlug(data.businessName, doc.id);
        const ref = db.doc('store_slugs/' + slug);
        const prior = await tx.get(ref);
        if (prior.exists && prior.data()?.sellerId !== doc.id)
          throw new Error('Conflicting store slug; migration stopped');
        tx.set(ref, { sellerId: doc.id });
        tx.update(doc.ref, { slug });
        migrated++;
      });
    cursor = page.docs.length === 100 ? page.docs.at(-1) : undefined;
  } while (cursor);
  console.log({ migrated });
}
main().catch(() => {
  console.error(
    'Store migration failed. Check credentials and slug conflicts.',
  );
  process.exitCode = 1;
});
