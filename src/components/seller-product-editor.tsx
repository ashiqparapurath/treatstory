'use client';

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Plus, Trash2, X, Sparkles, ChevronDown } from 'lucide-react';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type WeightUnit = 'g' | 'kg' | 'ml' | 'l' | 'pieces';
export type WeightOptionDraft = { value: string; unit: WeightUnit };
export type ProductDraft = {
  name: string; description: string; category: string; price: string;
  imageUrls: string; availability: MarketplaceProduct['availability']; stockQuantity: string;
  preparationDays: string; minimumOrderQuantity: string; weightValue: string; weightUnit: WeightUnit;
  weightOptions: WeightOptionDraft[]; customizationOptions: string; careInstructions: string;
  showPrice: boolean; status: 'draft' | 'published';
};
export const emptyDraft: ProductDraft = {
  name: '', description: '', category: '', price: '', imageUrls: '', availability: 'available',
  stockQuantity: '', preparationDays: '', minimumOrderQuantity: '1', weightValue: '', weightUnit: 'g',
  weightOptions: [], customizationOptions: '', careInstructions: '', showPrice: true, status: 'draft'
};
const presets = ['Home bakery', 'Cakes', 'Cookies', 'Desserts', 'Art', 'Paintings', 'Handmade crafts', 'Gifts', 'Candles', 'Accessories'];
const units: WeightUnit[] = ['g', 'kg', 'ml', 'l', 'pieces'];

export function suggestProductDescription(d: Pick<ProductDraft, 'name' | 'category' | 'availability' | 'preparationDays' | 'careInstructions'>) {
  const name = d.name.trim(), category = d.category.trim();
  if (name.length < 2) return '';
  const lead = `${name} is a thoughtfully made ${category ? category.toLowerCase() + ' creation' : 'creation'}, prepared with care by an independent TreatStory seller.`;
  const made = d.availability === 'made-to-order' ? ' Made to order for your special moments.' : '';
  const prep = Number(d.preparationDays) > 0 ? ` Please allow around ${Number(d.preparationDays)} day(s) for preparation.` : '';
  const care = d.careInstructions.trim() ? ` Care notes: ${d.careInstructions.trim().slice(0, 180)}.` : '';
  return `${lead}${made}${prep}${care} Contact the creator for specific requests before ordering.`;
}

