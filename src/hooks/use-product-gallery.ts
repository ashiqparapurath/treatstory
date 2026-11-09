'use client';

import { useRef, useState, type TouchEvent, type MouseEvent } from 'react';

/** Accessible gallery control: swipe on touchscreens; buttons on larger screens. */
export function useProductGallery(length: number) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const touchX = useRef<number | null>(null);
  const swipeHandled = useRef(false);
  const index = Math.min(active, Math.max(0, length - 1));
  function move(delta: number) {
    if (length <= 1) return;
    setDirection(delta > 0 ? 'next' : 'previous');
    setActive((current) => ((Math.min(current, length - 1) + delta) % length + length) % length);
  }
  function select(n: number) {
    setDirection(n >= index ? 'next' : 'previous');
    setActive(n);
  }
  function onTouchStart(event: TouchEvent) {
    touchX.current = event.touches[0]?.clientX ?? null;
    swipeHandled.current = false;
  }
  function onTouchEnd(event: TouchEvent) {
    const end = event.changedTouches[0]?.clientX;
    if (length <= 1 || touchX.current === null || end === undefined) return;
    const delta = end - touchX.current;
    touchX.current = null;
    if (Math.abs(delta) < 42) return;
    swipeHandled.current = true;
    move(delta < 0 ? 1 : -1);
    if (event.cancelable) event.preventDefault(); // Don't open the product while swiping its card.
  }
  function onClickCapture(event: MouseEvent) {
    if (swipeHandled.current) {
      event.preventDefault();
      event.stopPropagation();
      swipeHandled.current = false;
    }
  }
  return { index, direction, move, select, onTouchStart, onTouchEnd, onClickCapture };
}
