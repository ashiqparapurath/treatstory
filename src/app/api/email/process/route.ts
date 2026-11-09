import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getServerFirebase, safeResponse, ApiError } from '@/lib/server/firebase-admin';
import { processMailQueue } from '@/lib/server/mail';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:NextRequest) {
  try {
    const secret=process.env.CRON_SECRET;
    const supplied=request.headers.get('authorization')||'';
    const expected=`Bearer ${secret}`;
    if(!secret||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new ApiError(401,'Not authorized.');
    const {db,auth}=getServerFirebase();
    return Response.json(await processMailQueue(db,auth,3),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return safeResponse(error);}
}
