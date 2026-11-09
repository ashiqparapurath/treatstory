'use client';
import Link from 'next/link';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Header } from '@/components/header';
import { getErrorNotice } from '@/lib/user-notices';
import { Bell, Package, MessageCircle, LifeBuoy } from 'lucide-react';

type Notification = { id:string; title:string;message?:string;kind?:'order'|'quote'|'support';href?:string;orderId?:string; createdAt?:{toDate?:()=>Date} };
export default function NotificationsPage() {
  const {user, isUserLoading} = useUser();
  const db = useFirestore();
  const q = useMemoFirebase(() => db && user ? query(collection(db,'notifications',user.uid,'items'),orderBy('createdAt','desc'),limit(50)) : null,[db,user?.uid]);
  const {data, isLoading, error} = useCollection<Notification>(q);
  return <div className="min-h-screen bg-[#f8f6f2]"><Header/><main className="section-shell max-w-3xl py-12"><p className="eyebrow text-[#a68a64]">Creator updates</p><h1 className="mt-3 text-4xl font-medium">Notifications</h1><p className="mt-3 text-sm text-muted-foreground">Your recent order and seller updates, delivered inside TreatStory.</p>
    {!user && !isUserLoading ? <Link className="mt-8 inline-flex rounded-full border bg-white px-5 py-3 text-sm" href="/login?next=%2Fnotifications">Sign in to see your updates</Link> :
    isLoading || isUserLoading ? <div className="mt-8 h-24 animate-pulse rounded-2xl bg-[#eee9e0]"/> :
    error ? <p className="mt-8 text-sm text-red-700" role="alert">{getErrorNotice(error,'load').description}</p> :
    !data?.length ? <div className="mt-8 rounded-2xl border bg-white p-10 text-center"><Bell className="mx-auto h-9 w-9 text-[#a68a64]"/><p className="mt-4 text-sm">You're all caught up.</p></div> :
    <div className="mt-8 space-y-3">{data.map(item=>{const Icon=item.kind==='order'?Package:item.kind==='quote'?MessageCircle:item.kind==='support'?LifeBuoy:Bell;const href=item.href&&/^\/(orders|custom-orders|support)(?:\?|$)/.test(item.href)?item.href:item.orderId?'/orders':null;return <article key={item.id} className="flex gap-3 rounded-2xl border bg-white p-5"><Icon className="mt-1 h-5 w-5 shrink-0 text-[#a68a64]"/><div><p className="font-semibold">{item.title}</p>{item.message&&<p className="mt-2 text-sm leading-6 text-muted-foreground">{item.message}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.createdAt?.toDate?.()?.toLocaleString('en-IN') || 'Recently'}</p>{href && <Link href={href} className="mt-3 inline-block text-xs font-semibold underline">{item.kind==='quote'?'View quote':item.kind==='support'?'View support request':'View order'}</Link>}</div></article>;})}</div>}
  </main></div>;
}
