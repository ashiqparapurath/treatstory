'use client';
import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { MobileRole } from '@/lib/mobile-navigation';

export type MobileAttention = { orders: boolean; applications: boolean };
const empty: MobileAttention = { orders: false, applications: false };

/**
 * Dot indicates actionable pending work, not the number of notifications.
 * Seller: own pending orders. Admin: pending orders or applications.
 * Customer: no indicator until unread receipt state is available.
 * Queries are scoped by authenticated role and run only on narrow screens.
 */
export function useMobileAttention(uid: string | null, role: MobileRole, roleReady: boolean): MobileAttention {
  const db = useFirestore();
  const [mobile, setMobile] = useState(false);
  const [state, setState] = useState<{ uid: string; role: MobileRole; value: MobileAttention } | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile || !db || !uid || !roleReady || (role !== 'admin' && role !== 'seller')) {
      setState(null);
      return;
    }
    let active = true;
    const values: MobileAttention = { ...empty };
    const apply = (type: keyof MobileAttention, flag: boolean) => {
      if (!active) return;
      values[type] = flag;
      setState({ uid, role, value: { ...values } });
    };
    const unsubscribe = [];
    if (role === 'seller') {
      unsubscribe.push(onSnapshot(
        query(collection(db, 'seller_orders'), where('sellerId', '==', uid), where('status', '==', 'pending'), limit(1)),
        snapshot => apply('orders', !snapshot.empty),
        () => apply('orders', false)
      ));
    }
    if (role === 'admin') {
      unsubscribe.push(onSnapshot(
        query(collection(db, 'seller_applications'), where('status', '==', 'pending'), limit(1)),
        snapshot => apply('applications', !snapshot.empty),
        () => apply('applications', false)
      ));
      unsubscribe.push(onSnapshot(
        query(collection(db, 'seller_orders'), where('status', '==', 'pending'), limit(1)),
        snapshot => apply('orders', !snapshot.empty),
        () => apply('orders', false)
      ));
    }
    return () => { active = false; unsubscribe.forEach(stop => stop()); };
  }, [mobile, db, uid, role, roleReady]);

  if (!mobile || !uid || !roleReady || (role !== 'seller' && role !== 'admin')) return empty;
  return state?.uid === uid && state.role === role ? state.value : empty;
}
