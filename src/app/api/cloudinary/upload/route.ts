import { readBodyBytes } from '@/lib/server/request-body';
import { getServerFirebase, ApiError, safeResponse } from '@/lib/server/firebase-admin';
import { randomUUID } from 'node:crypto';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';

// Images are uploaded by this server route, never directly by an unsigned preset.
// The Cloudinary API secret stays on the server; the Firebase ID token is verified
// cryptographically before role and seller-access checks against Firestore rules.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BANNER_BYTES = 1_000_000;
const MAX_PRODUCT_BYTES = 2_000_000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function json(data: Record<string, unknown>, status: number) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function fileFormat(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

async function canUpload(projectId: string, uid: string, token: string, kind: 'banner' | 'product') {
  // Firestore REST checks read permissions with the SAME user ID token,
  // so this endpoint does not need a service-account private key.
  const docPath = kind === 'banner' ? 'roles_admin' : 'sellers';
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${docPath}/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Unable to verify account permissions against Firestore. Verify deployed rules.');
  if (kind === 'banner') return true;
  const document = await response.json() as {
    fields?: {
      ownerUid?: { stringValue?: string };
      status?: { stringValue?: string };
      accessEndsAt?: { timestampValue?: string };
    };
  };
  const fields = document.fields;
  return fields?.ownerUid?.stringValue === uid &&
    fields?.status?.stringValue === 'active' &&
    Date.parse(fields?.accessEndsAt?.timestampValue ?? '') > Date.now();
}

export async function POST(request: NextRequest) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!projectId || !cloudName || !apiKey || !apiSecret) {
    return json({ error: 'Image uploads are temporarily unavailable. Please contact support.',code:'UPLOAD_NOT_CONFIGURED' }, 503);
  }
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in before uploading images.' }, 401);
  const idToken = authHeader.slice(7).trim();
  let uid: string;
  try {
    const app = getApps().find(a => a.name === 'treatstory-image-upload') ??
      initializeApp({ projectId }, 'treatstory-image-upload');
    const verified = await getAuth(app).verifyIdToken(idToken);
    uid = verified.uid;
  } catch {
    return json({ error: 'Your login session could not be verified. Sign in again.' }, 401);
  }

  try {
    if ((await getServerFirebase().db.collection('account_deletions').doc(uid).get()).exists)
      return json({ error: 'This account is closing and cannot upload images.' }, 403);
  } catch { return json({ error: 'Unable to check account status. Try again later.' }, 503); }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_PRODUCT_BYTES + 50_000) return json({ error: 'Image upload is too large.' }, 413);
  let form: FormData;
  try {
    const bounded=await readBodyBytes(request,MAX_PRODUCT_BYTES+50_000);
    form=await new Response(bounded as BodyInit,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
  }catch(error){if(error instanceof ApiError)return safeResponse(error);return json({error:'Could not read the selected image.'},400);}
  const kind = form.get('kind');
  if (kind !== 'banner' && kind !== 'product' && kind !== 'reference' && kind !== 'logo') return json({ error: 'Invalid upload type.' }, 400);
  const file = form.get('file');
  if (!(file instanceof Blob)) return json({ error: 'Choose an image to upload.' }, 400);
  const maxSize = kind === 'banner' ? MAX_BANNER_BYTES : MAX_PRODUCT_BYTES;
  if (!file.size) return json({error:'The selected file is empty. Choose a different photo.'},400);
  if (!ALLOWED_TYPES.has(file.type)) return json({error:'Choose a JPG, PNG or WebP photo.'},415);
  if (file.size > maxSize)
    return json({ error: `Choose a JPG, PNG or WebP image under ${kind === 'banner' ? '1' : '2'} MB.` }, 413);

  try {
    let allowed = kind === 'reference' || await canUpload(projectId, uid, idToken, kind === 'logo' ? 'product' : kind);
    if (!allowed && kind === 'product') allowed = await canUpload(projectId, uid, idToken, 'banner'); // Admins can manage legacy products.
    if (!allowed) return json({ error: kind === 'banner'
      ? 'Only verified TreatStory administrators can upload banners.'
      : 'Only active sellers and verified administrators can upload product photos.' }, 403);
  } catch (error) {
    console.error('Cloudinary upload role check failed', error);
    return json({ error: 'Unable to verify your upload permissions. Please try again later.' }, 503);
  }

  // Inspect binary signatures, not only the MIME type supplied by the browser.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = fileFormat(bytes);
  if (!detected || (file.type !== detected && !(file.type === 'image/jpeg' && detected === 'image/jpeg'))) {
    return json({ error: 'The selected file is not a valid JPG, PNG or WebP image.' }, 400);
  }

  {
    try {
      const { db } = getServerFirebase();
      const ref = db.collection(kind === 'reference' ? 'custom_quote_upload_limits' : 'image_upload_limits').doc(uid + '_' + new Date().toISOString().slice(0, 10));
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const count = snapshot.data()?.count || 0;
        if (count >= (kind === 'reference' ? 10 : 100)) throw new ApiError(429, 'Daily photo upload limit reached. Please try again tomorrow.');
        tx.set(ref, { buyerUid: uid, count: count + 1 });
      });
    } catch (error) { return safeResponse(error); }
  }
  const folder = kind === 'banner' ? `treatstory/banners/${uid}` : kind === 'reference' ? `treatstory/references/${uid}` : kind === 'logo' ? `treatstory/logos/${uid}` : `treatstory/products/${uid}`;
  const upload = new FormData();
  upload.append('file', new Blob([bytes], { type: detected }), `photo.${detected.split('/')[1] === 'jpeg' ? 'jpg' : detected.split('/')[1]}`);
  upload.append('folder', folder);
  upload.append('public_id', randomUUID());
  upload.append('overwrite', 'false');

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64') },
      body: upload,
      cache: 'no-store',signal:AbortSignal.timeout(15_000),
    });
    const result = await response.json() as { secure_url?: string; public_id?: string; error?: { message?: string } };
    if (!response.ok || !result.secure_url || !result.public_id) {
      console.error('Cloudinary upload failed', response.status, result.error?.message);
      return json({ error: 'This image could not be uploaded. Try a smaller photo or try again later.' }, 502);
    }
    const assetUrl = new URL(result.secure_url);
    if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== 'res.cloudinary.com') {
      return json({ error: 'The image could not be saved. Please try again.' }, 502);
    }
    return json({ url: result.secure_url, publicId: result.public_id }, 200);
  } catch (error) {
    console.error('Cloudinary upload transport failed', error);
    return json({ error: 'Image upload is temporarily unavailable. Please retry.' }, 502);
  }
}
