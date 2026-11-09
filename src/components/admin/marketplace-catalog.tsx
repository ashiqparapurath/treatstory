'use client';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PackageSearch } from 'lucide-react';

export function MarketplaceCatalog() {
  const db = useFirestore();
  const { toast } = useToast();
  const ref = useMemoFirebase(() => db ? collection(db, 'marketplace_products') : null, [db]);
  const { data: products, isLoading, error: loadError, retry: retryLoad } = useCollection<MarketplaceProduct>(ref);
  const [search, setSearch] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const visible = (products ?? []).filter(p => (p.name + ' ' + p.sellerId + ' ' + p.category).toLowerCase().includes(search.toLowerCase()));
  async function setVisibility(product: MarketplaceProduct) {
    if (!db || working) return;
    setWorking(product.id);
    try {
      await updateDoc(doc(db, 'marketplace_products', product.id), { status: product.status === 'published' ? 'draft' : 'published', updatedAt: serverTimestamp() });
      toast({ title: 'Listing visibility updated' });
    } catch { toast({ variant: 'destructive', title: 'Could not update listing' }); }
    finally { setWorking(null); }
  }
  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return <section className="space-y-5"><div><h2 className="text-2xl font-medium">Seller catalog</h2><p className="mt-1 text-sm text-muted-foreground">Review listings across all seller stores and control publication status.</p></div><Input className="max-w-sm rounded-full bg-white" aria-label="Search seller listings" placeholder="Search name, seller UID or category…" value={search} onChange={e => setSearch(e.target.value)} />{isLoading ? <p className="text-sm text-muted-foreground">Loading listings…</p> : visible.length === 0 ? <div className="rounded-3xl border bg-white p-12 text-center"><PackageSearch className="mx-auto h-8 w-8 text-[#a68a64]" /><p className="mt-4 text-sm text-muted-foreground">No seller listings found.</p></div> : <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#f1ede6] text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-4">Listing</th><th className="p-4">Seller UID</th><th className="p-4">Price</th><th className="p-4">Status</th><th className="p-4">Moderation</th></tr></thead><tbody>{visible.map(p => <tr key={p.id} className="border-t"><td className="p-4"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.category}</p></td><td className="p-4 font-mono text-xs">{p.sellerId.slice(0, 12)}…</td><td className="p-4">₹{p.price.toLocaleString('en-IN')}</td><td className="p-4 capitalize">{p.status}</td><td className="p-4"><Button size="sm" variant="outline" disabled={working !== null} onClick={() => setVisibility(p)}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</Button></td></tr>)}</tbody></table></div>}</section>;
}
