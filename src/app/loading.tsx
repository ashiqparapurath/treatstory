import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading page"
      aria-busy={true}
      className="section-shell space-y-6 py-8"
    >
      <span className="sr-only">Loading page…</span>
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((id) => (
          <Skeleton key={id} className="aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
