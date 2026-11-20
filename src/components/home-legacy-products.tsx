'use client';
import { ProductGridSkeleton, LoadError } from '@/components/loading-states';
import { usePublicCatalog } from '@/firebase/firestore/use-public-catalog';
import { ProductGridContainer } from '@/components/product-grid';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, limit } from 'firebase/firestore';
import type { Product } from '@/lib/products';

export default function HomeLegacyProducts() {
  const firestore = useFirestore();
  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'products'), limit(8));
  }, [firestore]);
  const { data: products, isLoading, error, retry } = usePublicCatalog<Product>(productsQuery);

  if (error) return <LoadError retry={retry} error={error} />;
  if (isLoading) return <ProductGridSkeleton count={8} />;
  if (!products?.length) return null;
  return <ProductGridContainer products={products} mobileCompact />;
}
