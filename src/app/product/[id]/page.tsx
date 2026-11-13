import type { MarketplaceProduct } from '@/lib/marketplace-types';
import type { Product } from '@/lib/products';
import { getPublicProduct } from '@/lib/server/public-product';
import { siteOrigin } from '@/lib/social-metadata';
import ProductDetailClient from '@/components/product-detail-client';

export const dynamic = 'force-dynamic';

function productSchema(product: Product | MarketplaceProduct, routeId: string) {
  const url = new URL('/product/' + encodeURIComponent(routeId), siteOrigin()).href;
  const description = typeof product.description === 'string'
    ? product.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
    : '';
  const images = (Array.isArray(product.imageUrls) ? product.imageUrls : []).filter((image):image is string => {
    if (typeof image !== 'string') return false;
    try { return new URL(image).protocol === 'https:'; } catch { return false; }
  }).slice(0, 8);
  const record: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    url,
    ...(images.length ? { image: images } : {}),
  };
  const sellerProduct = product as MarketplaceProduct;
  if (typeof sellerProduct.sku === 'string' && sellerProduct.sku.trim()) record.sku = sellerProduct.sku.trim();
  const price = Number(product.price);
  if (product.showPrice === true && Number.isFinite(price) && price > 0) {
    const availability = sellerProduct.availability === 'unavailable' ? 'https://schema.org/OutOfStock'
      : sellerProduct.availability === 'available' && (typeof sellerProduct.stockQuantity !== 'number' || sellerProduct.stockQuantity > 0)
        ? 'https://schema.org/InStock' : undefined;
    record.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price,
      ...(availability ? { availability } : {}),
    };
  }
  return record;
}

/** Server-rendered product content for crawlers; the client component remains fully interactive. */
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPublicProduct(id);
  const listing = result.kind === 'found' ? result.listing : null;
  const schema = listing ? productSchema(listing.product, listing.routeId) : null;
  return <>
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}/>}
    <ProductDetailClient initialProduct={listing?.product ?? null} initialSellerListing={listing?.sellerListing ?? false}/>
  </>;
}
