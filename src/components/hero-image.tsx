"use client";
import { useState } from "react";
import { heroImages } from "@/lib/hero-images";
const sizes =
  "(max-width: 639px) calc(100vw - 32px), (max-width: 767px) calc(100vw - 48px), (max-width: 1023px) calc((100vw - 80px) * 0.525), (max-width: 1439px) calc((100vw - 120px) * 0.525), 693px";
const set = (files: readonly { src: string; width: number }[]) =>
  files.map((file) => `${file.src} ${file.width}w`).join(", ");
/** Native responsive sources avoid a cold server image encode on the first visit. */
export function HeroImage({ alt }: { alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <picture className="absolute inset-0 block">
      {!failed && (
        <>
          <source
            media="(min-width: 1024px)"
            type="image/avif"
            srcSet={set(heroImages.desktop.avif)}
            sizes={sizes}
          />
          <source
            media="(min-width: 1024px)"
            type="image/webp"
            srcSet={set(heroImages.desktop.webp)}
            sizes={sizes}
          />
          <source
            media="(min-width: 768px)"
            type="image/avif"
            srcSet={set(heroImages.tablet.avif)}
            sizes={sizes}
          />
          <source
            media="(min-width: 768px)"
            type="image/webp"
            srcSet={set(heroImages.tablet.webp)}
            sizes={sizes}
          />
          <source
            type="image/avif"
            srcSet={set(heroImages.mobile.avif)}
            sizes={sizes}
          />
        </>
      )}
      <img
        src={failed ? "/img/landing-hero.webp" : heroImages.mobile.webp[1].src}
        srcSet={failed ? undefined : set(heroImages.mobile.webp)}
        sizes={failed ? undefined : sizes}
        alt={alt}
        width={1671}
        height={941}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </picture>
  );
}
