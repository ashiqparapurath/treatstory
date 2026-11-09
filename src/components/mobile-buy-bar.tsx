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
      const update = () => setVisible(element.getBoundingClientRect().top >= window.innerHeight - 148);
      update(); window.addEventListener('scroll', update, {passive:true}); window.addEventListener('resize', update);
      return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top >= (entry.rootBounds?.bottom ?? window.innerHeight - 148));
    }, {rootMargin:'0px 0px -148px 0px', threshold:0});
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, enabled, resetKey]);
  if (!visible) return null;
  return <aside aria-label="Quick purchase" className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-2xl border border-[#e1d7c8] bg-[#fcfaf6]/95 p-3 shadow-[0_8px_32px_rgba(35,29,23,0.18)] backdrop-blur-xl md:hidden">{children}</aside>;
}
