'use client';

import { useEffect } from 'react';

/** Reset a new purchase destination without inheriting the previous page's scroll. */
export function useScrollToTop(destination: string) {
  useEffect(() => { window.scrollTo({top: 0, left: 0, behavior: 'instant'}); }, [destination]);
}
