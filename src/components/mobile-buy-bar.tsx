'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';

/** Float only while the original purchase controls are still below the viewport. */
export function MobileBuyBar({ target, enabled, resetKey, children }: {
  target: RefObject<HTMLElement>; enabled: boolean; resetKey: string; children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const element = target.current;
    if (!enabled || !element) return;
    // Measure immediately: an already-below-the-fold target might never
    // trigger a useful initial intersection callback on mobile WebKit.
    const update = () => {
      const rect = element.getBoundingClientRect();
      setVisible(rect.top > window.innerHeight - 170 && rect.bottom > 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(update, { rootMargin:'0px 0px -170px 0px', threshold:0 });
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [target, enabled, resetKey]);
  if (!visible) return null;
  return <aside aria-label="Quick purchase" className="fixed inset-x-3 bottom-[calc(82px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-[23px] border border-[#e8ddd1] bg-[#fffdfa]/95 px-3.5 py-3 shadow-[0_14px_38px_rgba(44,27,16,0.20)] backdrop-blur-xl md:hidden">{children}</aside>;
}