export function SellerProductEditor({ open, editing, busy, enabled, draft, setDraft, categories, onClose, onSubmit }: {
  open: boolean;
  editing: boolean;
  busy: boolean;
  enabled: boolean;
  draft: ProductDraft;
  setDraft: Dispatch<SetStateAction<ProductDraft>>;
  categories: string[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [suggestion, setSuggestion] = useState('');
  if (!open) return null;
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const allCategories = [...new Set([...presets, ...categories])].filter(Boolean).sort((a,b) => a.localeCompare(b));
  const photoCount = draft.imageUrls.split(/\r?\n|,/).filter(x=>x.trim()).length;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="presentation" onMouseDown={e => { if(e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={editing ? 'Edit listing' : 'New listing'} className="flex h-[min(96dvh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-[#fbf9f6] shadow-2xl sm:h-[min(94dvh,940px)] sm:rounded-3xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8e0d5] bg-white px-4 py-3 sm:px-7 sm:py-5">
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#a68a64]">Seller studio · Catalog</p><h2 className="mt-0.5 text-xl font-semibold sm:text-2xl">{editing ? 'Edit your creation' : 'Add a creation'}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close product editor" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f5f1eb]"><X className="h-5 w-5" /></button>
      </div>
      <form id="sellerProductForm" onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-7 sm:py-6">
          <section className="space-y-3 rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-6">
            <h3 className="text-sm font-semibold">Essential details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold sm:col-span-2">Product name<Input required minLength={2} maxLength={120} placeholder="e.g. Red velvet birthday cake" value={draft.name} onChange={e => set('name',e.target.value)} /></label>
              <label className="block space-y-1.5 text-xs font-semibold">Category
                <Input list="sellerProductCategories" required maxLength={80} value={draft.category} onChange={e => set('category',e.target.value)} placeholder="Choose or type a new category" />
                <datalist id="sellerProductCategories">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
                <span className="block text-[11px] font-normal text-muted-foreground">New categories are saved with this listing and appear next time.</span>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold">Price (₹)<Input required min={0} max={10000000} type="number" inputMode="decimal" value={draft.price} onChange={e => set('price',e.target.value)} /></label>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="creatorDescription">Description</Label><Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-[11px]" disabled={draft.name.trim().length < 2} onClick={() => setSuggestion(suggestProductDescription(draft))}><Sparkles className="mr-1 h-3.5 w-3.5" />Suggest description</Button></div>
              <Textarea id="creatorDescription" required maxLength={2000} rows={3} placeholder="Tell buyers about the product, materials, portions and special touches…" value={draft.description} onChange={e => set('description',e.target.value)} className="resize-y" />
              {suggestion && <div className="rounded-xl bg-[#f3eee6] p-3"><p className="text-xs leading-5 text-[#5e5040]">{suggestion}</p><div className="mt-2 flex gap-2"><Button type="button" size="sm" onClick={() => { set('description',suggestion); setSuggestion(''); }}>Use suggestion</Button><Button type="button" size="sm" variant="outline" onClick={() => setSuggestion('')}>Dismiss</Button></div><p className="mt-2 text-[10px] text-muted-foreground">Template suggestion based only on the details you've entered; review its accuracy before publishing.</p></div>}
            </div>
          </section>
          <details className="group rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">Photos & gallery <span className="flex items-center gap-2 text-xs font-normal text-[#8b795e]">{photoCount} photo(s)<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></span></summary>
            <div className="mt-4 space-y-2"><Label htmlFor="creatorImages">Image URLs (one HTTPS link per line)</Label><Textarea id="creatorImages" rows={4} maxLength={5000} placeholder={"https://example.com/cake-front.jpg\nhttps://example.com/cake-detail.jpg"} value={draft.imageUrls} onChange={e => set('imageUrls',e.target.value)} /><p className="text-xs text-muted-foreground">Add up to ten photos. The first is the cover. Buyers can swipe through the gallery.</p></div>
          </details>
          <details className="group rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">Weights, sizes & quantity <span className="flex items-center gap-2 text-xs font-normal text-[#8b795e]">{draft.weightOptions.length} choices<ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></span></summary>
            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">Offer up to eight weight or size choices. All choices currently use the listing price; the buyer can select a preferred weight. Different prices per weight are not enabled.</p>
              {draft.weightOptions.map((option,i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-end gap-2">
                <label className="space-y-1 text-xs font-medium">Weight / count<Input type="number" inputMode="decimal" min="0.01" max="100000" step="any" value={option.value} placeholder="500" onChange={e => set('weightOptions', draft.weightOptions.map((v,n)=>n===i?{...v,value:e.target.value}:v))}/></label>
                <label className="space-y-1 text-xs font-medium">Unit<select className="h-10 w-full rounded-md border bg-white px-2" value={option.unit} onChange={e=>set('weightOptions',draft.weightOptions.map((v,n)=>n===i?{...v,unit:e.target.value as WeightUnit}:v))}>{units.map(u=><option key={u} value={u}>{u}</option>)}</select></label>
                <button type="button" aria-label={`Remove weight option ${i+1}`} className="flex h-10 w-9 items-center justify-center rounded-md border text-red-700" onClick={()=>set('weightOptions',draft.weightOptions.filter((_,n)=>n!==i))}><Trash2 className="h-4 w-4"/></button>
              </div>)}
              <Button type="button" variant="outline" className="h-10 rounded-full" disabled={draft.weightOptions.length>=8} onClick={()=>set('weightOptions',[...draft.weightOptions,{value:'',unit:'g'}])}><Plus className="mr-2 h-4 w-4"/>Add weight option</Button>
              <label className="block max-w-xs space-y-1 text-xs font-medium">Minimum order quantity (units)<Input type="number" min={1} max={99} value={draft.minimumOrderQuantity} onChange={e=>set('minimumOrderQuantity',e.target.value)}/></label>
            </div>
          </details>
          <details className="group rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">Availability & personalization <ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">Availability<select className="h-10 w-full rounded-md border bg-white px-3" value={draft.availability} onChange={e=>set('availability',e.target.value as ProductDraft['availability'])}><option value="available">Available</option><option value="made-to-order">Made to order</option><option value="unavailable">Unavailable</option></select></label>
              <label className="space-y-1 text-xs font-medium">Preparation days<Input type="number" min={0} max={365} value={draft.preparationDays} onChange={e=>set('preparationDays',e.target.value)} /></label>
              <label className="space-y-1 text-xs font-medium">Stock quantity<Input type="number" min={0} max={1000000} value={draft.stockQuantity} onChange={e=>set('stockQuantity',e.target.value)} /></label>
              <label className="space-y-1 text-xs font-medium">Listing status<select className="h-10 w-full rounded-md border bg-white px-3" value={draft.status} onChange={e=>set('status',e.target.value as ProductDraft['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></label>
              <label className="space-y-1 text-xs font-medium sm:col-span-2">Customization prompts (one per line)<Textarea rows={3} maxLength={500} placeholder={"Cake message\nColour preference\nGift note"} value={draft.customizationOptions} onChange={e=>set('customizationOptions',e.target.value)} /><span className="block text-[11px] text-muted-foreground">Up to six prompts (80 characters each). Requests do not change pricing.</span></label>
              <label className="space-y-1 text-xs font-medium sm:col-span-2">Ingredients, care or handling notes<Textarea rows={2} maxLength={500} value={draft.careInstructions} onChange={e=>set('careInstructions',e.target.value)} /></label>
              <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2"><input type="checkbox" checked={draft.showPrice} onChange={e=>set('showPrice',e.target.checked)} />Show price publicly</label>
            </div>
          </details>
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-[#e8e0d5] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:px-7 sm:py-4">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 flex-1 rounded-full sm:flex-none">Cancel</Button>
          <Button type="submit" disabled={busy||!enabled} className="h-11 flex-[2] rounded-full bg-[#29251f] text-white sm:flex-none sm:px-8">{busy ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</Button>
        </div>
      </form>
    </div>
  </div>;
}
