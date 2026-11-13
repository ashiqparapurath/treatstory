import { cache } from 'react';
import { firestoreDocumentId } from '@/lib/document-id';
import { getServerFirebase } from '@/lib/server/firebase-admin';
import type { Seller, MarketplaceProduct } from '@/lib/marketplace-types';

type PublicStoreData = { seller: Seller; products: MarketplaceProduct[] };
export type PublicStoreResult =
  | { kind: 'found'; data: PublicStoreData }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

const sellerFields = [
  'businessName','businessCategory','description','logoUrl','coverUrl','isOpen',
  'deliveryMethods','deliveryPincodes','status',
] as const;
const productFields = [
  'name','description','price','category','imageUrls','showPrice','sellerId',
  'status','availability','sku',
] as const;

export const getPublicStore = cache(async (id: string):Promise<PublicStoreResult> => {
  if (!firestoreDocumentId().safeParse(id).success) return { kind: 'missing' };
  let timer: ReturnType<typeof setTimeout>|undefined;
  const load = async ():Promise<PublicStoreResult> => {
    try {
      const { db } = getServerFirebase();
      const snapshot = await db.collection('sellers').doc(id).get();
      if (!snapshot.exists) return { kind: 'missing' };
      const data = snapshot.data()!;
      if (data.status !== 'active' || typeof data.businessName !== 'string' || !data.businessName.trim())
        return { kind: 'missing' };
      const seller:Record<string,unknown>={ id };
      for (const field of sellerFields) if(data[field] !== undefined && data[field] !== null) seller[field]=data[field];
      let products:MarketplaceProduct[]=[];
      try {
        const listing = await db.collection('marketplace_products')
          .where('sellerId','==',id).where('status','==','published').limit(32).get();
        products=listing.docs.map(doc=>{
          const fields:Record<string,unknown>={id:doc.id};
          const source=doc.data();
          for(const field of productFields) if(source[field] !== undefined && source[field] !== null)fields[field]=source[field];
          return fields as unknown as MarketplaceProduct;
        });
      } catch {
        // Product data is optional for a live public store page.
      }
      return { kind:'found', data:{seller:seller as unknown as Seller,products} };
    } catch {return {kind:'unavailable'};}
  };
  try {
    return await Promise.race([
      load(),
      new Promise<PublicStoreResult>(resolve=>{timer=setTimeout(()=>resolve({kind:'unavailable'}),2500);}),
    ]);
  } finally { if(timer)clearTimeout(timer); }
});
