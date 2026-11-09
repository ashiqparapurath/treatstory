'use client';
import{OptimizedImage}from'@/components/optimized-image';
import{CARD_IMAGE_SIZES,safeImageSource}from'@/lib/image-source';
export function ProductImage({src,alt,sizes=CARD_IMAGE_SIZES,priority=false,loading='lazy'}:{src?:string;alt:string;sizes?:string;priority?:boolean;loading?:'lazy'|'eager'}){
 return <OptimizedImage src={safeImageSource(src)} alt={alt} fill sizes={sizes} priority={priority} loading={priority?undefined:loading} fetchPriority={priority?'high':loading==='eager'?'auto':'low'} decoding="async" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>;
}
