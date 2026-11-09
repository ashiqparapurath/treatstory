'use client';
import Link from 'next/link';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { Heart } from 'lucide-react';
import { FavoriteToggle } from '@/components/favorite-toggle';

type Favorite = { id: string; productId: string; title: string; imageUrl?: string };
export default function FavoritesPage() {
  const {user,isUserLoading} = useUser();
  const db = useFirestore();
  const ref = useMemoFirebase(() => user && db ? query(collection(db,'favorites',user.uid,'items'),orderBy('createdAt','desc'),limit(100)) : null,[db,user?.uid]);
  const {data, isLoading, error} = useCollection<Favorite>(ref);
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell py-12"><p className="eyebrow text-[#a68a64]">Saved creations</p><h1 className="mt-3 text-4xl font-medium">Wishlist</h1><p className="mt-3 text-sm text-muted-foreground">Keep a little collection of the creators and products you love.</p>
    {!user && !isUserLoading ? <div className="mt-8 rounded-2xl border bg-white p-8 text-sm"><p>Sign in to save your wishlist across devices.</p><Link href="/login" className="editorial-button mt-4">Sign in</Link></div> :
      isLoading || isUserLoading ? <div className="mt-8 h-32 animate-pulse rounded-2xl bg-[#eee8df]"/> :
      error ? <p className="mt-8 rounded-2xl border bg-white p-6 text-sm" role="alert">Could not load your wishlist. Check your connection and try again.</p> :
      !data?.length ? <div className="mt-10 rounded-2xl border bg-white p-10 text-center"><Heart className="mx-auto h-10 w-10 text-[#b9a48b]"/><p className="mt-4 text-sm">Your wishlist is empty.</p><Link href="/products" className="mt-5 inline-block text-sm underline">Explore products</Link></div> :
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{data.map(item=><article key={item.id} className="overflow-hidden rounded-2xl border bg-white"><Link href={`/product/${encodeURIComponent(item.productId)}`}><div className="aspect-[4/5] overflow-hidden bg-[#f1eee9]">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy"/> : null}</div><h2 className="px-4 pt-4 text-sm font-semibold">{item.title}</h2></Link><div className="p-4"><FavoriteToggle productId={item.productId} title={item.title} imageUrl={item.imageUrl}/></div></article>)}</div>}
  </main></div>;
}
