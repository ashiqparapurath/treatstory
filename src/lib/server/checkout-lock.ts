import type { Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/firebase-admin";

// A local queue reduces repeated transaction lock upgrades on the same stock document.
// Firestore transactions remain authoritative across instances; this is not a distributed lock.
const queues = new WeakMap<
  Firestore,
  Map<string, { tail: Promise<void>; waiting: number }>
>();
export async function withCheckoutKeys<T>(
  db: Firestore,
  keys: string[],
  action: () => Promise<T>,
): Promise<T> {
  let map = queues.get(db);
  if (!map) {
    map = new Map();
    queues.set(db, map);
  }
  const held: Array<() => void> = [];
  try {
    for (const key of [...new Set(keys)].sort()) {
      const entry = map.get(key) || { tail: Promise.resolve(), waiting: 0 };
      if (entry.waiting >= 256 || map.size >= 5000)
        throw new ApiError(429, "This item is busy. Please try again shortly.");
      const previous = entry.tail;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      entry.tail = previous.then(() => gate);
      entry.waiting++;
      map.set(key, entry);
      held.push(() => {
        entry.waiting--;
        release();
        if (!entry.waiting && map!.get(key) === entry) map!.delete(key);
      });
      await previous;
    }
    return await action();
  } finally {
    for (const release of held.reverse()) release();
  }
}
