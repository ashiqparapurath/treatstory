'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { ProductDraft } from './seller-product-editor';
import { styles, languages, suggestionRequest, type DescriptionRequest } from '@/lib/product-description';

const endpoint = '/api/seller/description';
type Session = Pick<User, 'getIdToken'>;

export function SellerDescriptionSuggestion({ draft, user, onUse }: {
  draft: ProductDraft; user: Session; onUse: (description: string) => void;
}) {
  const [style, setStyle] = useState<DescriptionRequest['style']>('Professional');
  const [language, setLanguage] = useState<DescriptionRequest['language']>('English');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const lookup = useRef<AbortController | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const controller = new AbortController();
      lookup.current = controller;
      try {
        const token = await user.getIdToken();
        const response = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!controller.signal.aborted && response.ok && Number.isInteger(result.remaining)) setRemaining(result.remaining);
      } catch { /* Generating will also return the current quota. */ }
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
    if (pending.current) return;
    const options = draft.weightOptions.length ? draft.weightOptions : [{ value: draft.weightValue, unit: draft.weightUnit }];
    const input = suggestionRequest.safeParse({
      name: draft.name, category: draft.category, details: draft.description, ingredients: draft.ingredients,
      features: [draft.customizationOptions, draft.careInstructions].filter(Boolean).join('\n'),
      sizes: options.filter(o => o.value.trim()).map(o => ({ value: Number(o.value), unit: o.unit })),
      style, language,
    });
    if (!input.success) {
      setMessage('Enter a product name and category. Use public product facts and valid sizes, and remove contact details or links.');
      return;
    }

    lookup.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data), signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      const count = response.ok ? result.remaining : result.details?.remaining;
      if (Number.isInteger(count)) setRemaining(count);
      if (response.ok && typeof result.description === 'string') setPreview(result.description);
      else setMessage(result.error || 'Suggestions are unavailable. You can continue editing.');
    } catch {
      if (!controller.signal.aborted) setMessage('Could not reach suggestions. You can still save your product.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }

  return <section aria-label="AI description suggestion" className="min-w-0 space-y-3 rounded-xl bg-[#f7f3ed] p-3">
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs"><span className="font-semibold">Writing preferences</span><span>{style} · {language}</span></summary>
      <div className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2">
      {([{ label: 'Style', value: style, options: styles, change: (v: string) => setStyle(v as typeof style) },
         { label: 'Language', value: language, options: languages, change: (v: string) => setLanguage(v as typeof language) }]).map(field =>
        <div key={field.label} className="min-w-0 space-y-1">
          <Label htmlFor={'ai-' + field.label}>{field.label}</Label>
          <Select value={field.value} onValueChange={field.change} disabled={busy}>
            <SelectTrigger className="min-h-11" id={'ai-' + field.label}><SelectValue /></SelectTrigger>
            <SelectContent position="popper" sideOffset={6}>{field.options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>)}
    </div>
    </details>
    <p className="text-xs leading-5 text-muted-foreground">Google AI receives your product details. Free-tier inputs and suggestions may be reviewed by people and used to improve Google products. Use public listing details only. <a className="underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s terms</a></p>
    {preview !== null && <div className="space-y-1">
      <Label htmlFor="ai-preview">Review and edit your suggestion</Label>
      <Textarea id="ai-preview" rows={5} maxLength={2000} value={preview} onChange={e => setPreview(e.target.value)} className="text-base"/>
    </div>}
    <div className="flex flex-wrap gap-2">
      {preview !== null && <Button type="button" className="min-h-11" disabled={busy || !preview.trim()} onClick={() => { onUse(preview.trim()); setPreview(null); setMessage(''); }}>Use Description</Button>}
      <Button type="button" variant="outline" className="min-h-11 rounded-full" disabled={busy || remaining === 0} onClick={generate}>
        {busy ? <LoaderCircle aria-hidden className="mr-2 h-4 w-4 motion-safe:animate-spin"/> : <Sparkles aria-hidden className="mr-2 h-4 w-4"/>}
        {busy ? 'Writing…' : preview !== null ? 'Regenerate' : 'Suggest with AI'}
      </Button>
      {preview !== null && <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setPreview(null); setMessage(''); }}>Cancel</Button>}
    </div>
    <p role="status" className="text-xs text-muted-foreground">{busy ? 'Generating your suggestion…' : preview !== null ? 'Suggestion ready to review. ' : ''}{remaining === 0 ? 'Daily limit reached. Resets at midnight UTC.' : remaining !== null && `${remaining} generation${remaining === 1 ? '' : 's'} left today.`}</p>
    {message && <p role="alert" className="text-xs text-red-800">{message}</p>}
  </section>;
}
