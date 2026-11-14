import { createHash } from 'node:crypto';
import { ApiError } from './firebase-admin';
export function cloudinaryConfig() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME,
    key = process.env.CLOUDINARY_API_KEY,
    secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret)
    throw new ApiError(503, 'Media service is unavailable.');
  return { cloud, key, secret };
}
export function signedMediaDownload(publicId: string, format: string) {
  const { cloud, key, secret } = cloudinaryConfig();
  const params: Record<string, string> = {
    public_id: publicId,
    format,
    type: 'authenticated',
    timestamp: String(Math.floor(Date.now() / 1000)),
    expires_at: String(Math.floor(Date.now() / 1000) + 60),
  };
  const signature = createHash('sha256')
    .update(
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&') + secret,
    )
    .digest('hex');
  return (
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/download?` +
    new URLSearchParams({ ...params, api_key: key, signature })
  );
}
export async function destroyMedia(publicId: string, type = 'upload') {
  const { cloud, key, secret } = cloudinaryConfig();
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`,
    {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
      },
      body: new URLSearchParams({
        public_id: publicId,
        type,
        invalidate: 'true',
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = await response.json();
  if (!response.ok || !['ok', 'not found'].includes(body.result))
    throw new ApiError(
      503,
      'Photo removal is pending. Please retry account deletion.',
    );
}
