'use client';
import { ActionError } from '@/lib/user-notices';

import type { User } from 'firebase/auth';

export type ImageKind = 'banner' | 'product' | 'reference';

/** Uploads only after the server verifies the Firebase ID token and role. */
export async function uploadTreatStoryPhoto(user: User, file: File, kind: ImageKind): Promise<string> {
  if (!file.size) throw new ActionError('The selected file is empty. Choose a different photo.',400,'app/empty-photo');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new ActionError('Choose a JPG, PNG or WebP photo.',415,'app/photo-type');
  if (file.size > 2_000_000) throw new ActionError('Choose a photo up to 2 MB, or resize it before uploading.',413);
  const authToken = await user.getIdToken();
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch('/api/cloudinary/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
      cache: 'no-store',
    });
  } catch {
    throw new ActionError('Could not connect to image uploads.', undefined, 'unavailable');
  }
  const result = await response.json().catch(() => null) as { url?: string; error?: string;code?:string;details?:{code?:string} } | null;
  if (!response.ok || !result?.url) throw new ActionError(result?.error || 'The image could not be uploaded.', response.status,result?.code||result?.details?.code);
  if (!result.url.startsWith('https://res.cloudinary.com/')) throw new Error('Unexpected image upload response.');
  return result.url;
}
