'use client';

import dynamic from 'next/dynamic';
import { DashboardShellSkeleton, SectionSkeleton } from '@/components/loading-states';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut as firebaseSignOut } from 'firebase/auth';
import Link from 'next/link';
import { useAccountRole, useAuth, useUser } from '@/firebase';
import { Header } from '@/components/header';
const OrderManagement = dynamic(() => import('@/components/order-management').then(m => m.OrderManagement), { loading: () => <SectionSkeleton /> });
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
const ProductList = dynamic(() => import('@/components/admin/product-list').then(m => m.ProductList), { loading: () => <SectionSkeleton /> });
const MarketplaceCatalog = dynamic(() => import('@/components/admin/marketplace-catalog').then(m => m.MarketplaceCatalog), { loading: () => <SectionSkeleton /> });
const SellerApplications = dynamic(() => import('@/components/admin/seller-applications').then(m => m.SellerApplications), { loading: () => <SectionSkeleton /> });
const SellerManagement = dynamic(() => import('@/components/admin/seller-management').then(m => m.SellerManagement), { loading: () => <SectionSkeleton /> });
const SupportLegacyInbox = dynamic(() => import('@/components/admin/support-legacy-inbox').then(m => m.SupportLegacyInbox), { loading: () => <SectionSkeleton /> });
const AdminOverview = dynamic(() => import('@/components/admin/admin-overview').then(m => m.AdminOverview), { loading: () => <SectionSkeleton /> });
const ProductDialog = dynamic(() => import('@/components/admin/product-dialog').then(m => m.ProductDialog), { loading: () => <SectionSkeleton /> });
const BannerList = dynamic(() => import('@/components/admin/banner-list').then(m => m.BannerList), { loading: () => <SectionSkeleton /> });
const BannerDialog = dynamic(() => import('@/components/admin/banner-dialog').then(m => m.BannerDialog), { loading: () => <SectionSkeleton /> });
const CategoryList = dynamic(() => import('@/components/admin/category-list').then(m => m.CategoryList), { loading: () => <SectionSkeleton /> });
const CategoryDialog = dynamic(() => import('@/components/admin/category-dialog').then(m => m.CategoryDialog), { loading: () => <SectionSkeleton /> });
const PlatformSettings = dynamic(() => import('@/components/admin/platform-settings').then(m => m.PlatformSettings), { loading: () => <SectionSkeleton /> });
const SupportInbox = dynamic(() => import('@/components/admin/support-inbox').then(m => m.SupportInbox), { loading: () => <SectionSkeleton /> });
const ReviewModeration = dynamic(() => import('@/components/admin/review-moderation').then(m => m.ReviewModeration), { loading: () => <SectionSkeleton /> });
import { LayoutDashboard, Store, ClipboardList, Package, ImageIcon, Tags, Settings, LogOut, ArrowUpRight, ShieldCheck, Headset, Star, Users } from 'lucide-react';

type Tab = 'reviews' | 'support' | 'orders' | 'overview' | 'applications' | 'sellers' | 'catalog' | 'products' | 'banners' | 'categories' | 'settings';
const navigation: { id: Tab; label: string; icon: typeof Store; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
  { id: 'orders', label: 'Orders & fulfillment', icon: ClipboardList, group: 'Marketplace' },
  { id: 'support', label: 'Customer support', icon: Headset, group: 'Marketplace' },
  { id: 'reviews', label: 'Purchase reviews', icon: Star, group: 'Marketplace' },
  { id: 'applications', label: 'Seller applications', icon: Users, group: 'Marketplace' },
  { id: 'sellers', label: 'Seller management', icon: Store, group: 'Marketplace' },
  { id: 'catalog', label: 'Seller catalog', icon: Package, group: 'Marketplace' },
  { id: 'products', label: 'Legacy products', icon: Package, group: 'Content' },
  { id: 'banners', label: 'Banners', icon: ImageIcon, group: 'Content' },
  { id: 'categories', label: 'Categories', icon: Tags, group: 'Content' },
  { id: 'settings', label: 'Platform settings', icon: Settings, group: 'Configuration' },
];

