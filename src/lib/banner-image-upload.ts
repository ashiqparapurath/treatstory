'use client';

import { ActionError } from '@/lib/user-notices';

/**
 * Final banner upload stays comfortably below both the API's 4 MB file cap
 * and hosting providers' request limits (multipart framing adds some bytes).
 * Optimize only oversize images so smaller, text-heavy artwork stays lossless.
 */
export const MAX_ORIGINAL_BANNER_BYTES = 16_000_000;
export const BANNER_UPLOAD_TARGET_BYTES = 3_400_000;

async function renderBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/** Compress oversized banner artwork locally before the authorized server upload. */
export async function prepareBannerImage(file: File): Promise<File> {
  if (file.size <= BANNER_UPLOAD_TARGET_BYTES) return file;
  if (file.size > MAX_ORIGINAL_BANNER_BYTES) {
    throw new ActionError('Choose an image under 16 MB. Large banners are optimized automatically.', 413);
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new ActionError('Your browser could not optimize this banner. Export a smaller JPG or WebP file.', 413);
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Invalid banner image'));
      image.src = objectUrl;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('Invalid image dimensions');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas unavailable');

    // First preserve as much detail as possible; reduce size only as needed.
    const initialScale = Math.min(1, 2800 / Math.max(width, height));
    for (const sizeScale of [1, 0.85, 0.70, 0.55]) {
      const scale = initialScale * sizeScale;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const mime of ['image/webp', 'image/jpeg']) {
        for (const quality of [0.92, 0.84, 0.76]) {
          const blob = await renderBlob(canvas, mime, quality);
          if (!blob || blob.type !== mime) break;
          if (blob.size > 0 && blob.size <= BANNER_UPLOAD_TARGET_BYTES) {
            const extension = mime === 'image/webp' ? 'webp' : 'jpg';
            const name = file.name.replace(/\\.[^.]+$/, '') + '-optimized.' + extension;
            return new File([blob], name, { type: mime, lastModified: file.lastModified });
          }
        }
      }
    }
    throw new Error('Cannot compress enough');
  } catch {
    throw new ActionError('This banner could not be optimized for upload. Try exporting it as WebP or JPG under 3.4 MB.', 413);
  } finally {
    image.src = '';
    URL.revokeObjectURL(objectUrl);
  }
}
