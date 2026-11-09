import { readJsonBody } from '@/lib/server/request-body';
import { after } from 'next/server';
import { processMailQueue } from '@/lib/server/mail';
import { type NextRequest } from 'next/server';
import { checkoutRequestSchema } from '@/lib/checkout-schema';
import { placeAtomicCheckout } from '@/lib/server/atomic-checkout';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { uid, db, auth } = await verifiedUser(request);
    const body: unknown = await readJsonBody(request,25000);
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'Review the checkout fields and try again.');
    const result = await placeAtomicCheckout(db, uid, parsed.data);
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
