import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Retire pilot writes instead of leaving a single-device bypass beside Matrix.
 * Existing ciphertext and original key records remain intact. Authorized
 * original devices use /api/support-matrix/legacy for explicit history import.
 */
function retiredPilot() {
  if (process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED !== 'true') return Response.json({ error: 'Secure chat is not enabled.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ error: 'The single-device encrypted pilot has been retired. Use verified encrypted support and its history import to access recoverable conversations.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(_request: NextRequest) { return retiredPilot(); }
export async function POST(_request: NextRequest) { return retiredPilot(); }
