import {
  BookOpen, ClipboardList, FileText, Heart, HelpCircle, Home,
  Package, Settings, ShieldCheck, ShoppingBag, Store, Users,
  type LucideIcon,
} from 'lucide-react';
import type { MobileRole } from '@/lib/mobile-navigation';

export type MenuLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  attention?: boolean;
};

export function morePageSections(
  role: MobileRole,
  authenticated: boolean,
  attention: { orders: boolean; applications: boolean },
): { account: MenuLink[]; marketplace: MenuLink[]; information: MenuLink[] } {
  const account: MenuLink[] = authenticated
    ? [
      { label: 'Account settings', description: 'Personal details, delivery, notifications and privacy', href: '/account/settings', icon: Settings },
    ]
    : [];

  const marketplace: MenuLink[] = [];
  if (role === 'admin' && authenticated) {
    marketplace.push(
      { label: 'Admin dashboard', description: 'Manage the marketplace', href: '/admin', icon: Home, attention: attention.orders || attention.applications },
      { label: 'Seller applications', description: 'Review pending creator requests', href: '/admin?tab=applications', icon: Users, attention: attention.applications },
      { label: 'Marketplace orders', description: 'Review order requests', href: '/admin?tab=orders', icon: Package, attention: attention.orders },
      { label: 'Support inbox', description: 'Manage support requests', href: '/admin?tab=support', icon: HelpCircle },
    );
  } else if (role === 'seller' && authenticated) {
    marketplace.push(
      { label: 'Seller dashboard', description: 'Your creator workspace', href: '/seller/dashboard', icon: Store, attention: attention.orders },
      { label: 'Seller orders', description: 'Review and manage new orders', href: '/seller/dashboard?section=orders', icon: ClipboardList, attention: attention.orders },
      { label: 'My products', description: 'Create and manage your listings', href: '/seller/dashboard?section=products', icon: Package },
      { label: 'Store settings', description: 'Your storefront and delivery options', href: '/seller/dashboard?section=store', icon: Settings },
    );
  } else if (role === 'customer' || !authenticated) {
    marketplace.push({ label: 'Become a seller', description: 'Join TreatStory as a creator', href: '/become-a-seller', icon: Store });
  }

  if (authenticated) {
    marketplace.push(
      { label: 'My purchases', description: 'Track orders you placed', href: '/orders', icon: ShoppingBag },
      { label: 'Saved items', description: 'Your wishlist', href: '/favorites', icon: Heart },
    );
  }

  const information: MenuLink[] = [
    { label: 'Help & contact', description: 'Get assistance from TreatStory', href: '/support', icon: HelpCircle },
    { label: 'Our story', description: 'About TreatStory', href: '/about', icon: BookOpen },
    { label: 'Terms of service', description: 'Marketplace terms and conditions', href: '/terms-of-service', icon: FileText },
    { label: 'Privacy policy', description: 'How information is handled', href: '/privacy-policy', icon: ShieldCheck },
  ];
  return { account, marketplace, information };
}

