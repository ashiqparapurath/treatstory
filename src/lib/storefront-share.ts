/** Canonical public store URL, independent of temporary Vercel preview domains. */
const STORE_ORIGIN = 'https://treatstory.vercel.app';

export function storefrontShareUrl(sellerId: string): string {
  return new URL('/shop/' + encodeURIComponent(sellerId), STORE_ORIGIN).href;
}

export function storefrontWhatsAppUrl(sellerId: string, storeName: string): string {
  return 'https://wa.me/?text=' + encodeURIComponent(
    'Explore ' + storeName + ' on TreatStory\n' + storefrontShareUrl(sellerId),
  );
}
