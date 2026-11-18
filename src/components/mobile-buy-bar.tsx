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
    if (typeof IntersectionObserver === 'undefined') {
      const update = () => setVisible(element.getBoundingClientRect().top >= window.innerHeight - 112);
      update(); window.addEventListener('scroll', update, {passive:true}); window.addEventListener('resize', update);
      return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top >= (entry.rootBounds?.bottom ?? window.innerHeight - 112));
    }, {rootMargin:'0px 0px -112px 0px', threshold:0});
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, enabled, resetKey]);
  if (!visible) return null;
  return <aside aria-label="Quick purchase" className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-[#e8e0d5] bg-[#fffefa]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-8px_28px_rgba(35,29,23,0.1)] backdrop-blur-xl md:hidden">{children}</aside>;
}
