import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';

/**
 * Server-only Firebase access. The service account JSON is never exposed to
 * a browser, and the project ID must match the client Firebase project.
 */
export function getServerFirebase() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!projectId || !raw) {
    console.error('Secure marketplace configuration missing', { projectIdConfigured: !!projectId, serviceAccountConfigured: !!raw });
    throw new ApiError(503, 'Secure requests are not available yet. Please contact support.', { code: 'SERVICE_NOT_CONFIGURED' });
  }
  let key: { project_id?: string; client_email?: string; private_key?: string };
  try { key = JSON.parse(raw); } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    throw new ApiError(503, 'Secure requests are not available yet. Please contact support.', { code: 'SERVICE_NOT_CONFIGURED' });
  }
  if (!key || key.project_id !== projectId || typeof key.client_email !== 'string' || typeof key.private_key !== 'string' || !key.client_email || !key.private_key) {
    console.error('Firebase service account does not match the configured project.');
    throw new ApiError(503, 'Secure requests are not available yet. Please contact support.', { code: 'SERVICE_NOT_CONFIGURED' });
  }
  try {
    const app = getApps().find(a => a.name === 'treatstory-orders') ||
      initializeApp({ credential: cert({ projectId, clientEmail: key.client_email, privateKey: key.private_key.replace(/\\n/g, '\n') }), projectId }, 'treatstory-orders');
    return { auth: getAuth(app), db: getFirestore(app) };
  } catch {
    console.error('Secure marketplace service account could not be initialized. Check its email and private key.');
    throw new ApiError(503, 'Secure requests are not available yet. Please contact support.', { code: 'SERVICE_NOT_CONFIGURED' });
  }
}

export async function verifiedUser(request: NextRequest) {
  const bearer = request.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ') || !bearer.slice(7).trim()) throw new ApiError(401, 'Sign in to continue.');
  const firebase = getServerFirebase();
  let uid: string;
  try {
    const user = await firebase.auth.verifyIdToken(bearer.slice(7).trim(), true);
    uid = user.uid;
  } catch { throw new ApiError(401, 'Your session has expired. Please sign in again.'); }
  return { ...firebase, uid };
}
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export function safeResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message, details: error.details }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  console.error('TreatStory API unexpected error', {code:typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'INTERNAL_ERROR'});
  return Response.json({ error: 'Unable to complete your request. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
