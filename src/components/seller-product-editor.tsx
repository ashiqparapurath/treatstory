'use client';

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Plus, Trash2, X, ChevronDown, ImagePlus, ArrowLeft, ArrowRight } from 'lucide-react';
import type { MarketplaceProduct } from '@/lib/marketplace-types';
import type { User } from 'firebase/auth';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { SellerDescriptionSuggestion } from './seller-description-suggestion';
import * as Dialog from '@radix-ui/react-dialog';
import { isPublicProductImageUrl } from '@/lib/seller-product-validation';
import { ProductSkuCopy } from '@/components/product-sku-copy';
import { parseProductImageUrls } from '@/lib/product-image-urls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type WeightUnit = 'g' | 'kg' | 'ml' | 'l' | 'pieces';
export type WeightOptionDraft = { value: string; unit: WeightUnit; price: string; stockQuantity: string };
export type ProductDraft = {
  name: string; description: string; category: string; price: string;
  imageUrls: string; availability: MarketplaceProduct['availability']; stockQuantity: string;
  preparationDays: string; minimumOrderQuantity: string; weightValue: string; weightUnit: WeightUnit;
  weightOptions: WeightOptionDraft[]; customizationOptions: string; careInstructions: string;
  ingredients: string; allergens: string; dietaryTags: string; shelfLifeDays: string; storageInstructions: string;
  advancePaymentRequired: boolean;
  showPrice: boolean; status: 'draft' | 'published';
};
export const emptyDraft: ProductDraft = {
  name: '', description: '', category: '', price: '', imageUrls: '', availability: 'available',
  stockQuantity: '', preparationDays: '', minimumOrderQuantity: '1', weightValue: '', weightUnit: 'g',
  weightOptions: [], customizationOptions: '', careInstructions: '',
  ingredients: '', allergens: '', dietaryTags: '', shelfLifeDays: '', storageInstructions: '',
  advancePaymentRequired: false,
  showPrice: true, status: 'published'
};
const presets = ['Home bakery', 'Cakes', 'Cookies', 'Desserts', 'Art', 'Paintings', 'Handmade crafts', 'Gifts', 'Candles', 'Accessories'];
const units: WeightUnit[] = ['g', 'kg', 'ml', 'l', 'pieces'];

const stepNames = ['Product basics', 'Product photos', 'Pricing and availability', 'Review and publish'];

