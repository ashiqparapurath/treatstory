"use client";
import { OptimizedImage } from '@/components/optimized-image';
import { useState } from 'react';
const optimizedHosts = new Set(['firebasestorage.googleapis.com', 'images.unsplash.com', 'picsum.photos', 'lh3.googleusercontent.com', 'res.cloudinary.com']);
export function ProductImage({ src, alt, sizes = '(max-width: 640px) 48vw, (max-width: 1024px) 30vw, 23vw', priority = false }: { src?: string; alt: string; sizes?: string; priority?: boolean }) {
  const [failed, setFailed] = useState<string>();
  const source = !src || failed === src ? '/img/product-placeholder.svg' : src;
  let optimize = source.startsWith('/');
  try { optimize ||= optimizedHosts.has(new URL(source).hostname); } catch {}
  return <OptimizedImage src={source} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!optimize} onError={() => setFailed(src)} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />;
}
