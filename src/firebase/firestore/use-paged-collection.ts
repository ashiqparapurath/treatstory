"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Query,
} from "firebase/firestore";
import { useCollection } from "./use-collection";
import { useUser, useMemoFirebase } from "@/firebase/provider";
/** Private pages never share the public catalog cache. Only the first page stays live. */
export function usePagedCollection<T>(source: Query | null, size = 50) {
  const { user } = useUser();
  const firstQuery = useMemoFirebase(
    () => (source ? query(source, orderBy(documentId()), limit(size)) : null),
    [source, size, user?.uid],
  );
  const first = useCollection<T>(firstQuery);
  const [pages, setPages] = useState<Array<T & { id: string }>>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [ended, setEnded] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [pageError, setPageError] = useState<Error | null>(null);
  const generation = useRef(0),
    busy = useRef(false);
  useEffect(() => {
    generation.current++;
    setPages([]);
    setCursor(null);
    setEnded(false);
    setLoadingMore(false);
    setPageError(null);
    busy.current = false;
    return () => {
      generation.current++;
    };
  }, [source, user?.uid, size]);
  const hasMore = !ended && (!!cursor || first.data?.length === size);
  const loadMore = useCallback(async () => {
    if (!source || busy.current || !hasMore) return;
    const after = cursor || first.data?.at(-1)?.id;
    if (!after) return;
    const version = generation.current;
    busy.current = true;
    setLoadingMore(true);
    setPageError(null);
    try {
      const snapshot = await getDocs(
        query(source, orderBy(documentId()), startAfter(after), limit(size)),
      );
      if (version !== generation.current) return;
      const rows = snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as T & { id: string },
      );
      setPages((old) => [...old, ...rows]);
      if (rows.length) setCursor(rows.at(-1)!.id);
      setEnded(rows.length < size);
    } catch (error) {
      if (version === generation.current) setPageError(error as Error);
    } finally {
      if (version === generation.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [source, size, hasMore, cursor, first.data]);
  const data = useMemo(() => {
    if (!first.data) return null;
    const seen = new Set<string>();
    return [...first.data, ...pages].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [first.data, pages]);
  return {
    ...first,
    data,
    error: first.error || pageError,
    hasMore,
    loadingMore,
    loadMore,
    retry: () => {
      setPageError(null);
      first.retry();
    },
  };
}
