import { cache } from 'react';
import { firestoreDocumentId } from '@/lib/document-id';
import { getServerFirebase } from '@/lib/server/firebase-admin';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import type { Product } from '@/lib/products';

export type PublicListing = {
  routeId: string;
  sellerListing: boolean;
  product: Product | MarketplaceProduct;
};
export type PublicListingResult =
  | { kind: 'found'; listing: PublicListing }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

// Only return explicitly public display fields to browser components.
// Do not serialize a full Firestore document or timestamps to the client.
const publicFields = [
  'name', 'description', 'price', 'category', 'categoryId', 'imageUrls',
  'showPrice', 'sellerId', 'status', 'availability', 'sku',
  'minimumOrderQuantity', 'weightOptions', 'weightValue', 'weightUnit',
  'stockQuantity', 'customizationOptions', 'ingredients', 'allergens',
  'dietaryTags', 'storageInstructions', 'shelfLifeDays', 'careInstructions',
  'preparationDays', 'advancePaymentRequired', 'selectedWeight',
] as const;

function normalizedId(rawId: string) {
  let id = rawId;
  for (let i = 0; i < 2; i++) {
    try {
      const value = decodeURIComponent(id);
      if (value === id) break;
      id = value;
    } catch { break; }
  }
  return id;
}

/** Per-request memoization shares the metadata, JSON-LD and HTML query. */
export const getPublicProduct = cache(async (rawId: string): Promise<PublicListingResult> => {
  const id = normalizedId(rawId);
  const sellerFirst = id.startsWith('seller:');
  const productId = sellerFirst ? id.slice(7) : id;
  if (!firestoreDocumentId().safeParse(productId).success) return { kind: 'missing' };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const lookUp = async (): Promise<PublicListingResult> => {
    try {
      const { db } = getServerFirebase();
      for (const seller of [sellerFirst, !sellerFirst]) {
        const snapshot = await db.collection(seller ? 'marketplace_products' : 'products').doc(productId).get();
        if (!snapshot.exists) continue;
        const data = snapshot.data()!;
        if (seller && data.status !== 'published') return { kind: 'missing' };
        if (typeof data.name !== 'string' || !data.name.trim()) return { kind: 'missing' };
        const safe: Record<string, unknown> = { id: snapshot.id };
        for (const key of publicFields) {
          if (data[key] !== undefined && data[key] !== null) safe[key] = data[key];
        }
        // Canonicalize a marketplace product to the prefixed public URL.
        return {
          kind: 'found',
          listing: {
            routeId: (seller ? 'seller:' : '') + productId,
            sellerListing: seller,
            product: safe as unknown as Product | MarketplaceProduct,
          },
        };
      }
      return { kind: 'missing' };
    } catch {
      return { kind: 'unavailable' };
    }
  };
  try {
    return await Promise.race([
      lookUp(),
      new Promise<PublicListingResult>(resolve => {
        timer = setTimeout(() => resolve({ kind: 'unavailable' }), 2500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
});
