import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/social-metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/admin', '/account', '/cart', '/checkout',
        '/login', '/register', '/notifications', '/orders',
        '/profile', '/seller/dashboard', '/support', '/more',
      ],
    },
    sitemap: new URL('/sitemap.xml', siteOrigin()).href,
    host: siteOrigin(),
  };
}
