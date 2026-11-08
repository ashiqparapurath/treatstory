'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Heart } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export function FavoriteToggle({ productId, title, imageUrl }: { productId: string; title: string; imageUrl?: string }) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useMemoFirebase(() => user && db && productId ? doc(db,'favorites',user.uid,'items',productId) : null, [db,user?.uid,productId]);
  const { data, isLoading } = useDoc<{title:string}>(ref);
  if (!user) return <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-full border bg-white px-4 text-xs"><Heart className="h-4 w-4"/>Sign in to save</Link>;
  async function toggle() {
    if (!ref || busy || isLoading) return;
    setBusy(true);
    try {
      if (data) await deleteDoc(ref);
      else await setDoc(ref, { productId, title: title.slice(0,120), imageUrl: (imageUrl||'').slice(0,2000), createdAt:serverTimestamp() });
      toast({ title: data?'Removed from favourites':'Saved to favourites' });
    } catch (error) {
      toast({ variant:'destructive', title:'Could not update favourites', description:error instanceof Error?error.message:'Please retry.' });
    } finally { setBusy(false); }
  }
  return <button type="button" disabled={busy||isLoading} aria-pressed={!!data} aria-label={data?'Remove from favourites':'Add to favourites'} onClick={() => void toggle()} className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-xs ${data?'border-rose-300 bg-rose-50 text-rose-700':'bg-white text-[#685d52]'}`}><Heart className={`h-4 w-4 ${data?'fill-current':''}`}/>{data?'Saved':'Save for later'}</button>;
}
