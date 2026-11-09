import type { Metadata } from "next";
import { firestoreDocumentId } from "@/lib/document-id";
import {
  productSocialMetadata,
  siteSocialMetadata,
} from "@/lib/social-metadata";
/** Fetch current public product fields per request. No data cache or ISR. */
async function readProductSocialMetadata(rawId: string): Promise<Metadata> {
  let id = rawId;
  for (let n = 0; n < 2; n++) {
    try {
      const next = decodeURIComponent(id);
      if (next === id) break;
      id = next;
    } catch {
      break;
    }
  }
  const sellerFirst = id.startsWith("seller:"),
    productId = sellerFirst ? id.slice(7) : id;
  if (!firestoreDocumentId().safeParse(productId).success)
    return productSocialMetadata(null, id, sellerFirst);
  try {
    // Loading the optional server SDK can itself fail in a deployment.
    // Keep module initialization inside the fallback boundary too.
    const { getServerFirebase } = await import("@/lib/server/firebase-admin");
    const { db } = getServerFirebase();
    let seller = sellerFirst;
    let snapshot = await db
      .collection(seller ? "marketplace_products" : "products")
      .doc(productId)
      .get();
    if (!snapshot.exists) {
      seller = !seller;
      snapshot = await db
        .collection(seller ? "marketplace_products" : "products")
        .doc(productId)
        .get();
    }
    if (!snapshot.exists) return productSocialMetadata(null, id, seller);
    return productSocialMetadata(snapshot.data()!, id, seller);
  } catch {
    return siteSocialMetadata();
  }
}

/** Optional preview enrichment must never hold the shopping page behind SDK retries.
 * A timeout returns a generic preview, never previously fetched product data.
 */
export async function getProductSocialMetadata(
  rawId: string,
): Promise<Metadata> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readProductSocialMetadata(rawId),
      new Promise<Metadata>((resolve) => {
        timer = setTimeout(() => resolve(siteSocialMetadata()), 2500);
      }),
    ]);
  } catch {
    return siteSocialMetadata();
  } finally {
    clearTimeout(timer);
  }
}
