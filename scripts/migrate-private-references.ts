import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getServerFirebase } from '../src/lib/server/firebase-admin';
import { cloudinaryConfig } from '../src/lib/server/media';
async function main() {
  const { db } = getServerFirebase();
  const { cloud, key, secret } = cloudinaryConfig();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  do {
    const base = db.collection('custom_quotes').orderBy('__name__').limit(50);
    const page = await (cursor ? base.startAfter(cursor) : base).get();
    for (const quote of page.docs) {
      const q = quote.data();
      if (!q.referenceUrl?.startsWith('https://res.cloudinary.com/')) continue;
      const url = new URL(q.referenceUrl);
      const prefix = `/${cloud}/image/upload/`;
      if (!url.pathname.startsWith(prefix) || url.search)
        throw new Error('Unexpected legacy media URL; manual review required');
      const path = url.pathname.slice(prefix.length).replace(/^v[0-9]+\//, '');
      const match = path.match(
        /^(treatstory\/references\/[^/]+\/.+)\.(jpg|jpeg|png|webp)$/,
      );
      if (
        !match ||
        !match[1].startsWith(`treatstory/references/${q.buyerUid}/`)
      )
        throw new Error('Legacy media owner mismatch; manual review required');
      const publicId = match[1];
      const id = createHash('sha256').update(quote.id).digest('hex');
      // Save a durable intent first; a crash after rename can safely retry and check the target.
      await db
        .doc('media_assets/' + id)
        .set(
          {
            ownerUid: q.buyerUid,
            quoteId: quote.id,
            publicId,
            kind: 'reference',
            status: 'ready',
            type: 'authenticated',
            format: match[2],
            createdAt: Timestamp.now(),
          },
          { merge: true },
        );
      const headers = {
        Authorization:
          'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
      };
      const result = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/rename`,
        {
          method: 'POST',
          headers,
          body: new URLSearchParams({
            from_public_id: publicId,
            to_public_id: publicId,
            type: 'upload',
            to_type: 'authenticated',
            invalidate: 'true',
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!result.ok) {
        const target = await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/resources/image/authenticated/${encodeURIComponent(publicId)}`,
          { headers, signal: AbortSignal.timeout(15000) },
        );
        if (!target.ok) throw new Error('Cloudinary migration failed');
      }
      await db.runTransaction(async (tx) => {
        const current = await tx.get(quote.ref);
        if (current.data()?.referenceUrl === q.referenceUrl)
          tx.update(quote.ref, { referenceUrl: '/api/reference-media/' + id });
      });
    }
    cursor = page.size === 50 ? page.docs.at(-1) : undefined;
  } while (cursor);
}
main().catch(() => {
  console.error(
    'Reference migration stopped; review server logs and resume after correcting the asset.',
  );
  process.exitCode = 1;
});