export function SellerProductEditor({ user, open, editing, sku, busy, enabled, draft, setDraft, categories, storeName, onClose, onSubmit, onUploadPhotos, uploading, uploadProgress, saveError }: {
  user: Pick<User, 'getIdToken'> | null;
  sku?: string;
  saveError?: string;
  open: boolean;
  editing: boolean;
  busy: boolean;
  enabled: boolean;
  draft: ProductDraft;
  setDraft: Dispatch<SetStateAction<ProductDraft>>;
  categories: string[];
  storeName?: string;
  onClose: () => void;
  onSubmit: (status: ProductDraft['status']) => void;
  onUploadPhotos: (files: File[]) => Promise<void>;
  uploading: boolean;
  uploadProgress: string;
}) {
  const [newPhotoLink, setNewPhotoLink] = useState('');
  const [photoLinkError, setPhotoLinkError] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryActiveIndex, setCategoryActiveIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const initial = useRef(draft);
  const dirty = JSON.stringify(editing ? initial.current : emptyDraft) !== JSON.stringify(draft) || !!newPhotoLink;
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const blocked = busy || uploading;
  useEffect(() => {
    content.current?.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (!dirty && !blocked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, blocked]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const dialog = heading.current?.closest<HTMLElement>('[role="dialog"]');
    if (!viewport || !dialog) return;
    function resize() {
      dialog!.style.setProperty('--wizard-height', viewport!.height + 'px');
      dialog!.style.setProperty('--wizard-top', viewport!.offsetTop + 'px');
    }
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
    };
  }, []);
  useEffect(() => {
    if (!window.history.state?.sellerWizard) return;
    const openedAt = window.location.href;
    function handleBack() {
      if (window.location.href !== openedAt || window.history.state?.sellerWizard) return;
      if (!blocked && step === 0 && !dirty && !confirmDiscard) {
        onClose();
        return;
      }
      window.history.pushState({ sellerWizard: true }, '', openedAt);
      if (blocked) return;
      if (confirmDiscard) setConfirmDiscard(false);
      else if (step > 0) move(step - 1);
      else setConfirmDiscard(true);
    }
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [step, dirty, blocked, confirmDiscard, onClose]);
  function close() {
    if (blocked || confirmDiscard) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }
  function move(next: number) {
    setFieldError('');
    setStep(next);
  }
  function nextStep() {
    if (blocked) return;
    const panel = content.current?.querySelector<HTMLElement>('[data-step]:not([hidden])');
    for (const field of panel?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea') ?? []) {
      if (!field.validity.valid || (field.required && !field.value.trim())
          || (field.minLength > 0 && field.value.trim().length < field.minLength)) {
        field.closest('details')?.setAttribute('open', '');
        field.focus();
        field.reportValidity();
        setFieldError((field.labels?.[0]?.textContent?.split(' · ')[0] || 'Field') + ' — ' + (field.validationMessage || 'Enter a valid value.'));
        return;
      }
    }
    if (step === 0) {
      const groups = [
        { id: 'listing-customization', value: draft.customizationOptions, separator: '\n', max: 6, length: 80 },
        { id: 'listing-allergens', value: draft.allergens, separator: ',', max: 12, length: 40 },
        { id: 'listing-diet', value: draft.dietaryTags, separator: ',', max: 12, length: 40 },
      ];
      for (const group of groups) {
        const items = group.value.split(group.separator).map(value => value.trim()).filter(Boolean);
        if (items.length > group.max || items.some(item => item.length > group.length)) {
          const field = document.getElementById(group.id);
          field?.closest('details')?.setAttribute('open', '');
          field?.focus();
          setFieldError('Use up to ' + group.max + ' entries of ' + group.length + ' characters each.');
          return;
        }
      }
    }
    if (step === 1 && newPhotoLink.trim()) {
      setPhotoLinkError('Add this image link or clear it to continue.');
      document.getElementById('creatorImageLink')?.focus();
      return;
    }
    if (step === 2) {
      const seen = new Set<string>();
      for (const [index, size] of draft.weightOptions.entries()) {
        const key = Number(size.value) + ':' + size.unit;
        if (seen.has(key)) {
          setFieldError('Size ' + (index + 1) + ' duplicates another weight and unit. Choose a different size.');
          document.getElementById('size-value-' + index)?.focus();
          return;
        }
        seen.add(key);
      }
      if (draft.availability === 'available' && Number(draft.stockQuantity) === 0 && draft.weightOptions.some(size => !size.stockQuantity)) {
        setFieldError('Enter shared stock or a stock quantity for every size.');
        document.getElementById('seller-editor-stock')?.focus();
        return;
      }
    }
    move(step + 1);
  }
  if (!open) return null;
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const allCategories = [...new Set([...presets, ...categories])].filter(Boolean).sort((a,b) => a.localeCompare(b));
  const categorySuggestions = allCategories.filter(category => category.toLowerCase().includes(draft.category.trim().toLowerCase())).slice(0,8);
  const chooseCategory = (value: string) => { set('category',value);setCategoryOpen(false);setCategoryActiveIndex(0); };
  const photos = parseProductImageUrls(draft.imageUrls);
  const photoCount = photos.length;
  const arrangePhotos = (next: string[]) => set('imageUrls', next.join('\n'));
  const addPhotoLink = () => {
    const link = newPhotoLink.trim();
    if (!isPublicProductImageUrl(link) || link.length > 2048) {
      setPhotoLinkError('Enter a public HTTPS image URL, up to 2,048 characters.');
      return;
    }
    if (photos.length >= 10) { setPhotoLinkError('You can add a maximum of 10 product photos.'); return; }
    if (photos.includes(link)) { setPhotoLinkError('This image is already added.'); return; }
    arrangePhotos([...photos, link]);
    setNewPhotoLink('');
    setPhotoLinkError('');
  };
  const shiftPhoto = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    arrangePhotos(next);
  };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
        className="seller-wizard fixed inset-0 z-50 mx-auto flex h-dvh max-w-3xl flex-col overflow-hidden bg-[#fbf9f6] text-[#302b25] sm:inset-y-[4dvh] sm:h-[92dvh] sm:w-[calc(100%-3rem)] sm:rounded-3xl sm:shadow-2xl">
        <header className="shrink-0 bg-white px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-sm font-medium">{editing ? 'Edit product' : 'Add product'}</Dialog.Title>
            <button type="button" disabled={blocked} onClick={close} aria-label="Close product editor" className="grid size-11 place-items-center rounded-full hover:bg-[#f5f1eb]"><X size={18}/></button>
          </div>
          <p className="text-xs text-[#736554]">Step {step + 1} of 4</p>
          <h2 ref={heading} tabIndex={-1} className="mt-1 font-serif text-2xl leading-tight outline-none sm:text-3xl">{stepNames[step]}</h2>
          <div aria-hidden className="mt-3 flex gap-1">{stepNames.map((name,i) => <span key={name} className={'h-1 flex-1 rounded-full ' + (i <= step ? 'bg-[#836847]' : 'bg-[#eee9e2]')}/>)}</div>
        </header>
        <form id="sellerProductForm" noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={event => {
          event.preventDefault();
          if (step < 3) nextStep();
        }}>
          <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
            <section data-step hidden={step !== 0} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold sm:col-span-2">Product name<Input required minLength={2} maxLength={120} placeholder="e.g. Red velvet birthday cake" value={draft.name} onChange={e => set('name',e.target.value)} /></label>
              <div className="block space-y-1.5 text-xs font-semibold">
                <Label htmlFor="seller-category-name" className="text-xs font-semibold">Category</Label>
                <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCategoryOpen(false); }}>
                  <Input id="seller-category-name" required minLength={2} maxLength={80} value={draft.category}
                    role="combobox" aria-autocomplete="list" aria-expanded={categoryOpen && categorySuggestions.length>0}
                    aria-controls="seller-category-suggestions"
                    onFocus={() => { setCategoryOpen(true); setCategoryActiveIndex(0); }}
                    onChange={event => { set('category',event.target.value);setCategoryOpen(true);setCategoryActiveIndex(0); }}
                    onKeyDown={event => {
                      if (event.key === 'Escape') setCategoryOpen(false);
                      if (!categoryOpen || !categorySuggestions.length) return;
                      if (event.key === 'ArrowDown') { event.preventDefault();setCategoryActiveIndex(index=>Math.min(index+1,categorySuggestions.length-1)); }
                      if (event.key === 'ArrowUp') { event.preventDefault();setCategoryActiveIndex(index=>Math.max(index-1,0)); }
                      if (event.key === 'Enter') { event.preventDefault();chooseCategory(categorySuggestions[categoryActiveIndex] ?? categorySuggestions[0]); }
                    }}
                    placeholder="Choose or type a new category" />
                  {categoryOpen && categorySuggestions.length > 0 && <div id="seller-category-suggestions" role="listbox" aria-label="Suggested categories"
                    className="absolute inset-x-0 top-full z-[60] mt-1 max-h-56 overflow-y-auto rounded-[14px] border border-[#e4dbd0] bg-[#fffdfa] p-1 shadow-[0_10px_28px_rgba(51,39,24,0.10)]">
                    {categorySuggestions.map((category,index) => <button key={category} type="button" role="option"
                      aria-selected={category === draft.category || index === categoryActiveIndex}
                      onClick={() => chooseCategory(category)}
                      className={`block min-h-10 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${index===categoryActiveIndex ? 'bg-[#f2ebe2] text-[#352c23]' : 'text-[#594c3f] hover:bg-[#f2ebe2]'}`}>
                      {category}
                    </button>)}
                  </div>}
                </div>
                <span className="block text-[11px] font-normal text-muted-foreground">New categories are saved with this listing and appear next time.</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="creatorDescription">Description</Label>
              <Textarea id="creatorDescription" required maxLength={2000} rows={3} placeholder="Tell buyers about the product, materials, portions and special touches…" value={draft.description} onChange={e => set('description',e.target.value)} className="resize-y" />
              {enabled && user && <SellerDescriptionSuggestion user={user} draft={draft} onUse={value => set('description', value)} />}
            </div>
          <details className="group rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">Advanced listing details <ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium sm:col-span-2">Customization prompts (one per line)<Textarea id="listing-customization" rows={3} maxLength={500} placeholder={"Cake message\nColour preference\nGift note"} value={draft.customizationOptions} onChange={e=>set('customizationOptions',e.target.value)} /><span className="block text-[11px] text-muted-foreground">Up to six prompts (80 characters each). Requests do not change pricing.</span></label>
              <label className="space-y-1 text-xs font-medium sm:col-span-2">Ingredients, care or handling notes<Textarea rows={2} maxLength={500} value={draft.careInstructions} onChange={e=>set('careInstructions',e.target.value)} /></label>
              <div className="space-y-3 rounded-xl border border-[#eee7dd] p-4 sm:col-span-2"><h4 className="text-sm font-semibold">Food safety & ingredient details (for bakers)</h4><p className="text-xs text-muted-foreground">Enter accurate information for customers with food sensitivities. These claims are supplied by the seller and aren't independently certified by TreatStory.</p><label className="block space-y-1 text-xs font-medium">Ingredients <Textarea rows={2} maxLength={1000} value={draft.ingredients} onChange={e=>set('ingredients',e.target.value)} placeholder="Flour, milk, eggs, cocoa…"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs font-medium">Allergens (comma separated)<Input id="listing-allergens" maxLength={300} value={draft.allergens} onChange={e=>set('allergens',e.target.value)} placeholder="Milk, eggs, wheat"/></label><label className="block space-y-1 text-xs font-medium">Dietary claims (comma separated)<Input id="listing-diet" maxLength={300} value={draft.dietaryTags} onChange={e=>set('dietaryTags',e.target.value)} placeholder="Vegetarian, eggless"/></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs font-medium">Shelf life (days)<Input type="number" inputMode="numeric" min={0} max={365} value={draft.shelfLifeDays} onChange={e=>set('shelfLifeDays',e.target.value)} placeholder="e.g. 2"/></label><label className="block space-y-1 text-xs font-medium">Storage instructions<Input maxLength={500} value={draft.storageInstructions} onChange={e=>set('storageInstructions',e.target.value)} placeholder="Refrigerate; consume within 2 days"/></label></div></div>
            </div>
          </details>
            </section>
            <section data-step hidden={step !== 1} className="space-y-4">
              <p className="text-xs leading-5 text-muted-foreground">Add up to 10 photos. Choose JPG, PNG or WebP files up to 2 MB each.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="sellerPhotoFiles" className={`flex min-h-28 w-full justify-center cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-[#bfae95] bg-[#f8f5f0] px-5 text-xs font-semibold text-[#594b39] ${uploading || busy || !enabled || photoCount >= 10 ? 'pointer-events-none opacity-50' : ''}`}><ImagePlus className="h-4 w-4" />{uploading ? 'Uploading photos…' : 'Upload product photos'}</label>
                <input id="sellerPhotoFiles" className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || busy || !enabled || photoCount >= 10} onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void onUploadPhotos(files); }} />
                <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{uploadProgress || `${photoCount} / 10 photos`}</span>
              </div>
              {photos.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{photos.map((url,i) =>
                <li key={url} className={'min-w-0 overflow-hidden rounded-xl bg-white ' + (i ? 'flex items-center gap-2 px-2 sm:block sm:px-0' : 'sm:col-span-2')}>
                  <img src={url} alt={i === 0 ? 'Cover photo' : 'Product photo ' + (i + 1)} className={i ? 'size-16 shrink-0 rounded-lg object-cover sm:aspect-[2/1] sm:h-auto sm:w-full' : 'max-h-56 w-full aspect-[2/1] object-cover'}/>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-1 px-2">
                    {i === 0 ? <span className="text-xs font-semibold">Cover photo</span> :
                      <button type="button" disabled={uploading} className="min-h-11 text-xs underline" onClick={() => arrangePhotos([url, ...photos.filter(photo => photo !== url)])}>Set as cover</button>}
                    <div className="flex">
                      <button type="button" className="grid size-11 place-items-center" disabled={i===0||uploading} aria-label={`Move photo ${i+1} left`} onClick={() => shiftPhoto(i,-1)}><ArrowLeft size={16}/></button>
                      <button type="button" className="grid size-11 place-items-center" disabled={i===photoCount-1||uploading} aria-label={`Move photo ${i+1} right`} onClick={() => shiftPhoto(i,1)}><ArrowRight size={16}/></button>
                      <button type="button" className="grid size-11 place-items-center text-red-700" disabled={uploading} aria-label={`Remove photo ${i+1}`} onClick={() => arrangePhotos(photos.filter((_,n) => n !== i))}><Trash2 size={16}/></button>
                    </div>
                  </div>
                </li>)}</ul>}
              <div className="rounded-xl border border-[#e8e0d5] bg-[#faf8f5] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[#352c23]">Add image by link</p><p className="mt-1 text-[11px] text-[#87786a]">Add one HTTPS image link at a time. Repeat for more photos.</p></div><span className="text-[11px] tabular-nums text-[#87786a]">{photoCount} / 10</span></div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input id="creatorImageLink" type="url" inputMode="url" autoComplete="url" aria-label="Image URL" aria-invalid={!!photoLinkError} aria-describedby={photoLinkError ? 'creatorImageLinkError' : undefined} placeholder="https://example.com/my-product.jpg" value={newPhotoLink} disabled={uploading || busy || !enabled || photoCount >= 10} onChange={e => { setNewPhotoLink(e.target.value); if (photoLinkError) setPhotoLinkError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhotoLink(); } }} className="h-11 min-w-0 flex-1 rounded-xl bg-white" />
                  <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl border-[#cbb89e] bg-white" onClick={addPhotoLink} disabled={uploading || busy || !enabled || photoCount >= 10 || !newPhotoLink.trim()}><Plus className="mr-2 h-4 w-4" />Add link</Button>
                </div>
                {photoLinkError && <p id="creatorImageLinkError" role="alert" className="mt-2 text-xs text-red-700">{photoLinkError}</p>}
              </div>
            </section>
            <section data-step hidden={step !== 2} className="space-y-4">
              {!draft.weightOptions.length && <label className="block space-y-1 text-sm">Price (₹)<Input required={!draft.weightOptions.length} type="number" inputMode="decimal" min={0} max={10000000} step="0.01" value={draft.price} onChange={e=>set('price',e.target.value)}/></label>}
          <details className="group rounded-2xl border border-[#e4d6c5] bg-white p-4 sm:p-5" open={draft.weightOptions.length > 0 ? true : undefined} aria-labelledby="variant-pricing-title">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span id="variant-pricing-title">Weight, size & variant pricing</span><span className="flex items-center gap-2 text-xs font-normal text-[#8b795e]">{draft.weightOptions.length} sizes <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180"/></span></summary><div className="mt-4 space-y-4">
            <p className="text-xs leading-5 text-[#6d6050]">Example: add <strong>500 g at ₹450</strong> and <strong>1 kg at ₹800</strong> under the same cake product. Enter a price for each size. Each size can also have its own stock; leaving stock blank uses the product's shared stock.</p>
            <div className="space-y-3">
              {draft.weightOptions.map((option,i) => <div key={i} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-[#e3d1ba] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_80px_100px_95px_44px]">
                <p className="col-span-2 text-[11px] font-semibold text-[#82623e] sm:hidden">Size {i+1} · set its selling price</p>
                <label className="space-y-1 text-xs font-medium">Weight / count<Input id={'size-value-' + i} required type="number" inputMode="decimal" min="0.01" max="100000" step="any" value={option.value} placeholder="500" onChange={e => set('weightOptions', draft.weightOptions.map((v,n)=>n===i?{...v,value:e.target.value}:v))}/></label>
                <div className="space-y-1 text-xs font-medium"><Label htmlFor={`seller-unit-${i}`} className="text-xs">Unit</Label>
                  <Select value={option.unit} onValueChange={value=>set('weightOptions',draft.weightOptions.map((v,n)=>n===i?{...v,unit:value as WeightUnit}:v))}>
                    <SelectTrigger id={`seller-unit-${i}`} className="min-h-10 px-3"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={6}>{units.map(unit=><SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label className="space-y-1 text-xs font-semibold text-[#685139]">Price for this size (₹) *<Input required type="number" inputMode="decimal" min={0} max={10000000} step="0.01" value={option.price} placeholder="e.g. 450" onChange={e => set('weightOptions', draft.weightOptions.map((v,n)=>n===i?{...v,price:e.target.value}:v))}/></label>
                <label className="space-y-1 text-xs font-medium">Size stock<Input type="number" inputMode="numeric" min={0} max={1000000} step={1} value={option.stockQuantity} placeholder="Total stock" onChange={e => set('weightOptions', draft.weightOptions.map((v,n)=>n===i?{...v,stockQuantity:e.target.value}:v))}/></label>
                <button type="button" aria-label={`Remove weight option ${i+1}`} className="flex h-10 w-9 items-center justify-center rounded-md border text-red-700" onClick={()=>set('weightOptions',draft.weightOptions.filter((_,n)=>n!==i))}><Trash2 className="h-4 w-4"/></button>
              </div>)}
              <Button type="button" variant="outline" className="h-10 rounded-full" disabled={draft.weightOptions.length>=8} onClick={()=>set('weightOptions',[...draft.weightOptions,{value:'',unit:'g',price:'',stockQuantity:''}])}><Plus className="mr-2 h-4 w-4"/>Add another size & price</Button>
              {!!draft.weightOptions.length && <div role="status" className="rounded-xl bg-[#f5ede2] p-3 text-xs leading-6 text-[#5e503f]"><strong>Price preview:</strong> {draft.weightOptions.map((option,i) => `${option.value || 'Size '+(i+1)} ${option.unit}: ₹${option.price.trim() === '' ? 'set price' : option.price}`).join(' · ')}. Each size is saved under this single product.</div>}
              <label className="block max-w-xs space-y-1 text-xs font-medium">Minimum order quantity (units)<Input required type="number" inputMode="numeric" min={1} max={99} value={draft.minimumOrderQuantity} onChange={e=>set('minimumOrderQuantity',e.target.value)}/></label>
            </div>
          </div></details>
              <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2"><input type="checkbox" checked={draft.showPrice} onChange={e=>set('showPrice',e.target.checked)} />Show price publicly</label>
              <div className="grid items-start gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium"><Label htmlFor="seller-editor-availability" className="text-xs leading-5">Availability</Label>
                  <Select value={draft.availability} onValueChange={value=>set('availability',value as ProductDraft['availability'])}>
                    <SelectTrigger id="seller-editor-availability" className="min-h-11"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={6}><SelectItem value="available">Available</SelectItem><SelectItem value="made-to-order">Made to order</SelectItem><SelectItem value="unavailable">Unavailable</SelectItem></SelectContent>
                  </Select>
                </div>

              <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor="seller-editor-preparation" className="text-xs leading-5">Preparation days</Label><Input id="seller-editor-preparation" className="min-h-11" type="number" inputMode="numeric" min={0} max={365} value={draft.preparationDays} onChange={e=>set('preparationDays',e.target.value)} /></div>
              <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor="seller-editor-stock" className="text-xs leading-5">Stock quantity</Label><Input id="seller-editor-stock" className="min-h-11" type="number" inputMode="numeric" min={0} max={1000000} value={draft.stockQuantity} onChange={e=>set('stockQuantity',e.target.value)} /></div>
              </div>
          <details className="group rounded-2xl border border-[#e8e0d5] bg-white p-4 sm:p-5"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">Payment requirements <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180"/></summary><div className="mt-3">
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.advancePaymentRequired} onChange={e => set('advancePaymentRequired', e.target.checked)} />Advance payment required before preparation</label><p className="text-xs text-muted-foreground sm:col-span-2">Arrange the advance directly with the buyer. TreatStory does not collect online payments.</p></div>
          </details>
            </section>
            <section data-step hidden={step !== 3} className="space-y-4 break-words">
              {photos[0] && <img src={photos[0]} alt="Listing cover" className="aspect-[2/1] max-h-64 w-full rounded-2xl object-contain bg-[#eee9e2]"/>}
              <div><p className="text-xs text-muted-foreground">{[storeName,draft.category].filter(Boolean).join(' · ')}</p>
                <h3 className="mt-1 text-xl font-semibold">{draft.name}</h3>
                <p className="mt-2 whitespace-pre-line text-sm">{draft.description}</p></div>
              <div className="rounded-xl bg-white p-4 text-sm">
                {draft.weightOptions.length ? <ul>{draft.weightOptions.map((w,i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1">
                  <span>{w.value} {w.unit}</span><span>₹{w.price} · {w.stockQuantity || draft.stockQuantity || '0'} in stock</span></li>)}</ul> : <p>₹{draft.price}</p>}
                <p className="mt-2 capitalize">{draft.availability.replaceAll('-', ' ')}{(!draft.weightOptions.length || draft.weightOptions.some(size => !size.stockQuantity)) && ` · ${draft.stockQuantity || '0'} in stock`}</p>
                {editing && <p className="mt-2">Current listing status: {draft.status}</p>}
                {sku && <ProductSkuCopy sku={sku}/>}
              </div>
            </section>
            {fieldError && <p role="alert" className="mt-3 text-sm text-red-800">{fieldError}</p>}
            {saveError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
          </div>
          <footer className="flex shrink-0 items-center gap-2 border-t border-[#e8e0d5] bg-white px-4 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-7">
            {step > 0 && <Button type="button" variant="ghost" aria-label="Back" className={step === 3 ? 'size-11 shrink-0 p-0' : ''} disabled={blocked} onClick={() => move(step-1)}>{step === 3 ? <ArrowLeft size={18}/> : 'Back'}</Button>}
            {step < 3 ? <Button type="submit" disabled={blocked} className="ml-auto rounded-full px-6">Continue</Button> :
              <div className="ml-auto grid min-w-0 grid-cols-2 gap-2 [&_button]:px-2 sm:[&_button]:px-4">
                <Button type="button" variant="outline" disabled={blocked || !enabled} onClick={() => onSubmit('draft')}>Save as Draft</Button>
                <Button type="button" disabled={blocked || !enabled} onClick={() => onSubmit('published')}>{busy ? 'Saving…' : editing && draft.status === 'published' ? 'Save changes' : 'Publish Product'}</Button>
              </div>}
          </footer>
        </form>
        <ConfirmActionDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}
          title="Discard your changes?" description="Your unsaved listing changes will be lost."
          cancelLabel="Keep editing" confirmLabel="Discard changes" destructive onConfirm={onClose}/>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
