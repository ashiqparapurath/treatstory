import { z } from "zod";
import { withCheckoutKeys } from "@/lib/server/checkout-lock";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/firebase-admin";
import { randomBytes } from "node:crypto";
import { SKU_ALPHABET } from "@/lib/product-sku";

class SkuCollision extends Error {}
function createSku() {
  return "TS-" + Array.from(randomBytes(8), b => SKU_ALPHABET[b & 31]).join("");
}
const unit = z.enum(["g", "kg", "ml", "l", "pieces"]);
const price = z.number().finite().min(0).max(10000000);
const image = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "res.cloudinary.com",
        "firebasestorage.googleapis.com",
        "images.unsplash.com",
        "placehold.co",
        "picsum.photos",
        "lh3.googleusercontent.com",
      ].includes(url.hostname)
    );
  }, "Use a supported image host.");
export const sellerProductSchema = z
  .object({
    sellerId: z.string().min(1).max(128),
    name: z.string().trim().min(2).max(120),
    description: z.string().max(2000),
    category: z.string().trim().min(1).max(80),
    price,
    imageUrls: z.array(image).max(10),
    showPrice: z.boolean(),
    availability: z.enum(["available", "unavailable", "made-to-order"]),
    stockQuantity: z.number().int().min(0).max(1000000),
    preparationDays: z.number().int().min(0).max(90),
    minimumOrderQuantity: z.number().int().min(1).max(99),
    weightOptions: z
      .array(
        z
          .object({
            value: z.number().positive().max(100000),
            unit,
            price,
            stockQuantity: z.number().int().min(0).max(1000000).optional(),
          })
          .strict(),
      )
      .max(8),
    customizationOptions: z.array(z.string().min(1).max(80)).max(6),
    advancePaymentRequired: z.boolean(),
    careInstructions: z.string().max(500),
    ingredients: z.string().max(1000),
    allergens: z.array(z.string().min(1).max(40)).max(12),
    dietaryTags: z.array(z.string().min(1).max(40)).max(12),
    shelfLifeDays: z.number().int().min(0).max(365).optional(),
    storageInstructions: z.string().max(500),
    status: z.enum(["draft", "published"]),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.weightOptions.map((w) => w.value + ":" + w.unit)).size ===
      p.weightOptions.length,
    "Each size must be unique.",
  );
export const saveProductRequest = z
  .object({
    productId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    expectedUpdatedAt: z.number().finite().nonnegative().optional(),
    product: sellerProductSchema,
  })
  .strict();
export async function saveSellerProduct(
  db: Firestore,
  uid: string,
  input: z.infer<typeof saveProductRequest>,
) {
  if (input.product.sellerId !== uid)
    throw new ApiError(403, "You can only manage your own products.");
  const ref = input.productId
    ? db.collection("marketplace_products").doc(input.productId)
    : db.collection("marketplace_products").doc();
  const quotaRef = db.doc("product_write_limits/" + uid + "_" + Math.floor(Date.now() / 3600000));

  // Every SKU is reserved atomically and never reused after a product is deleted.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = createSku();
    const reservation = db.collection("product_skus").doc(candidate);
    try {
      let assignedSku = "";
      await withCheckoutKeys(db, ["stock:" + ref.id], () =>
        db.runTransaction(async tx => {
          const [seller, existing, quota] = await Promise.all([
            tx.get(db.doc("sellers/" + uid)), tx.get(ref), tx.get(quotaRef),
          ]);
          const store = seller.data();
          if (store?.status !== "active" || !store.accessEndsAt?.toMillis ||
              store.accessEndsAt.toMillis() <= Date.now())
            throw new ApiError(403, "Active seller access is required to save products.");
          if (input.productId) {
            if (!existing.exists) throw new ApiError(404, "This product no longer exists.");
            if (existing.data()?.sellerId !== uid)
              throw new ApiError(403, "You can only manage your own products.");
            if (input.expectedUpdatedAt === undefined ||
                existing.data()?.updatedAt?.toMillis?.() !== input.expectedUpdatedAt)
              throw new ApiError(409, "This product changed since you opened it. Close the editor and reopen it to review current stock before saving.");
          }
          if ((quota.data()?.count || 0) >= 120)
            throw new ApiError(429, "Product update limit reached. Please try again later.");

          const oldSku = existing.data()?.sku;
          let sku = typeof oldSku === "string" && oldSku ? oldSku : "";
          if (!sku) {
            const taken = await tx.get(reservation);
            if (taken.exists) throw new SkuCollision();
            sku = candidate;
          }
          const now = Timestamp.now();
          tx.set(ref, { ...input.product, sku, createdAt: existing.data()?.createdAt || now, updatedAt: now });
          if (!oldSku) tx.create(reservation, { productId: ref.id, createdAt: now });
          tx.set(quota.ref, {
            sellerId: uid,
            count: (quota.data()?.count || 0) + 1,
            expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400000),
          });
          assignedSku = sku;
        }),
      );
      return { productId: ref.id, sku: assignedSku };
    } catch (error) {
      if (error instanceof SkuCollision) continue;
      throw error;
    }
  }
  throw new ApiError(503, "Could not reserve a unique product code. Please retry.");
}
