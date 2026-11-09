import { getErrorNotice } from '@/lib/user-notices';
import { Skeleton } from '@/components/ui/skeleton';

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return <div role="status" aria-label="Loading products" className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4"><span className="sr-only">Loading products…</span>{Array.from({ length: count }, (_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-[22px]" />)}</div>;
}

export function SectionSkeleton() {
  return <div role="status" aria-label="Loading content" className="space-y-5 py-6"><span className="sr-only">Loading…</span><Skeleton className="h-8 w-48" /><div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div></div>;
}

export function LoadError({retry,error}: {retry:()=>void;error?:unknown}) {
  const notice=getErrorNotice(error,'load');
  return <div role="alert" className="rounded-2xl border bg-white p-6"><p className="font-medium">{notice.title}</p><p className="mt-2 text-sm text-muted-foreground">{notice.description}</p><button type="button" onClick={retry} className="mt-4 min-h-11 rounded-xl border px-5 text-sm font-semibold">Try again</button></div>;
}

/** Keeps the dashboard's navigation and content geometry visible while auth resolves. */
export function DashboardShellSkeleton({ title }: { title: string }) {
  return <div role="status" aria-label={`Loading ${title} workspace`} className="section-shell grid min-w-0 gap-4 py-4 sm:gap-6 sm:py-8 lg:grid-cols-[230px_minmax(0,1fr)]">
    <aside className="space-y-3"><div className="rounded-2xl bg-[#29251f] p-5"><p className="text-xs font-medium text-[#d2b58b]">TreatStory</p><h2 className="mt-2 text-lg font-medium text-white">{title}</h2><Skeleton className="mt-4 h-3 w-24 bg-white/20" /></div><div className="flex gap-2 lg:flex-col">{[0,1,2,3].map(n => <Skeleton key={n} className="h-11 min-w-12 flex-1 rounded-xl lg:flex-none" />)}</div></aside>
    <main className="min-w-0 space-y-5"><div><p className="text-xs uppercase tracking-widest text-[#a68a64]">Workspace</p><h1 className="mt-2 text-2xl font-medium">{title}</h1></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0,1,2].map(n => <Skeleton key={n} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-56 rounded-2xl" /></main>
  </div>;
}
