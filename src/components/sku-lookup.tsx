'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { normalizeProductSku } from '@/lib/product-sku';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SkuLookup({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const sku = normalizeProductSku(code);
    if (!sku) {
      setError('Use an eight-character code, such as TS-AB23CD45.');
      return;
    }
    setCode(sku);
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/products/sku?sku=' + encodeURIComponent(sku), { cache: 'no-store' });
      if (response.status === 404) {
        setError('No published product uses this code. Check the reel or ask the seller.');
        return;
      }
      if (!response.ok) {
        setError('Could not search right now. Please try again.');
        return;
      }
      const result: { productId?: unknown; sku?: unknown } = await response.json();
      if (typeof result.productId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result.productId) || result.sku !== sku) {
        setError('Could not verify this product. Please try again.');
        return;
      }
      router.push('/product/seller:' + encodeURIComponent(result.productId));
    } catch {
      setError('Connection interrupted. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return <section aria-label="Find product by SKU" className={compact ? 'mt-5 max-w-lg' : 'mb-8 rounded-2xl border border-[#e9e0d5] bg-[#fbf7f0] p-4 sm:p-5'}>
    <div className="mb-2">
      <p className="text-xs font-semibold text-[#59472f]">{compact ? 'Saw it on Instagram?' : 'Seen a creation in an Instagram reel?'}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter the TreatStory product code from the reel to find the exact item.</p>
    </div>
    <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Product SKU from Instagram</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92775a]" />
        <Input type="search" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={32}
          aria-label="Product SKU from Instagram" aria-invalid={!!error} placeholder="e.g. TS-AB23CD45"
          value={code} onChange={e => { setCode(e.target.value); setError(''); }}
          className="h-11 rounded-full border-[#dacbb6] bg-white pl-11 font-mono text-sm uppercase" />
      </label>
      <Button type="submit" disabled={loading} className="h-11 shrink-0 rounded-full px-6">
        {loading ? 'Finding…' : 'Find product'}
      </Button>
    </form>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </section>;
}
