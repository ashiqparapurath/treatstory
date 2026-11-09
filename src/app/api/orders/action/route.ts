import {firestoreDocumentId} from '@/lib/document-id';
import { readJsonBody } from '@/lib/server/request-body';
import { after } from 'next/server';
import { processMailQueue } from '@/lib/server/mail';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { applyOrderAction } from '@/lib/server/order-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  orderId: firestoreDocumentId(160),
  action: z.enum(['accepted','rejected','preparing','ready','out-for-delivery','completed','cancelled',
    'request-cancellation','decline-cancellation','cod-collected']),
  reason: z.string().max(300).default(''),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const { uid, db, auth } = await verifiedUser(request);
    if (Number(request.headers.get('content-length') || 0) > 4_096)
      throw new ApiError(413, 'Request is too large.');
    const raw: unknown = await readJsonBody(request,4096);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, 'Choose a valid action.');
    const result = await applyOrderAction(db, uid, parsed.data.orderId, parsed.data.action, parsed.data.reason);
    after(async()=>{try{await processMailQueue(db,auth,3);}catch{console.error('Mail queue processing unavailable');}});
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return safeResponse(error); }
}
