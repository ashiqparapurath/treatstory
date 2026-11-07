'use client';
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

type Section = 'overview' | 'products' | 'orders' | 'store';
const dateText = (value: unknown) => { const d = (value as { toDate?: () => Date } | null)?.toDate?.(); return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'; };

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
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [storeDraft, setStoreDraft] = useState({ description: '', contactPhone: '', whatsappNumber: '', isOpen: true });

  useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [isUserLoading, user, router]);
  useEffect(() => {
    if (seller) setStoreDraft({ description: seller.description, contactPhone: seller.contactPhone, whatsappNumber: seller.whatsappNumber || '', isOpen: seller.isOpen });
  }, [seller]);

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
  const { data: products, isLoading: productsLoading } = useCollection<MarketplaceProduct & { status?: string }>(productsQuery);
  const active = !!seller && seller.status === 'active' && ((seller.accessEndsAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0) > Date.now();
  const visible = useMemo(() => (products ?? []).filter(p => (p.name + ' ' + p.category).toLowerCase().includes(search.toLowerCase())), [products, search]);

  function openForm(product?: MarketplaceProduct & { status?: string }) {
    setEditing(product ?? null);
    setDraft(product ? {
      name: product.name, description: product.description, price: String(product.price), category: product.category,
      imageUrls: product.imageUrls.join('\n'), availability: product.availability,
      stockQuantity: product.stockQuantity == null ? '' : String(product.stockQuantity),
      preparationDays: product.preparationDays == null ? '' : String(product.preparationDays),
      minimumOrderQuantity: String(product.minimumOrderQuantity || 1),
      weightValue: product.weightValue == null ? '' : String(product.weightValue),
      weightUnit: product.weightUnit || 'g',
      customizationOptions: (product.customizationOptions ?? []).join('\n'),
      careInstructions: product.careInstructions ?? '',
      weightOptions: (product.weightOptions?.length ? product.weightOptions : product.weightValue && product.weightUnit ? [{ value: product.weightValue, unit: product.weightUnit }] : []).map(w => ({ value: String(w.value), unit: w.unit })),
      showPrice: product.showPrice, status: product.status === 'published' ? 'published' : 'draft'
    } : emptyDraft);
    setFormOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user || !active || busy) return;
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) return toast({ variant: 'destructive', title: 'Enter a valid price' });
    const imageUrls = draft.imageUrls.split(/\n|,/).map(v => v.trim()).filter(Boolean);
    if (imageUrls.some(url => !/^https:\/\//i.test(url))) return toast({ variant: 'destructive', title: 'Image links must use HTTPS' });
    if (imageUrls.length > 10) return toast({ variant: 'destructive', title: 'Add up to 10 product photos' });
    const options = draft.customizationOptions.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (options.length > 6 || options.some(x => x.length > 80)) return toast({ variant: 'destructive', title: 'Add up to 6 short personalization prompts (80 characters each)' });
    const minQty = Number(draft.minimumOrderQuantity);
    if (!Number.isInteger(minQty) || minQty < 1 || minQty > 99) return toast({ variant: 'destructive', title: 'Minimum order quantity must be 1–99' });
    const weights = draft.weightOptions.map(w => ({ value: Number(w.value), unit: w.unit }));
    if (weights.length > 8 || weights.some(w => !Number.isFinite(w.value) || w.value <= 0 || w.value > 100000 || !['g','kg','ml','l','pieces'].includes(w.unit))) return toast({ variant: 'destructive', title: 'Weight options must contain valid values (maximum 8)' });
    if (draft.category.trim().length < 2) return toast({ variant: 'destructive', title: 'Enter a product category' });
    setBusy(true);
    try {
      const data = {
        sellerId: user.uid, name: draft.name.trim(), description: draft.description.trim(), category: draft.category.trim(),
        price, imageUrls, showPrice: draft.showPrice, availability: draft.availability,
        stockQuantity: draft.stockQuantity ? Number(draft.stockQuantity) : 0,
        preparationDays: draft.preparationDays ? Number(draft.preparationDays) : 0,
        minimumOrderQuantity: minQty,
        customizationOptions: options,
        careInstructions: draft.careInstructions.trim(),
        weightOptions: weights,
        ...(editing ? { weightValue: deleteField(), weightUnit: deleteField() } : {}),
        status: draft.status, updatedAt: serverTimestamp()
      };
      if (editing) await updateDoc(doc(db, 'marketplace_products', editing.id), data);
      else await addDoc(collection(db, 'marketplace_products'), { ...data, createdAt: serverTimestamp() });
      setCountVersion(v => v + 1);
      toast({ title: editing ? 'Product updated' : 'Product created' });
      setFormOpen(false);
    } catch { toast({ variant: 'destructive', title: 'Could not save product', description: 'Check your account access and field values.' }); }
    finally { setBusy(false); }
  }

  async function removeProduct(product: MarketplaceProduct) {
    if (!db || !active || busy || !window.confirm('Delete this product permanently?')) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'marketplace_products', product.id)); setCountVersion(v => v + 1); toast({ title: 'Product deleted' }); }
    catch { toast({ variant: 'destructive', title: 'Could not delete product' }); }
    finally { setBusy(false); }
  }

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user || !active || busy) return;
    const digits = storeDraft.whatsappNumber.replace(/[^0-9]/g, '');
    if (digits && (digits.length < 8 || digits.length > 15)) { toast({ variant: 'destructive', title: 'Enter a valid WhatsApp number with country code' }); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'sellers', user.uid), { ...storeDraft, whatsappNumber: digits, updatedAt: serverTimestamp() });
      toast({ title: 'Store settings saved' });
    } catch { toast({ variant: 'destructive', title: 'Could not save store settings' }); }
    finally { setBusy(false); }
  }

  const menu: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'products', label: 'My products', icon: Package },
    { key: 'orders', label: 'Orders', icon: ShoppingBag },
    { key: 'store', label: 'Store settings', icon: Settings },
  ];

  if (isUserLoading || isRoleLoading || (!seller && applicationLoading)) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><DashboardShellSkeleton title="Seller studio" /></div>;
  if (roleError) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell py-10"><h1 className="text-xl font-semibold">Unable to verify seller access</h1><p className="mt-3 text-sm text-muted-foreground">Check your connection and deployed Firestore rules. No access changes were made.</p></main></div>;
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
          <Input aria-label="Search your products" placeholder="Search your catalog…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-full bg-white" />
          {productsLoading ? <SectionSkeleton /> : visible.length === 0 ? <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Package className="mx-auto h-8 w-8 text-[#a68a64]" /><h3 className="mt-4 text-xl font-medium">No products yet</h3><p className="mt-2 text-sm text-muted-foreground">Create your first listing to get started.</p><Button onClick={() => openForm()} disabled={!active} className="mt-5 rounded-full">Add product</Button></div> :
            <><div className="space-y-3 md:hidden">{visible.map(p => <article key={p.id} className="rounded-2xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{p.name}</h3><p className="mt-1 text-xs text-muted-foreground">{p.category}</p></div><p className="shrink-0 text-sm font-semibold">₹{p.price.toLocaleString('en-IN')}</p></div><div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-[#f1ede6] px-3 py-1 capitalize">{p.availability.replaceAll('-', ' ')}</span><span className="rounded-full bg-[#f1ede6] px-3 py-1 capitalize">{p.status ?? 'draft'}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" disabled={!active} onClick={() => openForm(p)} className="h-11"><Pencil className="mr-2 h-4 w-4" />Edit</Button><Button variant="outline" disabled={!active || busy} onClick={() => removeProduct(p)} className="h-11 text-red-700"><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div></article>)}</div><div className="hidden overflow-hidden rounded-2xl border bg-white md:block"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f1ede6] text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-4">Product</th><th className="px-5 py-4">Price</th><th className="px-5 py-4">Availability</th><th className="px-5 py-4">Visibility</th><th className="px-5 py-4">Actions</th></tr></thead><tbody>{visible.map(p => <tr key={p.id} className="border-t"><td className="min-w-[180px] px-5 py-4"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.category}</p></td><td className="px-5 py-4">₹{p.price.toLocaleString('en-IN')}</td><td className="px-5 py-4 capitalize">{p.availability.replaceAll('-', ' ')}</td><td className="px-5 py-4 capitalize">{p.status ?? 'draft'}</td><td className="px-5 py-4"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!active} onClick={() => openForm(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={!active || busy} onClick={() => removeProduct(p)} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div></div></>}
        </div>}
        {section === 'orders' && <OrderManagement mode="seller" />}
        {section === 'store' && <form onSubmit={saveStore} className="space-y-5 rounded-2xl border bg-white p-4 sm:space-y-6 sm:rounded-3xl sm:p-8"><div><h2 className="text-xl font-medium">Business profile</h2><p className="mt-1 text-sm text-muted-foreground">Only editable store details appear here. Business identity and access are controlled by TreatStory.</p></div><div><Label>Business name</Label><Input value={seller.businessName} disabled className="mt-2" /></div><div><Label htmlFor="storeDescription">About your store</Label><Textarea id="storeDescription" rows={5} maxLength={2000} value={storeDraft.description} onChange={e => setStoreDraft(s => ({ ...s, description: e.target.value }))} className="mt-2" /></div><div><Label htmlFor="storePhone">Contact phone</Label><Input id="storePhone" maxLength={40} value={storeDraft.contactPhone} onChange={e => setStoreDraft(s => ({ ...s, contactPhone: e.target.value }))} className="mt-2" /></div><div><Label htmlFor="storeWhatsapp">WhatsApp orders · business number</Label><Input id="storeWhatsapp" type="tel" inputMode="tel" maxLength={20} placeholder="919876543210 (include country code)" value={storeDraft.whatsappNumber} onChange={e => setStoreDraft(s => ({...s, whatsappNumber:e.target.value}))} className="mt-2" /><p className="mt-1 text-xs text-muted-foreground">Buyers can contact your store directly from product pages. Digits only, with country code. Leave empty to hide the WhatsApp button.</p></div><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={storeDraft.isOpen} onChange={e => setStoreDraft(s => ({ ...s, isOpen: e.target.checked }))} />Accepting enquiries</label><Button type="submit" disabled={!active || busy} className="rounded-full">Save changes</Button></form>}
      </main>
    </div>
    {formOpen && <SellerProductEditor open={formOpen} editing={!!editing} busy={busy} enabled={active} draft={draft} setDraft={setDraft} categories={[...new Set((products ?? []).map(p => p.category))]} onClose={() => setFormOpen(false)} onSubmit={saveProduct} />}
  </div>;
}

export default function SellerDashboard() { return <Suspense fallback={<SectionSkeleton />}><SellerContent /></Suspense>; }
