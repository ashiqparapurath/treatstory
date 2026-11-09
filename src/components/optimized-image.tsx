'use client';
import Image,{type ImageProps}from'next/image';
import{useState}from'react';
import{cloudinaryImageLoader,isCloudinaryImage}from'@/lib/image-loader';
import{IMAGE_FALLBACK,safeImageSource,canOptimizeImage}from'@/lib/image-source';
/** Preserve the latest URL; a failed image gets one local fallback, not a broken page. */
export function OptimizedImage({src,alt,onError,unoptimized,...props}:Omit<ImageProps,'src'>&{src:string}){
 const[failed,setFailed]=useState<string>();const current=safeImageSource(src),source=failed===current?IMAGE_FALLBACK:current;
 return <Image key={source} {...props} src={source} alt={alt} unoptimized={unoptimized??!canOptimizeImage(source)} {...(isCloudinaryImage(source)?{loader:cloudinaryImageLoader}:{})} onError={event=>{if(source!==IMAGE_FALLBACK)setFailed(current);onError?.(event);}}/>;
}
