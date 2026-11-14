import type { NextRequest } from 'next/server';
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from '@/lib/server/firebase-admin';
import { signedMediaDownload } from '@/lib/server/media';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { uid, db } = await verifiedUser(request);
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
      throw new ApiError(404, 'Photo unavailable.');
    const asset = (await db.doc('media_assets/' + id).get()).data();
    if (!asset || asset.kind !== 'reference' || asset.type !== 'authenticated')
      throw new ApiError(404, 'Photo unavailable.');
    if (asset.ownerUid !== uid) {
      const quote = asset.quoteId
        ? (await db.doc('custom_quotes/' + asset.quoteId).get()).data()
        : null;
      if (!quote || quote.sellerId !== uid)
        throw new ApiError(403, 'This photo is private.');
      if ((await db.doc('account_deletions/' + asset.ownerUid).get()).exists)
        throw new ApiError(403, 'Photo unavailable.');
    }
    const response = await fetch(
      signedMediaDownload(asset.publicId, asset.format),
      {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new ApiError(503, 'Photo could not be loaded.');
    return new Response(response.body, {
      headers: {
        'Content-Type':
          asset.format === 'jpg' ? 'image/jpeg' : 'image/' + asset.format,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (error) {
    return safeResponse(error);
  }
}
