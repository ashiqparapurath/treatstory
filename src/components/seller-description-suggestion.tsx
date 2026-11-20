'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Info, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useToast } from '@/hooks/use-toast';
import type { ProductDraft } from './seller-product-editor';
import { suggestionRequest } from '@/lib/product-description';

const endpoint = '/api/seller/description';
type Session = Pick<User, 'getIdToken'>;

/** Kept intentionally small: the description textarea itself is the editable preview. */
export function SellerDescriptionSuggestion({ draft, user, onUse }: {
  draft: ProductDraft; user: Session; onUse: (description: string) => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const lookup = useRef<AbortController | null>(null);
  const latestDescription = useRef(draft.description);
  const { toast } = useToast();

  useEffect(() => { latestDescription.current = draft.description; }, [draft.description]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      lookup.current?.abort();
      const controller = new AbortController();
      lookup.current = controller;
      try {
        const token = await user.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch(endpoint, {
          headers: { Authorization: 'Bearer ' + token }, signal: controller.signal, cache: 'no-store',
        });
        const result = await response.json();
        if (!controller.signal.aborted && response.ok && Number.isInteger(result.remaining))
          setRemaining(result.remaining);
      } catch { /* The next generation also returns the current quota. */ }
    }
    function onDayStart() {
      setRemaining(null);
      void refresh();
      timer = setTimeout(onDayStart, 86400000 - Date.now() % 86400000 + 100);
    }
    onDayStart();
    return () => { clearTimeout(timer); lookup.current?.abort(); pending.current?.abort(); };
  }, [user]);

  async function generate() {
    if (pending.current || remaining === 0) return;
    const options = draft.weightOptions.length
      ? draft.weightOptions : [{ value: draft.weightValue, unit: draft.weightUnit }];
    const input = suggestionRequest.safeParse({
      name: draft.name, category: draft.category, details: draft.description, ingredients: draft.ingredients,
      features: [draft.customizationOptions, draft.careInstructions].filter(Boolean).join('\n'),
      sizes: options.filter(o => o.value.trim()).map(o => ({ value: Number(o.value), unit: o.unit })),
      style: 'Professional', language: 'English',
    });

    if (!input.success) {
      toast({ variant: 'destructive', title: 'Add product details first',
        description: 'Enter a product name and category. Use public details, valid sizes, and no contact links.' });
      return;
    }

    lookup.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const descriptionAtRequest = draft.description;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      if (controller.signal.aborted) return;
      const response = await fetch(endpoint, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data), signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;

      const count = response.ok ? result.remaining : result.details?.remaining;
      if (Number.isInteger(count)) setRemaining(count);
      const suggestion = typeof result.description === 'string' ? result.description.trim() : '';
      if (response.ok && suggestion && suggestion.length <= 2000) {
        // Avoid overwriting anything a seller typed while the request was in progress.
        if (latestDescription.current !== descriptionAtRequest) {
          toast({ title: 'Your edits were kept',
            description: 'The description changed while AI was writing. Try again if you want a new suggestion.' });
          return;
        }
        onUse(suggestion);
        toast({ title: 'Description added', description: 'Review or edit the suggested text before saving.' });
      } else {
        toast({ variant: 'destructive', title: 'AI suggestion unavailable',
          description: result.error || 'You can continue editing your description manually.' });
      }
    } catch {
      if (!controller.signal.aborted)
        toast({ variant: 'destructive', title: 'AI suggestion unavailable',
          description: 'Could not reach suggestions. You can still save your product.' });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }

  return <div className="flex shrink-0 items-center gap-1">
    <Button type="button" variant="outline" size="sm"
      className="h-8 shrink-0 rounded-full border-[#e4d9ca] bg-white px-2.5 text-[11px] font-medium text-[#654b36] hover:bg-[#f7f3ed] sm:px-3 sm:text-xs"
      disabled={busy || remaining === 0} onClick={generate} aria-controls="creatorDescription"
      title={remaining === 0 ? 'Daily AI limit reached; resets at midnight UTC.'
        : remaining !== null ? `${remaining} AI suggestions left today` : 'Suggest a product description'}>
      {busy ? <LoaderCircle aria-hidden className="mr-1.5 h-3.5 w-3.5 motion-safe:animate-spin" />
        : <Sparkles aria-hidden className="mr-1.5 h-3.5 w-3.5" />}
      {busy ? 'Writing…' : 'Suggest with AI'}
    </Button>
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="How AI suggestions work"
          className="inline-flex h-8 w-6 shrink-0 items-center justify-center rounded-full text-[#8a7b6d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#754328]">
          <Info aria-hidden className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="max-w-[min(18rem,calc(100vw-2rem))] space-y-2 p-3 text-xs leading-5">
        <p>Google AI receives public product details to write suggestions. Free-tier inputs and suggestions may be reviewed by people and used to improve Google products. Do not include private information.</p>
        <a className="underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s terms</a>
        {remaining !== null && <p className="text-muted-foreground">{remaining} suggestion{remaining === 1 ? '' : 's'} left today.</p>}
      </PopoverContent>
    </Popover>
  </div>;
}
