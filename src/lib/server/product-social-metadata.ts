import type { Metadata } from 'next';
import { getPublicProduct } from '@/lib/server/public-product';
import { productSocialMetadata, siteSocialMetadata } from '@/lib/social-metadata';

/** Product metadata, server-rendered detail and JSON-LD share the same public record per request. */
export async function getProductSocialMetadata(rawId: string): Promise<Metadata> {
  const result = await getPublicProduct(rawId);
  if (result.kind === 'unavailable') return siteSocialMetadata();
  if (result.kind === 'missing') return productSocialMetadata(null, rawId, rawId.startsWith('seller:'));
  const { product, routeId, sellerListing } = result.listing;
  return productSocialMetadata(product as unknown as Record<string, unknown>, routeId, sellerListing);
}
