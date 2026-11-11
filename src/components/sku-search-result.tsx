'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';

type FoundProduct = { productId: string; sku: string; name: string };
type LookupState = { sku: string; status: 'loading' | 'found' | 'missing' | 'error'; product?: FoundProduct };

/** Appears inside the ordinary catalog search results; this is not an extra search field. */
export function SkuSearchResult({ sku }: { sku: string }) {
  const [lookup, setLookup] = useState<LookupState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLookup({ sku, status: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/products/sku?sku=' + encodeURIComponent(sku), {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setLookup({ sku, status: 'missing' });
          return;
        }
        if (!response.ok) {
          setLookup({ sku, status: 'error' });
          return;
        }
        const product: FoundProduct = await response.json();
        if (controller.signal.aborted) return;
        if (product.sku !== sku || !/^[A-Za-z0-9_-]{1,128}$/.test(product.productId) ||
            typeof product.name !== 'string' || !product.name.trim()) {
          setLookup({ sku, status: 'error' });
          return;
        }
        setLookup({ sku, status: 'found', product });
      } catch {
        if (!controller.signal.aborted) setLookup({ sku, status: 'error' });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sku]);

  const current = lookup?.sku === sku ? lookup : null;
  if (!current || current.status === 'loading')
    return <p role="status" className="rounded-2xl border border-[#e8e0d5] bg-white p-5 text-sm text-muted-foreground">Finding product {sku}…</p>;
  if (current.status === 'missing')
    return <p role="status" className="rounded-2xl border border-dashed border-[#ded4c7] bg-white/60 p-5 text-sm text-muted-foreground">No published product found for {sku}. Check the code and try again.</p>;
  if (current.status === 'error' || !current.product)
    return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Product lookup is temporarily unavailable. Please try again.</p>;

  return <Link href={'/product/seller:' + encodeURIComponent(current.product.productId)}
    className="group flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-[#e6dccc] bg-white px-5 py-4 shadow-sm transition hover:border-[#b99b72] hover:shadow-md"
    aria-label={'View ' + current.product.name + ', SKU ' + sku}>
    <span className="min-w-0">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#98764d]"><Search className="h-3.5 w-3.5" />{sku}</span>
      <span className="mt-1 block break-words text-base font-semibold text-[#29251f]">{current.product.name}</span>
      <span className="mt-1 block text-xs text-muted-foreground">View product details</span>
    </span>
    <ArrowUpRight className="h-5 w-5 shrink-0 text-[#98764d] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
  </Link>;
}
