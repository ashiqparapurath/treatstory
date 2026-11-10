import branding from "@/lib/pwa-branding.json";

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading TreatStory"
      className="relative grid min-h-[100dvh] place-items-center"
      style={{ backgroundColor: branding.background }}
    >
      <img
        className="pwa-launch-artwork"
        src={branding.artwork}
        alt="TreatStory — Since 2026"
        width={1562}
        height={1007}
        loading="eager"
        fetchPriority="high"
        decoding="sync"
      />
      <span
        className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 h-1 w-12 -translate-x-1/2 animate-pulse rounded-full bg-[#b49a78]"
        aria-hidden="true"
      />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
