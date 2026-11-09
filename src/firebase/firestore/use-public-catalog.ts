'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { onSnapshot, queryEqual, type Query, type DocumentData } from 'firebase/firestore';
import { useUser } from '@/firebase/provider';

// Public browsing only. Never use this cache for roles, orders or customer data.
// Scope even public results to the current account and revalidate on remount.
type Snapshot = { data: (DocumentData & { id: string })[] | null; isLoading: boolean; error: Error | null };
const empty: Snapshot = { data: null, isLoading: false, error: null };
const loading: Snapshot = { data: null, isLoading: true, error: null };
type Entry = { query: Query; scope: string; snapshot: Snapshot; listeners: Set<() => void>; stop?: () => void; expiry?: ReturnType<typeof setTimeout> };
const entries = new Set<Entry>();
function emit(entry: Entry) { entry.listeners.forEach(listener => listener()); }
function start(entry: Entry) {
  entry.stop = onSnapshot(entry.query, snapshot => {
    entry.snapshot = { data: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })), isLoading: false, error: null };
    emit(entry);
  }, error => {
    entry.snapshot = { data: null, isLoading: false, error };
    emit(entry);
  });
}
export function usePublicCatalog<T>(target: Query<DocumentData> | null | undefined) {
  const { user } = useUser();
  const scope = user?.uid ?? 'guest';
  const entry = useMemo(() => {
    if (!target) return null;
    for (const existing of entries) {
      if (existing.scope === scope && queryEqual(existing.query, target)) return existing;
    }
    const created: Entry = { query: target, scope, snapshot: loading, listeners: new Set<() => void>() };
    entries.add(created);
    // Also expire entries from abandoned renders. Subscribing cancels this timer.
    created.expiry = setTimeout(() => entries.delete(created), 30_000);
    return created;
  }, [target, scope]);
  const subscribe = useCallback((listener: () => void) => {
    if (!entry) return () => {};
    entries.add(entry);
    clearTimeout(entry.expiry);
    entry.listeners.add(listener);
    if (!entry.stop) start(entry);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size) return;
      entry.stop?.();
      entry.stop = undefined;
      entry.expiry = setTimeout(() => entries.delete(entry), 30_000);
    };
  }, [entry]);
  // The SDK can initialize before a deferred Suspense boundary hydrates. Its server
  // snapshot must still describe the original SDK-less HTML, never the new query.
  const snapshot = useSyncExternalStore(subscribe, () => entry?.snapshot ?? empty, () => empty);
  const retry = useCallback(() => {
    if (!entry) return;
    entry.stop?.();
    entry.snapshot = loading;
    emit(entry);
    start(entry);
  }, [entry]);
  return { ...snapshot, data: snapshot.data as (T & { id: string })[] | null, retry };
}
