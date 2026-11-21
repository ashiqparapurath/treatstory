import type { NextRequest } from 'next/server';
import { ApiError, safeResponse, verifiedUser } from '@/lib/server/firebase-admin';
import { ensureFriendlyStoreSlug } from '@/lib/server/store-slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sellers can safely upgrade a previously shared UID/hashed link.
 * Authentication owns the seller ID; callers cannot choose another store.
 */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      throw new ApiError(403, 'Open TreatStory to update your store link.');
    const { uid, db } = await verifiedUser(request);
    const slug = await db.runTransaction(async tx => {
      const ref = db.doc('sellers/' + uid);
      const [seller, deleting] = await Promise.all([
        tx.get(ref),
        tx.get(db.doc('account_deletions/' + uid)),
      ]);
      if (!seller.exists || deleting.exists)
        throw new ApiError(404, 'Your storefront is not available.');
      if (seller.data()?.ownerUid && seller.data()?.ownerUid !== uid)
        throw new ApiError(403, 'This storefront belongs to another account.');
      return ensureFriendlyStoreSlug(tx, db, ref, seller.data()!);
    });
    return Response.json({ slug }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return safeResponse(error);
  }
}
