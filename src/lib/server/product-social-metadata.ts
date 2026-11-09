import type { Metadata } from "next";
import { getServerFirebase } from "@/lib/server/firebase-admin";
import { firestoreDocumentId } from "@/lib/document-id";
import {
  productSocialMetadata,
  siteSocialMetadata,
} from "@/lib/social-metadata";
/** Fetch current public product fields per request. No data cache or ISR. */
export async function getProductSocialMetadata(
  rawId: string,
): Promise<Metadata> {
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
