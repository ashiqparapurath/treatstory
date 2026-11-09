import { z } from "zod";
import { withCheckoutKeys } from "@/lib/server/checkout-lock";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { ApiError } from "@/lib/server/firebase-admin";
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
  await withCheckoutKeys(db, ["stock:" + ref.id], () =>
    db.runTransaction(async (tx) => {
      const [seller, existing, quota] = await Promise.all([
        tx.get(db.doc("sellers/" + uid)),
        tx.get(ref),
        tx.get(
          db.doc(
            "product_write_limits/" +
              uid +
              "_" +
              Math.floor(Date.now() / 3600000),
          ),
        ),
      ]);
      const store = seller.data();
      if (
        store?.status !== "active" ||
        !store.accessEndsAt?.toMillis ||
        store.accessEndsAt.toMillis() <= Date.now()
      )
        throw new ApiError(
          403,
          "Active seller access is required to save products.",
        );
      if (input.productId) {
        if (!existing.exists)
          throw new ApiError(404, "This product no longer exists.");
        if (existing.data()?.sellerId !== uid)
          throw new ApiError(403, "You can only manage your own products.");
        if (
          input.expectedUpdatedAt === undefined ||
          existing.data()?.updatedAt?.toMillis?.() !== input.expectedUpdatedAt
        )
          throw new ApiError(
            409,
            "This product changed since you opened it. Close the editor and reopen it to review current stock before saving.",
          );
      }
      if ((quota.data()?.count || 0) >= 120)
        throw new ApiError(
          429,
          "Product update limit reached. Please try again later.",
        );
      const now = Timestamp.now();
      tx.set(ref, {
        ...input.product,
        createdAt: existing.data()?.createdAt || now,
        updatedAt: now,
      });
      tx.set(quota.ref, {
        sellerId: uid,
        count: (quota.data()?.count || 0) + 1,
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400000),
      });
    }),
  );
  return { productId: ref.id };
}
