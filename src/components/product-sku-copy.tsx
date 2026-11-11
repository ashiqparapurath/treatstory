'use client';

import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ProductSkuCopy({ sku }: { sku: string }) {
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(sku);
      toast({ title: 'Product code copied', description: sku + ' is ready to add to your reel or caption.' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy code', description: 'Select the code and copy it manually.' });
    }
  }
  return <button type="button" onClick={() => void copy()} aria-label={'Copy SKU ' + sku}
    title="Copy product SKU" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d8c8b0] bg-white px-3 font-mono text-[11px] font-semibold tracking-wide text-[#6b5336] hover:bg-[#f7f0e6]">
    <span className="select-all">SKU: {sku}</span><Copy className="h-3.5 w-3.5 shrink-0" />
  </button>;
}
