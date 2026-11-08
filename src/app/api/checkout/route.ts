import { type NextRequest } from 'next/server';
import { checkoutRequestSchema } from '@/lib/checkout-schema';
import { placeAtomicCheckout } from '@/lib/server/atomic-checkout';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    if (Number(request.headers.get('content-length') || 0) > 25_000) {
      throw new ApiError(413, 'This order request is too large.');
    }
    const body: unknown = await request.json().catch(() => { throw new ApiError(400, 'Invalid checkout request.'); });
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Review the checkout fields and try again.');
    const result = await placeAtomicCheckout(db, uid, parsed.data);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
