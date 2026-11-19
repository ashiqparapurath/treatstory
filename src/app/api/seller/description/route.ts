import type { NextRequest } from 'next/server';
import { verifiedUser, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { suggestionRequest } from '@/lib/product-description';
import { descriptionQuota } from '@/lib/server/description-quota';
import { generateDescription } from '@/lib/server/gemini-description';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    return Response.json({ remaining: await descriptionQuota(db, uid, false) }, { headers });
  } catch (error) { return safeResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const parsed = suggestionRequest.safeParse(await readJsonBody(request, 24576));
    if (!parsed.success) throw new ApiError(400, 'Check the product name, category and public listing details.');
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ApiError(503, 'AI suggestions are unavailable. You can still save your product.');
    const remaining = await descriptionQuota(db, uid, true);
    const description = await generateDescription(parsed.data, key, remaining);
    return Response.json({ description, remaining }, { headers });
  } catch (error) { return safeResponse(error); }
}
