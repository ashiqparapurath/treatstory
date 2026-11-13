import type { MetadataRoute } from 'next';
import { getServerFirebase } from '@/lib/server/firebase-admin';
import { siteOrigin } from '@/lib/social-metadata';

export const dynamic = 'force-dynamic';

// Only public, canonical, index-worthy URLs. Do not include dashboards, drafts,
// private user data, or URL parameter variants.
const staticPages = [
  { path: '/', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/products', priority: 0.9, changeFrequency: 'daily' as const },
  { path: '/new-arrivals', priority: 0.8, changeFrequency: 'daily' as const },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/become-a-seller', priority: 0.7, changeFrequency: 'monthly' as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const pages: MetadataRoute.Sitemap = staticPages.map(page => ({
    url: new URL(page.path, origin).href,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
  try {
    const { db } = getServerFirebase();
    const [marketplace, legacy, stores] = await Promise.all([
      db.collection('marketplace_products').where('status', '==', 'published').limit(1000).get(),
      db.collection('products').limit(1000).get(),
      db.collection('sellers').where('status','==','active').limit(1000).get(),
    ]);
    const seen = new Set(pages.map(page => page.url));
    for (const store of stores.docs) {
      const data=store.data();
      if(data.status!=='active' || typeof data.businessName!=='string' || !data.businessName.trim())continue;
      const url=new URL('/shop/'+encodeURIComponent(store.id),origin).href;
      if(seen.has(url))continue;
      seen.add(url);
      const updated=data.updatedAt?.toDate?.()??data.createdAt?.toDate?.();
      pages.push({url,...(updated instanceof Date&&!Number.isNaN(updated.getTime())?{lastModified:updated}:{}),
        changeFrequency:'weekly',priority:0.7});
    }
    for (const [snapshot, seller] of [[marketplace, true], [legacy, false]] as const) {
      for (const doc of snapshot.docs) {
        const product = doc.data();
        if (typeof product.name !== 'string' || !product.name.trim()) continue;
        if (seller && product.status !== 'published') continue;
        const routeId = seller ? 'seller:' + doc.id : doc.id;
        const url = new URL('/product/' + encodeURIComponent(routeId), origin).href;
        if (seen.has(url)) continue;
        seen.add(url);
        const updatedAt = product.updatedAt?.toDate?.() ?? product.createdAt?.toDate?.();
        pages.push({
          url,
          ...(updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime()) ? { lastModified: updatedAt } : {}),
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
    }
  } catch {
    // If server Firebase credentials are not configured, a static sitemap is
    // still usable; do not expose internal Firebase errors to crawlers.
  }
  return pages;
}
