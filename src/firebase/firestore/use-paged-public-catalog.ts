"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { usePublicCatalog } from "./use-public-catalog";

/** One bounded live first page; older pages are fetched only on demand. Never use for private data. */
export function usePagedPublicCatalog<T>(
  name: "products" | "marketplace_products",
  previewLimit?: number,
) {
  const db = useFirestore();
  const { user } = useUser();
  const size = previewLimit || 24;
  const constraints = useCallback(
    () =>
      name === "marketplace_products"
        ? [where("status", "==", "published")]
        : [],
    [name],
  );
  const ref = useMemoFirebase(
    () =>
      db
        ? query(
            collection(db, name),
            ...constraints(),
            orderBy(documentId()),
            limit(size),
          )
        : null,
    [db, name, constraints, size],
  );
  const first = usePublicCatalog<T>(ref);
  const [pages, setPages] = useState<Array<T & { id: string }>>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [ended, setEnded] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [pageError, setPageError] = useState<Error | null>(null);
  const busy = useRef(false),
    generation = useRef(0);
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
  }, [name, size, user?.uid]);
  const hasMore =
    !previewLimit && !ended && (!!cursor || first.data?.length === size);
  const loadMore = useCallback(async () => {
    if (!db || busy.current || !hasMore) return;
    const after = cursor || first.data?.at(-1)?.id;
    if (!after) return;
    busy.current = true;
    setLoadingMore(true);
    setPageError(null);
    const version = generation.current;
    try {
      const snapshot = await getDocs(
        query(
          collection(db, name),
          ...constraints(),
          orderBy(documentId()),
          startAfter(after),
          limit(size),
        ),
      );
      if (version !== generation.current) return;
      const rows = snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id }) as T & { id: string },
      );
      setPages((previous) => [...previous, ...rows]);
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
  }, [db, name, constraints, size, cursor, first.data, hasMore]);
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
