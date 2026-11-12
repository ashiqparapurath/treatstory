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
import { LayoutDashboard, Package, Settings, ShoppingBag, Plus, ArrowUpRight, Clock3, Store, Trash2, Pencil, CheckCircle2, AlertCircle, LogOut, Search, ImageIcon, LifeBuoy } from 'lucide-react';
import { SellerProductEditor, emptyDraft, type ProductDraft } from '@/components/seller-product-editor';
import { parseProductImageUrls } from '@/lib/product-image-urls';
import { saveProductRequest, invalidProductMessage } from '@/lib/seller-product-validation';
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
  const [listingFilter, setListingFilter] = useState<'all' | 'published' | 'draft'>('all');
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
  const visible = useMemo(() => (products ?? []).filter(p => (listingFilter === 'all' || (p.status ?? 'draft') === listingFilter) && (p.name + ' ' + p.category + ' ' + (p.sku || '')).toLowerCase().includes(search.trim().toLowerCase())), [products, search, listingFilter]);
  const loadedPublished = (products ?? []).filter(p => p.status === 'published').length;
  const loadedDrafts = (products ?? []).length - loadedPublished;

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
    const currentCount = parseProductImageUrls(draft.imageUrls).length;
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
          imageUrls: [...parseProductImageUrls(previous.imageUrls), url].join('\n'),
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
    const imageUrls = parseProductImageUrls(draft.imageUrls);
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
      const payload = { product: data, ...(editing ? {
        productId: editing.id,
        expectedUpdatedAt: (editing.updatedAt as {toMillis?:()=>number}|undefined)?.toMillis?.() ?? null,
      } : {}) };
      const validation = saveProductRequest.safeParse(payload);
      if (!validation.success) {
        const message = invalidProductMessage(validation.error.issues);
        setSaveError(message);
        toast({ variant: 'destructive', title: 'Check product details', description: message });
        return;
      }
      const token=await user.getIdToken();
      const response=await fetch('/api/seller/products',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(validation.data)});
      const result=await response.json();if(!response.ok)throw new ActionError(result.error||'Could not save product.',response.status);
      setCountVersion(v => v + 1);
      toast({title:draft.status==='draft'?'Product draft saved':editing?'Product updated':'Product published',description:draft.status==='draft'?`Your draft is saved with SKU ${result.sku}. Publish it when you are ready.`:`${draft.name.trim()} is saved. Share SKU ${result.sku} in your Instagram reel so buyers can find it.`});
      setFormOpen(false);
    } catch (error) {
      // Expected validation responses are shown in the form; don't log them as opaque SDK failures.
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
    <div className="section-shell seller-workspace grid min-w-0 w-full gap-5 py-5 sm:gap-7 sm:py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:py-11">
      <aside className="min-w-0 space-y-3 lg:space-y-5">
        <div className="rounded-2xl border border-[#e6dfd5] bg-white p-4 sm:p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#29251f] text-[#f5eadb]"><Store className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9a8061]">Seller workspace</p><h2 className="mt-0.5 truncate text-base font-semibold text-[#29251f]" title={seller.businessName}>{seller.businessName}</h2></div></div><div className="mt-4 flex items-center gap-2 border-t border-[#f0ece6] pt-3 text-xs text-[#63594c]"><span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />{active ? 'Store active' : 'Access restricted'}</div><p className="mt-1 text-[11px] text-[#87796a]">{seller.accessType === 'trial' ? 'Trial' : 'Full'} access · Until {dateText(seller.accessEndsAt)}</p></div>
        <nav aria-label="Seller workspace" className="grid grid-cols-4 gap-1 rounded-2xl border border-[#e6dfd5] bg-white p-1.5 lg:flex lg:flex-col lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0">{menu.map(item => <button key={item.key} aria-current={section === item.key ? "page" : undefined} onClick={() => setSection(item.key)} className={`flex min-h-[66px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center text-[10px] font-medium transition sm:text-xs lg:min-h-11 lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-left lg:text-sm ${section === item.key ? 'bg-[#eae2d7] font-semibold text-[#29251f]' : 'text-[#756a5d] hover:bg-[#eee8e0]'}`}><item.icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" /><span className="break-words">{item.label}</span></button>)}</nav>
        <Link href="/support" className="hidden min-h-11 items-center gap-2 rounded-xl border border-[#e6dfd5] bg-white px-4 text-sm font-medium text-[#665544] transition hover:border-[#baa48a] hover:bg-[#faf7f2] lg:flex"><LifeBuoy className="h-4 w-4 text-[#a68a64]" />Help &amp; Support <ArrowUpRight className="ml-auto h-4 w-4" /></Link>
        <Link href="/account" className="hidden items-center gap-2 px-4 text-xs text-muted-foreground hover:text-foreground lg:inline-flex"><LogOut className="h-4 w-4" />Account & sign out</Link>
      </aside>
      <main className="min-w-0 space-y-5 sm:space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7ded2] pb-5 sm:pb-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Seller studio / {section}</p><h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-[#29251f] sm:text-[36px]">{section === 'products' ? 'Your catalog' : menu.find(m => m.key === section)?.label}</h1><p className="mt-1 text-sm text-[#817568]">{section === 'products' ? 'Organize listings, update prices and manage what shoppers see.' : section === 'orders' ? 'Stay on top of every customer order.' : section === 'store' ? 'Keep your storefront ready for shoppers.' : 'Your business at a glance.'}</p></div>{section === 'products' && <Button onClick={() => openForm()} disabled={!active} className="h-11 rounded-xl bg-[#29251f] px-5 text-white hover:bg-[#443b31]"><Plus className="mr-2 h-4 w-4" />Add product</Button>}</div>
        {!active && <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><AlertCircle className="h-5 w-5 shrink-0" /><span>Your seller access is suspended, expired or not yet active. Editing and publishing are disabled. Contact TreatStory administration to renew access.</span></div>}
        {section === 'overview' && <div className="space-y-5 sm:space-y-6">
          <section className="relative overflow-hidden rounded-2xl bg-[#29251f] p-5 text-white sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10 sm:h-80 sm:w-80" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-lg"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#cbb28c]">Your business today</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Create. Sell. Grow.</h2><p className="mt-2 text-sm leading-6 text-white/70">Everything that needs your attention, in one place.</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/85">{seller.isOpen === false ? 'Store paused' : 'Store accepting orders'}</span><span className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/85">{active ? 'Account active' : 'Access restricted'}</span></div></div>
              <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end"><Button type="button" disabled={!active} onClick={() => openForm()} className="h-11 rounded-xl bg-white px-4 text-[#29251f] hover:bg-[#f0e6d9]"><Plus className="mr-2 h-4 w-4" />Add product</Button><button type="button" onClick={() => setSection('orders')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 px-4 text-sm font-medium text-white hover:bg-white/10">View orders <ArrowUpRight className="ml-2 h-4 w-4" /></button></div>
            </div>
          </section>
          <section aria-labelledby="seller-performance-title" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a68a64]">Store performance</p><h2 id="seller-performance-title" className="mt-1 text-lg font-semibold text-[#29251f]">Your catalog at a glance</h2></div><button type="button" onClick={() => setSection('products')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#796348] hover:underline">View catalog <ArrowUpRight className="h-3.5 w-3.5" /></button></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[
              { label: 'Total listings', value: countError ? '—' : counts?.total ?? '…', icon: Package, note:'All catalog entries' },
              { label: 'Live products', value: countError ? '—' : counts?.published ?? '…', icon: CheckCircle2, note:'Published to shoppers' },
              { label: 'Drafts', value: countError ? '—' : counts ? counts.total - counts.published : '…', icon: Clock3, note:'Not published yet' },
            ].map(metric => <div key={metric.label} className="rounded-2xl border border-[#e6dfd5] bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs text-[#827568]">{metric.label}</span><metric.icon aria-hidden="true" className="h-4 w-4 text-[#a68a64]" /></div><p className="mt-5 text-3xl font-semibold tabular-nums text-[#29251f]">{metric.value}</p><p className="mt-1 text-[11px] text-[#928575]">{metric.note}</p></div>)}</div>
            {countError && <p role="status" className="text-xs text-[#806d56]">Catalog totals are temporarily unavailable. Your products have not been changed.</p>}
          </section>
          <section className="overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white" aria-labelledby="seller-queue-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efe9e1] px-4 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a68a64]">Fulfillment</p><h2 id="seller-queue-title" className="mt-1 text-lg font-semibold">Orders & attention</h2></div><button type="button" onClick={() => setSection('orders')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#796348] hover:underline">Manage orders <ArrowUpRight className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[#efe9e1] sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Today's orders", count: fulfillment?.today },
                { label: 'Awaiting approval', count: fulfillment?.pending },
                { label: 'Preparing', count: fulfillment?.preparing },
                { label: 'Ready', count: fulfillment?.ready },
                { label: 'Out for delivery', count: fulfillment?.outForDelivery },
              ].map(item => <button key={item.label} type="button" onClick={() => setSection('orders')} className="group min-h-28 px-4 py-5 text-left transition hover:bg-[#faf7f2] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#a98d69] sm:px-5"><p className="text-2xl font-semibold tabular-nums">{fulfillment ? item.count ?? '—' : '…'}</p><p className="mt-2 text-xs leading-4 text-[#817568]">{item.label}</p></button>)}
            </div>
            {fulfillment?.pending !== null && fulfillment?.pending !== undefined && fulfillment.pending > 0 && <button type="button" onClick={() => setSection('orders')} className="flex w-full items-center justify-between gap-3 border-t border-[#eadbc6] bg-[#fbf5ec] px-4 py-3 text-left text-xs font-medium text-[#805a36] sm:px-6"><span>{fulfillment.pending} order{fulfillment.pending === 1 ? '' : 's'} waiting for your response</span><ArrowUpRight className="h-4 w-4" /></button>}
          </section>
          <div className="grid gap-3 lg:grid-cols-2">
            <button type="button" onClick={() => setSection('products')} className="flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-[#e6dfd5] bg-white p-5 text-left transition hover:border-[#baa48a]"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#a68a64]">Inventory check</p><p className="mt-2 text-base font-semibold text-[#29251f]">Low stock</p><p className="mt-1 text-xs text-[#817568]">{fulfillment ? fulfillment.lowStock === null ? 'Unavailable' : `${fulfillment.lowStock} listings with 1–3 units remaining` : 'Checking your available products…'}</p></div><Package className="h-6 w-6 shrink-0 text-[#a68a64]" /></button>
            <button type="button" onClick={() => setSection('store')} className="flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-[#e6dfd5] bg-white p-5 text-left transition hover:border-[#baa48a]"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#a68a64]">Your storefront</p><p className="mt-2 text-base font-semibold text-[#29251f]">Store settings</p><p className="mt-1 text-xs text-[#817568]">Update your branding, contact, pickup and delivery options.</p></div><Settings className="h-6 w-6 shrink-0 text-[#a68a64]" /></button>
          </div>
          {((seller.accessEndsAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0) < Date.now() + 7 * 86400000 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">Seller access expires {dateText(seller.accessEndsAt)}. Contact TreatStory administration to renew.</p>}
        </div>}
        {section === 'products' && <div className="space-y-4">
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white">
            {[
              {label:'Loaded listings', value:(products ?? []).length},
              {label:'Published', value:loadedPublished},
              {label:'Drafts', value:loadedDrafts},
            ].map((item,index) => <div key={item.label} className={`px-4 py-4 sm:px-6 sm:py-5 ${index ? 'border-l border-[#ebe5dc]' : ''}`}><p className="text-xl font-semibold tabular-nums text-[#29251f] sm:text-2xl">{productsLoading ? '…' : item.value}</p><p className="mt-1 text-[11px] text-[#85786a] sm:text-xs">{item.label}</p></div>)}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8b7a]" /><Input aria-label="Search your products" placeholder="Search by product name, category or SKU" value={search} onChange={e => setSearch(e.target.value)} className="h-11 w-full rounded-xl border-[#e6dfd5] bg-white pl-10 text-sm" /></div>
            <div className="flex items-center gap-1 rounded-xl border border-[#e6dfd5] bg-white p-1" aria-label="Filter products by visibility">
              {(['all','published','draft'] as const).map(filter => <button key={filter} type="button" aria-pressed={listingFilter === filter} onClick={() => setListingFilter(filter)} className={`min-h-9 rounded-lg px-3 text-xs font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a98d69] ${listingFilter === filter ? 'bg-[#29251f] text-white' : 'text-[#756a5d] hover:bg-[#f5f0e9]'}`}>{filter === 'all' ? 'All' : filter}</button>)}
            </div>
          </div>
          {productsLoading ? <SectionSkeleton /> : visible.length === 0 ? <div className="rounded-2xl border border-[#e6dfd5] bg-white px-5 py-12 text-center"><Package className="mx-auto h-8 w-8 text-[#a68a64]" /><h3 className="mt-4 text-lg font-semibold">{search || listingFilter !== 'all' ? 'No matching products' : 'Your catalog is ready for its first product'}</h3><p className="mt-2 text-sm text-muted-foreground">{search || listingFilter !== 'all' ? 'Try a different search or visibility filter.' : 'Add a listing to start sharing your work with customers.'}</p>{!search && listingFilter === 'all' && <Button onClick={() => openForm()} disabled={!active} className="mt-5 rounded-xl">Add your first product</Button>}</div> :
          <div className="overflow-hidden rounded-2xl border border-[#e6dfd5] bg-white">
            <div className="hidden grid-cols-[minmax(0,2.5fr)_minmax(110px,1fr)_minmax(115px,1fr)_minmax(100px,1fr)_96px] gap-4 border-b border-[#ece6dd] bg-[#faf8f5] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#897a69] lg:grid"><span>Listing</span><span>Price</span><span>Availability</span><span>Status</span><span className="text-right">Actions</span></div>
            <div className="divide-y divide-[#eee8df]">{visible.map(p => <article key={p.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[#fcfaf7] sm:px-5 lg:grid-cols-[minmax(0,2.5fr)_minmax(110px,1fr)_minmax(115px,1fr)_minmax(100px,1fr)_96px] lg:items-center lg:gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#ece6dd] bg-[#f5f1eb] sm:h-[72px] sm:w-[72px]">{p.imageUrls?.[0] ? <img src={p.imageUrls[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon aria-hidden="true" className="h-6 w-6 text-[#b4a696]" />}</div>
                <div className="min-w-0"><h3 className="break-words text-sm font-semibold leading-5 text-[#29251f]">{p.name}</h3><p className="mt-0.5 text-xs text-[#87786a]">{p.category}</p>{p.sku ? <div className="mt-1.5"><ProductSkuCopy sku={p.sku} /></div> : <p className="mt-1.5 text-[11px] text-amber-800">Edit to generate a SKU</p>}{p.advancePaymentRequired && <p className="mt-1 text-[11px] font-medium text-[#9b6642]">Advance payment required</p>}{!!p.weightOptions?.length && <p className="mt-1 max-w-sm text-[11px] leading-4 text-[#87786a]">{sizePriceLabels(p)}</p>}</div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:block"><span className="text-[11px] text-[#928677] lg:hidden">Price</span><span className="text-sm font-semibold tabular-nums text-[#29251f]">{priceRange(p)}</span></div>
              <div className="flex items-center justify-between gap-3 lg:block"><span className="text-[11px] text-[#928677] lg:hidden">Availability</span><span className="inline-flex rounded-full bg-[#f1ede6] px-2.5 py-1 text-[11px] font-medium capitalize text-[#655746]">{p.availability.replaceAll('-', ' ')}</span></div>
              <div className="flex items-center justify-between gap-3 lg:block"><span className="text-[11px] text-[#928677] lg:hidden">Visibility</span><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${p.status === 'published' ? 'bg-[#eaf3ed] text-[#35644b]' : 'bg-[#f3eee5] text-[#816441]'}`}><span className={`h-1.5 w-1.5 rounded-full ${p.status === 'published' ? 'bg-[#459368]' : 'bg-[#ac8b5d]'}`} />{p.status ?? 'draft'}</span></div>
              <div className="flex justify-end gap-2 lg:justify-end"><Button size="sm" variant="outline" disabled={!active} onClick={() => openForm(p)} aria-label={`Edit ${p.name}`} className="h-9 rounded-lg border-[#e5ddd3] bg-white px-3"><Pencil className="mr-1.5 h-3.5 w-3.5 lg:mr-0" /><span className="lg:sr-only">Edit</span></Button><Button size="sm" variant="outline" disabled={!active || busy} onClick={() => {setDeleteError('');setPendingDelete(p);}} aria-label={`Delete ${p.name}`} className="h-9 rounded-lg border-[#e5ddd3] bg-white px-3 text-[#97645f]"><Trash2 className="mr-1.5 h-3.5 w-3.5 lg:mr-0" /><span className="lg:sr-only">Delete</span></Button></div>
            </article>)}</div>
          </div>}
          <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/>
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
