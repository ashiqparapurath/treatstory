import type { Metadata } from "next";
import preview from "../../public/img/share-preview.jpg";
import { isCloudinaryImage } from "@/lib/image-loader";
const description =
  "Discover homemade treats, handmade gifts and thoughtful finds from independent creators at TreatStory.";
export function siteOrigin() {
  try {
    const url = new URL(process.env.APP_URL || "https://treatstory.vercel.app");
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.origin;
  } catch {}
  return "https://treatstory.vercel.app";
}
function brandImage() {
  return {
    url: new URL(preview.src, siteOrigin()).href,
    width: preview.width,
    height: preview.height,
    type: "image/jpeg",
    alt: "TreatStory — Little finds, lovely stories",
  };
}
export function siteSocialMetadata(): Metadata {
  const image = brandImage();
  return {
    metadataBase: new URL(siteOrigin()),
    openGraph: {
      type: "website",
      siteName: "TreatStory",
      locale: "en_IN",
      title: "TreatStory — Little finds, lovely stories",
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: "TreatStory — Little finds, lovely stories",
      description,
      images: [image],
    },
  };
}
export function productSocialImage(value: unknown, name: string) {
  if (typeof value !== "string" || !value) return brandImage();
  try {
    const url = new URL(value, siteOrigin());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /\.svg(?:$|\?)/i.test(url.pathname)
    )
      return brandImage();
    if (isCloudinaryImage(url.href)) {
      const prefix = "/image/upload/",
        at = url.pathname.indexOf(prefix) + prefix.length,
        segments = url.pathname.slice(at).split("/"),
        version = segments.findIndex((segment) => /^v\d+$/.test(segment));
      segments.splice(
        version < 0 ? 0 : version,
        0,
        "c_pad,w_1200,h_630,b_rgb:faf8f3,g_center,f_jpg,q_85",
      );
      url.pathname = url.pathname.slice(0, at) + segments.join("/");
      return {
        url: url.href,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: name,
      };
    }
    return { url: url.href, alt: name };
  } catch {
    return brandImage();
  }
}
/** Public presentation only: prices, inventory counts, account fields and private notes are omitted. */
export function productSocialMetadata(
  record: Record<string, unknown> | null,
  routeId: string,
  sellerListing: boolean,
): Metadata {
  const canonical = new URL(
    "/product/" + encodeURIComponent(routeId),
    siteOrigin(),
  ).href;
  if (
    !record ||
    typeof record.name !== "string" ||
    (sellerListing && record.status !== "published")
  )
    return {
      title: "Product unavailable",
      robots: { index: false, follow: false },
      alternates: { canonical },
      openGraph: {
        ...siteSocialMetadata().openGraph,
        title: "Explore TreatStory",
        url: canonical,
      },
      twitter: { ...siteSocialMetadata().twitter, title: "Explore TreatStory" },
    };
  const name = record.name.slice(0, 120),
    summary =
      typeof record.description === "string"
        ? record.description
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180)
        : "";
  const text =
    summary ||
    `Discover ${name} on TreatStory. Open the product to see its latest details and availability.`;
  const photos = Array.isArray(record.imageUrls)
    ? record.imageUrls
        .filter((value): value is string => typeof value === "string")
        .flatMap((value) => value.split(/\r?\n/))
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const image = productSocialImage(photos[0], name);
  return {
    title: name,
    description: text,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "TreatStory",
      locale: "en_IN",
      title: `${name} | TreatStory`,
      description: text,
      url: canonical,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | TreatStory`,
      description: text,
      images: [image],
    },
  };
}
