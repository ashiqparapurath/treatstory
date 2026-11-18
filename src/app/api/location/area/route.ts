import type { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ApiError, getServerFirebase, safeResponse } from '@/lib/server/firebase-admin';
import { readJsonBody } from '@/lib/server/request-body';
import { approximateAreaLabel } from '@/lib/location-area';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

/** Public because shoppers can browse before creating an account.
 * Coordinates arrive rounded to ~1km; neither coordinates nor reverse results
 * are stored. Existing Firestore distributed provider limiter is shared with
 * the signed-in checkout address feature to protect public Nominatim quotas.
 */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new ApiError(403, 'Cross-site location lookup is not permitted.');
    }
    const parsed = schema.safeParse(await readJsonBody(request, 300));
    if (!parsed.success) throw new ApiError(400, 'Invalid approximate location.');
    const { latitude, longitude } = parsed.data;
    // Defense in depth: prevent forwarding house-level coordinates even for direct API calls.
    const roundedLatitude = latitude.toFixed(2), roundedLongitude = longitude.toFixed(2);

    const { db } = getServerFirebase();
    const limiter = db.collection('geocoding_limits').doc('service');
    await db.runTransaction(async tx => {
      const current = await tx.get(limiter);
      const data = current.data() || {};
      const now = Date.now(), minute = Math.floor(now / 60000);
      const count = data.publicMinute === minute ? Number(data.publicCount || 0) : 0;
      if (count >= 20 || now - (data.requestedAt?.toMillis?.() || 0) < 1300) {
        throw new ApiError(429, 'Location lookup is busy. Tap the location icon to retry.');
      }
      tx.set(limiter, {
        requestedAt: Timestamp.fromMillis(now),
        publicMinute: minute, publicCount: count + 1,
      }, { merge: true });
    });

    const url = new URL(process.env.NOMINATIM_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse');
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new ApiError(503, 'Area names are temporarily unavailable.');
    }
    url.search = new URLSearchParams({
      format: 'jsonv2', lat: roundedLatitude, lon: roundedLongitude,
      zoom: '10', addressdetails: '1', 'accept-language': 'en',
    }).toString();
    let result: Response;
    try {
      result = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'TreatStory/1.0 (https://treatstory.vercel.app)', Accept: 'application/json' },
      });
    } catch {
      throw new ApiError(503, 'Area names are temporarily unavailable.');
    }
    if (!result.ok) throw new ApiError(result.status === 429 ? 429 : 503, 'Area names are temporarily unavailable.');
    const label = approximateAreaLabel(await result.json().catch(() => null));
    if (!label) throw new ApiError(422, 'Could not identify an area for these coordinates.');
    return Response.json({ label }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return safeResponse(error);
  }
}
