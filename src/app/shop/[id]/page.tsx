import type { Metadata } from 'next';
import SellerStoreClient from '@/components/seller-store-client';
import { getPublicStore } from '@/lib/server/public-store';
import { siteOrigin } from '@/lib/social-metadata';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const result = await getPublicStore(id);
  const canonical = '/shop/' + encodeURIComponent(id);
  if (result.kind === 'missing')
    return { title: 'Store unavailable', robots: { index: false, follow: false } };
  if (result.kind === 'unavailable')
    return { title: 'Discover Kerala makers', description: 'Explore independent creators and handmade finds on TreatStory.' };
  const { seller } = result.data;
  const description = (seller.description || ('Explore creations from ' + seller.businessName + ' on TreatStory.'))
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
  return {
    title: seller.businessName + ' — Handmade Creations in Kerala',
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
  const schema = data ? {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: data.seller.businessName,
    description: data.seller.description,
    url: new URL('/shop/' + encodeURIComponent(id), siteOrigin()).href,
    ...(data.seller.logoUrl?.startsWith('https://') ? { image: data.seller.logoUrl } : {}),
  } : null;
  return <>
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g,'\\u003c') }}/>}
    <SellerStoreClient initialSeller={data?.seller ?? null} initialProducts={data?.products ?? null}/>
  </>;
}
