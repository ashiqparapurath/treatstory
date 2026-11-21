/** Canonical public store URL, independent of temporary Vercel preview domains. */
const STORE_ORIGIN = 'https://treatstory.in';

export function storefrontShareUrl(sellerId: string): string {
  return new URL('/shop/' + encodeURIComponent(sellerId), STORE_ORIGIN).href;
}

export function storefrontWhatsAppUrl(sellerId: string, storeName: string): string {
  return 'https://wa.me/?text=' + encodeURIComponent(
    'Discover ' + storeName.trim().replace(/\s+/g, ' ').slice(0, 120) + ' on TreatStory. Shop their handmade creations:\n' + storefrontShareUrl(sellerId),
  );
}
