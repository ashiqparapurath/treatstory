'use client';
import Image, { type ImageProps } from 'next/image';
import { cloudinaryImageLoader, isCloudinaryImage } from '@/lib/image-loader';

/** Public CDN transformations for unsigned images; keep signed/legacy URLs on the normal path. */
export function OptimizedImage({src,alt,...props}:Omit<ImageProps,'src'>&{src:string}) {
  return <Image {...props} src={src} alt={alt} {...(isCloudinaryImage(src)?{loader:cloudinaryImageLoader}:{})}/>;
}
