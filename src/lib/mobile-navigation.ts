export type MobileRole = 'admin' | 'seller' | 'customer' | null;

export type ProfileNavigationState = {
  authenticated: boolean;
  authLoading: boolean;
  role: MobileRole;
  roleLoading: boolean;
  roleError: boolean;
};

/** Profile should never guess a buyer role while auth or role lookups are pending. */
export function mobileProfileHref(state: ProfileNavigationState): string {
  if (state.authLoading) return '/dashboard';
  if (!state.authenticated) return '/login';
  if (state.roleLoading || state.roleError || !state.role) return '/dashboard';
  if (state.role === 'admin') return '/admin';
  if (state.role === 'seller') return '/seller/dashboard';
  return '/account';
}

export function isMobileProfilePath(pathname: string, role: MobileRole): boolean {
  if (pathname === '/dashboard' || pathname === '/login') return true;
  if (role === 'admin') return pathname === '/admin';
  if (role === 'seller') return pathname === '/seller/dashboard';
  if (role === 'customer') return pathname === '/account';
  return false;
}

export function mobileNavIsActive(pathname: string, nav: 'shop'): boolean {
  return nav === 'shop' && (pathname === '/products' || pathname.startsWith('/product/') ||
    pathname.startsWith('/shop/') || pathname === '/new-arrivals');
}
