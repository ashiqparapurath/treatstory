'use client';

import Image, { type ImageProps } from 'next/image';
import { CldImage } from 'next-cloudinary';

/**
 * Keep legacy Firebase, Base64, local and external images working while new
 * Cloudinary assets receive CDN-based automatic quality/format optimization.
 * Full Cloudinary HTTPS URLs are supported by CldImage; the existing Firestore
 * schema continues to save simple URL strings, not Cloudinary-specific IDs.
 */
export function OptimizedImage({
  src,
  alt,
  ...props
}: Omit<ImageProps, 'src'> & { src: string }) {
  const isCloudinary = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(src);
  if (isCloudinary && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    return (
      <CldImage
        {...props}
        src={src}
        alt={alt}
        crop="fill"
      />
    );
  }

  return <Image {...props} src={src} alt={alt} />;
}
