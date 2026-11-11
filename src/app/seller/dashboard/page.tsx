'use client';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { errorToast, getErrorNotice, ActionError } from '@/lib/user-notices';
import { ConfirmActionDialog } from '@/components/confirm-action-dialog';
import { Suspense } from 'react';
import { DashboardShellSkeleton, SectionSkeleton } from '@/components/loading-states';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, addDoc, deleteDoc, updateDoc, query, where, serverTimestamp, getCountFromServer, Timestamp, deleteField } from 'firebase/firestore';
import { useFirestore, useUser, useAccountRole, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { Header } from '@/components/header';
import { OrderManagement } from '@/components/order-management';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { MarketplaceProduct, SellerApplication } from '@/lib/marketplace-types';
import { LayoutDashboard, Package, Settings, ShoppingBag, Plus, ArrowUpRight, Clock3, Store, Trash2, Pencil, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { SellerProductEditor, emptyDraft, type ProductDraft } from '@/components/seller-product-editor';
import { ProductSkuCopy } from '@/components/product-sku-copy';
import { SellerStoreSettings } from '@/components/seller-store-settings';
import { uploadTreatStoryPhoto } from '@/lib/cloudinary-upload';

type Section = 'overview' | 'products' | 'orders' | 'store';
const dateText = (value: unknown) => { const d = (value as { toDate?: () => Date } | null)?.toDate?.(); return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'; };
const priceRange = (product: MarketplaceProduct) => {
  const prices = product.weightOptions?.length
    ? product.weightOptions.map(option => option.price ?? product.price)
    : [product.price];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const rupees = (amount: number) => '₹' + amount.toLocaleString('en-IN');
  return high > low ? rupees(low) + ' – ' + rupees(high) : rupees(low);
};
const sizePriceLabels = (product: MarketplaceProduct) =>
  (product.weightOptions ?? []).map(option => `${option.value} ${option.unit}: ₹${(option.price ?? product.price).toLocaleString('en-IN')}`).join(' · ');


function SellerContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { seller, role, roleError, isRoleLoading } = useAccountRole();
  const appRef = useMemoFirebase(() => db && user && role !== 'seller' ? doc(db, 'seller_applications', user.uid) : null, [db, user?.uid, role]);
  const { data: application, isLoading: applicationLoading } = useDoc<SellerApplication>(appRef);
  const [counts, setCounts] = useState<{ total: number; published: number } | null>(null);
  const [countError, setCountError] = useState(false);
  const [fulfillment, setFulfillment] = useState<{ today: number | null; pending: number | null; preparing: number | null; ready: number | null; outForDelivery: number | null; lowStock: number | null } | null>(null);
  const [countVersion, setCountVersion] = useState(0);
  const params = useSearchParams();
  useEffect(() => { const start = performance.now(); const frame = requestAnimationFrame(() => performance.measure('TreatStory seller render', { start, end: performance.now() })); return () => cancelAnimationFrame(frame); }, [params]);
  const requestedSection = params.get('section');
  const section: Section = ['overview', 'products', 'orders', 'store'].includes(requestedSection || '') ? requestedSection as Section : 'overview';
  const setSection = (next: Section) => router.push(`/seller/dashboard?section=${next}`, { scroll: false });
  const [editing, setEditing] = useState<MarketplaceProduct | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [pendingDelete,setPendingDelete] = useState<MarketplaceProduct|null>(null);
  const [deleteError,setDeleteError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [isUserLoading, user, router]);
  // Overview uses aggregation queries; the full catalog is only downloaded when editing products.
  useEffect(() => {
    if (!db || !user || !seller || section !== 'overview') return;
    let live = true;
    setCounts(null); setCountError(false);
    const source = collection(db, 'marketplace_products');
    Promise.all([
      getCountFromServer(query(source, where('sellerId', '==', user.uid))),
      getCountFromServer(query(source, where('sellerId', '==', user.uid), where('status', '==', 'published'))),
    ]).then(([total, published]) => {
      if (live) setCounts({ total: total.data().count, published: published.data().count });
    }).catch(() => { if (live) setCountError(true); });
    return () => { live = false; };
  }, [db, user?.uid, seller?.id, section, countVersion]);

  // Lightweight action queue: Firestore calculates counts without returning order documents.
  useEffect(() => {
    if (!db || !user || !seller || section !== 'overview') return;
    let live = true;
    setFulfillment(null);
    const orders = collection(db, 'seller_orders');
    const products = collection(db, 'marketplace_products');
    const scopedOrders = (status: string) => query(orders, where('sellerId', '==', user.uid), where('status', '==', status));
    const localMidnight = new Date(); localMidnight.setHours(0, 0, 0, 0);
    Promise.allSettled([
      getCountFromServer(query(orders, where('sellerId', '==', user.uid), where('createdAt', '>=', Timestamp.fromDate(localMidnight)))),
      getCountFromServer(scopedOrders('pending')),
      getCountFromServer(scopedOrders('preparing')),
      getCountFromServer(scopedOrders('ready')),
      getCountFromServer(scopedOrders('out-for-delivery')),
      getCountFromServer(query(products, where('sellerId', '==', user.uid), where('availability', '==', 'available'), where('stockQuantity', '>=', 1), where('stockQuantity', '<=', 3))),
    ]).then(results => {
      if (!live) return;
      const count = (n: number) => { const result = results[n]; return result.status === 'fulfilled' ? result.value.data().count : null; };
      setFulfillment({ today: count(0), pending: count(1), preparing: count(2), ready: count(3), outForDelivery: count(4), lowStock: count(5) });
    });
    return () => { live = false; };
  }, [db, user?.uid, seller?.id, section, countVersion]);

  const productsQuery = useMemoFirebase(() => db && user && seller && section === 'products' ? query(collection(db, 'marketplace_products'), where('sellerId', '==', user.uid)) : null, [db, user?.uid, seller?.id, section]);
  const { data: products, isLoading: productsLoading, hasMore, loadingMore, loadMore } = usePagedCollection<MarketplaceProduct & { status?: string }>(productsQuery);
  const active = !!seller && seller.status === 'active' && ((seller.accessEndsAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0) > Date.now();
  const visible = useMemo(() => (products ?? []).filter(p => (p.name + ' ' + p.category + ' ' + (p.sku || '')).toLowerCase().includes(search.toLowerCase())), [products, search]);

  function openForm(product?: MarketplaceProduct & { status?: string }) {
    setEditing(product ?? null);
    setUploadProgress('');
    setDraft(product ? {
      name: product.name, description: product.description, price: String(product.price), category: product.category,
      imageUrls: product.imageUrls.join('\n'), availability: product.availability,
      stockQuantity: product.stockQuantity == null ? '' : String(product.stockQuantity),
      preparationDays: product.preparationDays == null ? '' : String(product.preparationDays),
      minimumOrderQuantity: String(product.minimumOrderQuantity || 1),
      weightValue: product.weightValue == null ? '' : String(product.weightValue),
      weightUnit: product.weightUnit || 'g',
      customizationOptions: (product.customizationOptions ?? []).join('\n'),
      advancePaymentRequired: product.advancePaymentRequired === true,
      careInstructions: product.careInstructions ?? '',
      ingredients: product.ingredients ?? '', allergens: (product.allergens??[]).join(', '),
      dietaryTags: (product.dietaryTags??[]).join(', '), shelfLifeDays: product.shelfLifeDays == null ? '' : String(product.shelfLifeDays),
      storageInstructions: product.storageInstructions ?? '',
      weightOptions: (product.weightOptions?.length ? product.weightOptions : product.weightValue && product.weightUnit ? [{ value: product.weightValue, unit: product.weightUnit }] : []).map(w => ({ value: String(w.value), unit: w.unit, price: 'price' in w && typeof w.price === 'number' ? String(w.price) : String(product.price), stockQuantity: 'stockQuantity' in w && typeof w.stockQuantity === 'number' ? String(w.stockQuantity) : '' })),
      showPrice: product.showPrice, status: product.status === 'published' ? 'published' : 'draft'
    } : emptyDraft);
    setSaveError('');
    setFormOpen(true);
  }

  async function uploadProductPhotos(files: File[]) {
    if (!user || !active || uploadingPhotos || busy || !files.length) return;
    const currentCount = draft.imageUrls.split(/\r?\n|,/).filter(x => x.trim()).length;
    if (currentCount + files.length > 10) {
      toast({ variant: 'destructive', title: 'Maximum 10 photos', description: 'Remove some photos before adding more.' });
      return;
    }
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_000_000 || file.size === 0) {
        toast({ variant: 'destructive', title: 'Unsupported photo', description: 'Select JPG, PNG or WebP images under 2 MB each.' });
        return;
      }
    }
    setUploadingPhotos(true);
    let uploaded=0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`Uploading photo ${index + 1} of ${files.length}…`);
        const url = await uploadTreatStoryPhoto(user, file, 'product');
        uploaded++;
        setDraft(previous => ({
          ...previous,
          imageUrls: [...previous.imageUrls.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean), url].join('\n'),
        }));
      }
      setUploadProgress(`${files.length} photo(s) uploaded`);
      toast({ title: 'Photos uploaded', description: 'Save the product to publish these images.' });
    } catch (error) {
      setUploadProgress('');
      const notice=errorToast(error,'upload-photo');
      toast({...notice,...(uploaded?{title:`${uploaded} of ${files.length} photos uploaded`,description:`Uploaded photos are kept in your draft. ${notice.description}`}:{})});
    } finally { setUploadingPhotos(false); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user || !active || busy || uploadingPhotos) return;
    // Size-specific prices are stored on the same listing. Its base price
    // is the lowest effective variant price for catalog previews.
    const baseEntered = draft.price.trim() !== '';
    const basePrice = baseEntered ? Number(draft.price) : null;
    if (baseEntered && (!Number.isFinite(basePrice) || basePrice! < 0 || basePrice! > 10000000))
      return toast({ variant: 'destructive', title: 'Enter a valid base price' });
    const imageUrls = draft.imageUrls.split(/\n|,/).map(v => v.trim()).filter(Boolean);
    if (imageUrls.some(url => !/^https:\/\//i.test(url))) return toast({ variant: 'destructive', title: 'Image links must use HTTPS' });
    if (imageUrls.length > 10) return toast({ variant: 'destructive', title: 'Add up to 10 product photos' });
    const options = draft.customizationOptions.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (options.length > 6 || options.some(x => x.length > 80)) return toast({ variant: 'destructive', title: 'Add up to 6 short personalization prompts (80 characters each)' });
    const minQty = Number(draft.minimumOrderQuantity);
    if (!Number.isInteger(minQty) || minQty < 1 || minQty > 99) return toast({ variant: 'destructive', title: 'Minimum order quantity must be 1–99' });
    const weights = draft.weightOptions.map(w => ({ value: Number(w.value), unit: w.unit,
      ...(w.price.trim() !== '' ? { price: Number(w.price) } : {}),
      ...(w.stockQuantity.trim() !== '' ? { stockQuantity: Number(w.stockQuantity) } : {}) }));
    if (weights.length > 8 || weights.some(w => !Number.isFinite(w.value) || w.value <= 0 || w.value > 100000 || !['g','kg','ml','l','pieces'].includes(w.unit) ||
      ('price' in w && (!Number.isFinite(w.price) || (w.price ?? -1) < 0 || (w.price ?? 10000001) > 10000000)) ||
      ('stockQuantity' in w && (!Number.isInteger(w.stockQuantity) || (w.stockQuantity ?? -1) < 0 || (w.stockQuantity ?? 1000001) > 1000000))))
      return toast({ variant: 'destructive', title: 'Check size options, prices and stock (maximum 8 sizes)' });
    if (new Set(weights.map(w => `${w.value}:${w.unit}`)).size !== weights.length)
      return toast({ variant: 'destructive', title: 'Duplicate sizes', description: 'Each weight and unit combination must be unique.' });
    if (weights.length && weights.some(w => w.price === undefined))
      return toast({ variant: 'destructive', title: 'Price required for every size', description: 'Enter an individual selling price for each weight or unit.' });
    if (!weights.length && basePrice === null)
      return toast({ variant: 'destructive', title: 'Enter a selling price' });
    const price = weights.length
      ? Math.min(...weights.map(w => w.price!))
      : basePrice!;
    const sharedStock = draft.stockQuantity.trim() === '' ? 0 : Number(draft.stockQuantity);
    if (!Number.isInteger(sharedStock) || sharedStock < 0 || sharedStock > 1000000)
      return toast({ variant: 'destructive', title: 'Stock must be a whole number between 0 and 1,000,000' });
    if (draft.availability === 'available' && weights.length > 0 &&
        weights.some(w => w.stockQuantity === undefined) && sharedStock === 0)
      return toast({ variant: 'destructive', title: 'Set the stock for each size', description: 'Enter size-specific stock, or a shared stock quantity. Made-to-order items do not need stock.' });
    if (draft.category.trim().length < 2) return toast({ variant: 'destructive', title: 'Enter a product category' });
    const allergens = draft.allergens.split(',').map(s=>s.trim()).filter(Boolean);
    const dietaryTags = draft.dietaryTags.split(',').map(s=>s.trim()).filter(Boolean);
    const shelfLifeDays = draft.shelfLifeDays.trim()==='' ? null : Number(draft.shelfLifeDays);
    if (allergens.length>12 || dietaryTags.length>12 || [...allergens,...dietaryTags].some(s=>s.length>40) ||
      draft.ingredients.length>1000 || draft.storageInstructions.length>500 ||
      (shelfLifeDays!==null && (!Number.isInteger(shelfLifeDays)||shelfLifeDays<0||shelfLifeDays>365))) {
      return toast({variant:'destructive',title:'Check food information',description:'Use up to 12 allergen/dietary labels, and a shelf life between 0 and 365 days.'});
    }

    const preparationDays = draft.preparationDays.trim() === '' ? 0 : Number(draft.preparationDays);
    if (!Number.isInteger(preparationDays) || preparationDays < 0 || preparationDays > 365)
      return toast({ variant: 'destructive', title: 'Preparation days must be a whole number between 0 and 365' });
    setSaveError('');
    setBusy(true);
    try {
      const data = {
        sellerId: user.uid, name: draft.name.trim(), description: draft.description.trim(), category: draft.category.trim(),
        price, imageUrls, showPrice: draft.showPrice, availability: draft.availability,
        stockQuantity: sharedStock,
        preparationDays,
        minimumOrderQuantity: minQty,
        customizationOptions: options,
        advancePaymentRequired: draft.advancePaymentRequired,
        careInstructions: draft.careInstructions.trim(),
        ingredients: draft.ingredients.trim(), allergens, dietaryTags,
        ...(shelfLifeDays!==null ? {shelfLifeDays} : {}),
        storageInstructions: draft.storageInstructions.trim(),
        weightOptions: weights,

        status: draft.status
      };
      const token=await user.getIdToken();
      const response=await fetch('/api/seller/products',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({product:data,...(editing?{productId:editing.id,expectedUpdatedAt:(editing.updatedAt as {toMillis?:()=>number}|undefined)?.toMillis?.()}:{})})});
      const result=await response.json();if(!response.ok)throw new ActionError(result.error||'Could not save product.',response.status);
      setCountVersion(v => v + 1);
      toast({title:draft.status==='draft'?'Product draft saved':editing?'Product updated':'Product published',description:draft.status==='draft'?`Your draft is saved with SKU ${result.sku}. Publish it when you are ready.`:`${draft.name.trim()} is saved. Share SKU ${result.sku} in your Instagram reel so buyers can find it.`});
      setFormOpen(false);
    } catch (error) {
      const code = (error as {code?: string})?.code || 'unknown';
      console.error('TreatStory product save failed', { code, operation: editing ? 'update' : 'create', sizes: weights.length, allergens: allergens.length, dietaryLabels: dietaryTags.length });
      const notice=errorToast(error,'save-product');
      setSaveError(`${notice.title}. ${notice.description}`);toast(notice);
    }
    finally { setBusy(false); }
  }

  async function removeProduct(product: MarketplaceProduct) {
    if (!db || !active || busy) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'marketplace_products', product.id)); setCountVersion(v => v + 1); setPendingDelete(null);toast({title:'Product deleted',description:`${product.name} has been removed from your shop.`}); }
    catch(error) {const notice=errorToast(error,'delete-product');setDeleteError(notice.description);toast(notice);}
    finally { setBusy(false); }
  }

  const menu: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'products', label: 'My products', icon: Package },
    { key: 'orders', label: 'Orders', icon: ShoppingBag },
    { key: 'store', label: 'Store settings', icon: Settings },
  ];

  if (isUserLoading || isRoleLoading || (!seller && applicationLoading)) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><DashboardShellSkeleton title="Seller studio" /></div>;
  if (roleError) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell py-10"><h1 className="text-xl font-semibold">Unable to verify seller access</h1><p className="mt-3 text-sm text-muted-foreground">Check your connection and try again. No access changes were made.</p></main></div>;
  if (!seller) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell mx-auto max-w-2xl py-20"><p className="eyebrow text-[#a68a64]">TreatStory for creators</p><h1 className="mt-4 text-4xl font-medium">Your seller journey starts here.</h1><p className="mt-5 text-muted-foreground">{application ? `Your application is ${application.status}. Your workspace becomes available once approved.` : 'Apply to become a seller to access your workspace.'}</p><Link href="/become-a-seller" className="editorial-button mt-8">Seller application <ArrowUpRight className="ml-2 h-4 w-4" /></Link></main></div>;

  return <div className="min-h-screen bg-[#f7f5f1]"><Header />
    <div className="section-shell seller-workspace grid min-w-0 w-full gap-4 py-4 sm:gap-6 sm:py-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8 lg:py-10">
      <aside className="min-w-0 space-y-3 lg:space-y-6">
        <div className="rounded-2xl bg-[#29251f] p-5 text-white sm:p-6 lg:rounded-3xl"><p className="text-[10px] uppercase tracking-[0.2em] text-[#c9ae85]">Seller studio</p><h2 className="mt-2 break-words text-xl font-medium sm:text-2xl">{seller.businessName}</h2><p className="mt-2 text-xs text-[#d2b58b] capitalize">{seller.accessType === 'trial' ? 'Trial access' : 'Permanent / full access'} · Until {dateText(seller.accessEndsAt)}</p><p className="mt-3 inline-flex items-center gap-2 text-xs text-white/70"><span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-400'}`} />{active ? 'Store access active' : 'Access restricted'}</p></div>
        <nav aria-label="Seller workspace" className="grid grid-cols-4 gap-2 rounded-2xl bg-white p-1.5 shadow-sm lg:flex lg:flex-col lg:bg-transparent lg:p-0 lg:shadow-none">{menu.map(item => <button key={item.key} aria-current={section === item.key ? "page" : undefined} onClick={() => setSection(item.key)} className={`flex min-h-[66px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center text-[10px] font-medium transition sm:text-xs lg:min-h-11 lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-left lg:text-sm ${section === item.key ? 'bg-[#e7dfd2] font-semibold text-[#29251f]' : 'text-muted-foreground hover:bg-white'}`}><item.icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" /><span className="break-words">{item.label}</span></button>)}</nav>
        <Link href="/account" className="hidden items-center gap-2 px-4 text-xs text-muted-foreground hover:text-foreground lg:inline-flex"><LogOut className="h-4 w-4" />Account & sign out</Link>
      </aside>
      <main className="min-w-0 space-y-4 sm:space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#a68a64]">Your creative business</p><h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-4xl">{menu.find(m => m.key === section)?.label}</h1><p className="mt-2 hidden text-sm text-muted-foreground sm:block">Manage your TreatStory presence in one place.</p></div>{section === 'products' && <Button onClick={() => openForm()} disabled={!active} className="rounded-full"><Plus className="mr-2 h-4 w-4" />New product</Button>}</div>
        {!active && <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><AlertCircle className="h-5 w-5 shrink-0" /><span>Your seller access is suspended, expired or not yet active. Editing and publishing are disabled. Contact TreatStory administration to renew access.</span></div>}
        {section === 'overview' && <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[
            { label: 'Total products', value: countError ? '—' : counts?.total ?? '…', icon: Package },
            { label: 'Published products', value: countError ? '—' : counts?.published ?? '…', icon: CheckCircle2 },
            { label: 'Draft products', value: countError ? '—' : counts ? counts.total - counts.published : '…', icon: Clock3 },
          ].map(metric => <div key={metric.label} className="rounded-2xl border border-[#e9e3d9] bg-white p-4 shadow-sm shadow-[#29251f]/[0.03] sm:p-6"><metric.icon className="h-5 w-5 text-[#a68a64]" /><p className="mt-3 text-2xl font-semibold sm:mt-6 sm:text-3xl">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground sm:text-sm">{metric.label}</p></div>)}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Today's orders", count: fulfillment?.today },
              { label: 'Needs acceptance', count: fulfillment?.pending },
              { label: 'Preparing', count: fulfillment?.preparing },
              { label: 'Ready to fulfill', count: fulfillment?.ready },
              { label: 'Out for delivery', count: fulfillment?.outForDelivery },
            ].map(item => <button key={item.label} type="button" onClick={() => setSection('orders')} className="rounded-2xl border border-[#e8e0d5] bg-white p-3 text-left transition hover:border-[#a68a64] sm:p-5"><p className="text-2xl font-semibold">{fulfillment ? item.count ?? '—' : '…'}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></button>)}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setSection('products')} className="rounded-full bg-[#eee6da] px-4 py-2 text-xs font-medium text-[#6d5336]">Low-stock listings (1–3 units): {fulfillment ? fulfillment.lowStock ?? '—' : '…'}</button>
            {((seller.accessEndsAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0) < Date.now() + 7 * 86400000 && <span className="rounded-full bg-amber-50 px-4 py-2 text-xs text-amber-900">Seller access expires {dateText(seller.accessEndsAt)} · Contact admin to renew</span>}
          </div>
          <div className="rounded-2xl border border-[#e9e3d9] bg-white p-5 sm:rounded-3xl sm:p-7"><p className="eyebrow text-[#a68a64]">Store setup</p><div className="mt-2"><h3 className="font-medium">Get your store ready</h3><p className="mt-2 text-sm text-muted-foreground">Add high-quality photos, publish products and keep your business contact details current.</p><Button variant="outline" className="mt-4 rounded-full" onClick={() => setSection('products')}>Manage products <ArrowUpRight className="ml-2 h-4 w-4" /></Button></div></div>
        </div>}
        {section === 'products' && <div className="space-y-5">
          <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>
          <Input aria-label="Search your products" placeholder="Search your catalog…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-full bg-white" />
          {productsLoading ? <SectionSkeleton /> : visible.length === 0 ? <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Package className="mx-auto h-8 w-8 text-[#a68a64]" /><h3 className="mt-4 text-xl font-medium">No products yet</h3><p className="mt-2 text-sm text-muted-foreground">Create your first listing to get started.</p><Button onClick={() => openForm()} disabled={!active} className="mt-5 rounded-full">Add product</Button></div> :
            <><div className="space-y-3 md:hidden">{visible.map(p => <article key={p.id} className="rounded-2xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{p.name}</h3><p className="mt-1 text-xs text-muted-foreground">{p.category}</p>{p.sku ? <div className="mt-2"><ProductSkuCopy sku={p.sku} /></div> : <p className="mt-1 text-[11px] text-amber-800">Save an edit to generate a shareable SKU</p>}{p.advancePaymentRequired && <p className="mt-1 text-xs font-medium text-amber-800">Advance payment required</p>}{!!p.weightOptions?.length && <p className="mt-1 max-w-sm text-[11px] leading-5 text-[#806d56]">{sizePriceLabels(p)}</p>}</div><p className="shrink-0 text-sm font-semibold">{priceRange(p)}</p></div><div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-[#f1ede6] px-3 py-1 capitalize">{p.availability.replaceAll('-', ' ')}</span><span className="rounded-full bg-[#f1ede6] px-3 py-1 capitalize">{p.status ?? 'draft'}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" disabled={!active} onClick={() => openForm(p)} className="h-11"><Pencil className="mr-2 h-4 w-4" />Edit</Button><Button variant="outline" disabled={!active || busy} onClick={() => {setDeleteError('');setPendingDelete(p);}} className="h-11 text-red-700"><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div></article>)}</div><div className="hidden overflow-hidden rounded-2xl border bg-white md:block"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f1ede6] text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-4">Product</th><th className="px-5 py-4">Price</th><th className="px-5 py-4">Availability</th><th className="px-5 py-4">Visibility</th><th className="px-5 py-4">Actions</th></tr></thead><tbody>{visible.map(p => <tr key={p.id} className="border-t"><td className="min-w-[180px] px-5 py-4"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.category}</p>{p.sku ? <div className="mt-2"><ProductSkuCopy sku={p.sku} /></div> : <p className="mt-1 text-[11px] text-amber-800">Save an edit to generate a shareable SKU</p>}{p.advancePaymentRequired && <p className="mt-1 text-xs font-medium text-amber-800">Advance payment required</p>}{!!p.weightOptions?.length && <p className="mt-1 max-w-sm text-[11px] leading-5 text-[#806d56]">{sizePriceLabels(p)}</p>}</td><td className="px-5 py-4">{priceRange(p)}</td><td className="px-5 py-4 capitalize">{p.availability.replaceAll('-', ' ')}</td><td className="px-5 py-4 capitalize">{p.status ?? 'draft'}</td><td className="px-5 py-4"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!active} onClick={() => openForm(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={!active || busy} onClick={() => {setDeleteError('');setPendingDelete(p);}} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div></div></>}
        </div>}
        {section === 'orders' && <OrderManagement mode="seller" />}
        {section === 'store' && db && user && <SellerStoreSettings seller={seller} user={user} db={db} active={active} />}
      </main>
    </div>
    <ConfirmActionDialog open={!!pendingDelete} onOpenChange={open=>{if(!open)setPendingDelete(null);}} title="Delete this product?" description={`${pendingDelete?.name || 'This product'} will be removed from your shop. This cannot be undone.`} confirmLabel="Delete product" pendingLabel="Deleting…" destructive busy={busy} error={deleteError} onConfirm={()=>pendingDelete?removeProduct(pendingDelete):undefined} />
    {formOpen && <SellerProductEditor saveError={saveError} open={formOpen} editing={!!editing} sku={editing?.sku} busy={busy} enabled={active} draft={draft} setDraft={setDraft} categories={[...new Set((products ?? []).map(p => p.category))]} onClose={() => { if (!uploadingPhotos && !busy) { setFormOpen(false); setUploadProgress(''); } }} onSubmit={saveProduct} onUploadPhotos={uploadProductPhotos} uploading={uploadingPhotos} uploadProgress={uploadProgress} />}
  </div>;
}

export default function SellerDashboard() { return <Suspense fallback={<SectionSkeleton />}><SellerContent /></Suspense>; }
