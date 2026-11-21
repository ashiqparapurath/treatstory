import { permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import SellerStoreClient from '@/components/seller-store-client';
import { CatalogMaintenanceGate } from '@/components/catalog-maintenance-gate';
import { getPublicStore } from '@/lib/server/public-store';
import { storefrontShareUrl } from '@/lib/storefront-share';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const result = await getPublicStore(id);
  const canonical = storefrontShareUrl(result.kind === 'found' ? result.data.seller.slug || id : id);
  if (result.kind === 'missing')
    return { title: 'Store unavailable', robots: { index: false, follow: false } };
  if (result.kind === 'unavailable')
    return { title: 'Discover Indian makers', description: 'Explore independent creators and handmade finds on TreatStory.' };
  const { seller } = result.data;
  const description = (seller.description || ('Explore creations from ' + seller.businessName + ' on TreatStory.'))
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
  return {
    title: seller.businessName + ' — Handmade Creations in ' + ([seller.businessCity, seller.businessState].filter(Boolean).join(', ') || 'India'),
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title: seller.businessName + ' | TreatStory',
      description,
      ...(seller.logoUrl && seller.logoUrl.startsWith('https://') ? { images: [{ url: seller.logoUrl, alt: seller.businessName + ' store logo' }] } : {}),
    },
  };
}

export default async function SellerStorePage({ params }: Params) {
  const { id } = await params;
  const result = await getPublicStore(id);
  const data = result.kind === 'found' ? result.data : null;
  if (data?.seller.slug && data.seller.slug !== id) permanentRedirect('/shop/' + encodeURIComponent(data.seller.slug));
  const schema = data ? {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: data.seller.businessName,
    description: data.seller.description,
    url: storefrontShareUrl(data.seller.slug || id),
    ...(data.seller.logoUrl?.startsWith('https://') ? { image: data.seller.logoUrl } : {}),
  } : null;
  return <>
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g,'\\u003c') }}/>}
    <CatalogMaintenanceGate standalone><SellerStoreClient initialSeller={data?.seller ?? null} initialProducts={data?.products ?? null}/></CatalogMaintenanceGate>
  </>;
}