function AdminContent() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => { const start = performance.now(); const frame = requestAnimationFrame(() => performance.measure('TreatStory admin render', { start, end: performance.now() })); return () => cancelAnimationFrame(frame); }, [params]);
  const requestedTab = params.get('tab');
  const tab: Tab = navigation.find(item => item.id === requestedTab)?.id ?? 'overview';
  const setTab = (next: Tab) => router.push(`/admin?tab=${next}`, { scroll: false });
  const [productOpen, setProductOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const descriptions: Record<Tab, string> = {
    overview: 'Your marketplace health, operational priorities and creator activity.',
    orders: 'Monitor fulfillment and help orders move forward.',
    support: 'Keep customer conversations and open questions organized.',
    reviews: 'Review verified buyer feedback and moderation requests.',
    applications: 'Review new creators requesting access to TreatStory.',
    sellers: 'Manage seller access, trials and store lifecycle.',
    catalog: 'Oversee listings published across independent stores.',
    products: 'Maintain the original TreatStory product collection.',
    banners: 'Manage the campaign banners visitors see on the storefront.',
    categories: 'Organize legacy storefront categories.',
    settings: 'Manage marketplace-wide enquiry and support settings.',
  };
  const { role, roleError, isRoleLoading } = useAccountRole();

  useEffect(() => { if (!isUserLoading && !user) router.replace('/login'); }, [isUserLoading, user, router]);

  async function signOut() {
    if (!auth) return;
    setSigningOut(true);
    try { await firebaseSignOut(auth); router.replace('/'); }
    catch { setSigningOut(false); }
  }

  if (isUserLoading || !user || isRoleLoading) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><DashboardShellSkeleton title="Control center" /></div>;
  if (roleError) return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell py-10"><h1 className="text-xl font-semibold">Unable to verify administrator access</h1><p className="mt-3 text-sm text-muted-foreground">Check your account access and reload. Access has not been granted.</p></main></div>;
  if (role !== 'admin') return <div className="min-h-screen bg-[#f7f5f1]"><Header /><main className="section-shell mx-auto max-w-xl py-20"><ShieldCheck className="h-8 w-8 text-[#a68a64]" /><h1 className="mt-5 text-3xl font-medium">Administrator access required</h1><p className="mt-3 text-sm text-muted-foreground">This workspace is restricted to verified TreatStory administrators.</p><Link href="/account" className="editorial-button mt-7">Return to account</Link></main></div>;

  return <div className="min-h-screen bg-[#f7f5f1]"><Header />
    <div className="section-shell grid min-w-0 gap-5 py-5 sm:gap-7 sm:py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:py-11">
      <aside className="min-w-0 space-y-3 lg:space-y-5">
        <div className="rounded-2xl border border-[#e6dfd5] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#29251f] text-[#f5eadb]"><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9a8061]">Admin workspace</p><h2 className="mt-0.5 truncate text-base font-semibold text-[#29251f]">TreatStory HQ</h2></div></div>
          <div className="mt-4 flex items-center gap-2 border-t border-[#f0ece6] pt-3 text-xs text-[#63594c]"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />Administrator verified</div>
          <p className="mt-1 truncate text-[11px] text-[#87796a]" title={user.email || ''}>{user.email}</p>
        </div>
        <div className="lg:hidden">
          <label htmlFor="admin-mobile-section" className="mb-1.5 block text-xs font-semibold text-[#756453]">Manage your workspace</label>
          <Select value={tab} onValueChange={value => setTab(value as Tab)}>
            <SelectTrigger id="admin-mobile-section" aria-label="Admin workspace section" className="h-12 rounded-xl bg-white"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" sideOffset={6} className="max-h-[min(27rem,65dvh)]">{['Workspace', 'Marketplace', 'Content', 'Configuration'].map(group => <SelectGroup key={group}><SelectLabel className="text-[10px] uppercase tracking-wider text-[#9a8061]">{group}</SelectLabel>{navigation.filter(item => item.group === group).map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup>)}</SelectContent>
          </Select>
        </div>
        <nav aria-label="Admin navigation" className="hidden lg:block lg:space-y-5">
          {['Workspace', 'Marketplace', 'Content', 'Configuration'].map(group => <div key={group}><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a68a64]">{group}</p><div className="flex flex-col gap-1">{navigation.filter(item => item.group === group).map(item => <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a98d69] ${tab === item.id ? 'bg-[#eae2d7] font-semibold text-[#29251f]' : 'text-[#756a5d] hover:bg-[#eee8e0]'}`}><item.icon className="h-4 w-4 shrink-0" /><span className="min-w-0">{item.label}</span></button>)}</div></div>)}
        </nav>
        <Button variant="outline" className="hidden w-full justify-start rounded-xl border-[#e6dfd5] bg-white lg:flex" onClick={signOut} disabled={signingOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
      </aside>
      <main className="min-w-0 space-y-5 sm:space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7ded2] pb-5 sm:pb-7">
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a68a64]">Admin studio / {tab}</p><h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-[#29251f] sm:text-[36px]">{navigation.find(item => item.id === tab)?.label}</h1><p className="mt-1 max-w-2xl text-sm text-[#817568]">{descriptions[tab]}</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e6dfd5] bg-white px-4 text-xs font-semibold text-[#594b3e] hover:bg-[#f8f3ec]">View marketplace <ArrowUpRight className="h-4 w-4" /></Link>{tab === 'products' && <ProductDialog isOpen={productOpen} onOpenChange={setProductOpen}><Button className="rounded-xl" onClick={() => setProductOpen(true)}>Add product</Button></ProductDialog>}{tab === 'banners' && <BannerDialog isOpen={bannerOpen} onOpenChange={setBannerOpen}><Button className="rounded-xl" onClick={() => setBannerOpen(true)}>Add banner</Button></BannerDialog>}{tab === 'categories' && <CategoryDialog isOpen={categoryOpen} onOpenChange={setCategoryOpen}><Button className="rounded-xl" onClick={() => setCategoryOpen(true)}>Add category</Button></CategoryDialog>}</div>
        </div>
        {tab === 'overview' && <AdminOverview navigate={next => setTab(next === 'sellers' ? 'applications' : next as Tab)} />}
        {tab === 'orders' && <OrderManagement mode="admin" />}
        {tab === 'support' && (process.env.NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' ? <SupportInbox /> : <SupportLegacyInbox />)}
        {tab === 'reviews' && <ReviewModeration />}
        {tab === 'applications' && <SellerApplications />}
        {tab === 'sellers' && <SellerManagement />}
        {tab === 'catalog' && <MarketplaceCatalog />}
        {tab === 'products' && <ProductList />}
        {tab === 'banners' && <BannerList />}
        {tab === 'categories' && <CategoryList />}
        {tab === 'settings' && <PlatformSettings />}
      </main>
    </div>
  </div>;
}

export default function AdminPage() { return <Suspense fallback={<SectionSkeleton />}><AdminContent /></Suspense>; }
