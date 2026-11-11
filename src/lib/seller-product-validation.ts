import { z } from "zod";

// This module is safe to import on client and server: no credentials,
// Admin SDK or server-only dependencies.
const unit = z.enum(["g", "kg", "ml", "l", "pieces"]);
const price = z.number().finite().min(0).max(10000000);
/**
 * Product photos are rendered as browser-side, unoptimized <img> elements for
 * hosts outside the trusted optimization list (see canOptimizeImage).
 * Allow ordinary public HTTPS photo URLs, including WordPress photo hosts,
 * without letting sellers supply local, IP-literal, credentialed or custom-port
 * addresses. Do not use this predicate as authorization for server-side fetches.
 */
export function isPublicProductImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const parts = host.split(".");
    const blocked = new Set([
      "localhost", "local", "internal", "lan", "home", "test",
      "invalid", "example", "onion", "arpa",
    ]);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      parts.length >= 2 &&
      !blocked.has(parts.at(-1) || "") &&
      parts.every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) &&
      /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(parts.at(-1) || "")
    );
  } catch {
    return false;
  }
}
const image = z
  .string()
  .max(2048)
  .url()
  .refine(isPublicProductImageUrl, "Enter a public HTTPS image URL.");
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
    preparationDays: z.number().int().min(0).max(365),
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
    // null is an explicit version marker for a legacy record without an
    // updatedAt field; a missing marker must never allow a blind overwrite.
    expectedUpdatedAt: z.number().finite().nonnegative().nullable().optional(),
    product: sellerProductSchema,
  })
  .strict();

/** Only field labels and public form guidance leave the server: never echo submitted values. */
export function invalidProductMessage(issues: Array<{ path: PropertyKey[] }>) {
  const labels: Record<string, string> = {
    sellerId: "seller account",
    name: "product name (2–120 characters)",
    description: "description (up to 2,000 characters)",
    category: "category",
    price: "selling price",
    imageUrls: "product photo links (public HTTPS addresses only; no localhost or private network URLs)",
    showPrice: "price visibility",
    availability: "availability",
    stockQuantity: "stock quantity",
    preparationDays: "preparation days (0–365)",
    minimumOrderQuantity: "minimum order quantity (1–99)",
    weightOptions: "size, weight, price or size-specific stock",
    customizationOptions: "customization prompts",
    advancePaymentRequired: "advance payment setting",
    careInstructions: "care instructions",
    ingredients: "ingredients",
    allergens: "allergen labels",
    dietaryTags: "dietary labels",
    shelfLifeDays: "shelf life (0–365)",
    storageInstructions: "storage instructions",
    status: "listing status",
    productId: "product reference",
    expectedUpdatedAt: "editing version",
  };
  const fields = [...new Set(issues.map(issue => {
    const path = issue.path.map(String);
    const key = path[0] === "product" ? path[1] : path[0];
    return labels[key] || "product details";
  }))].slice(0, 4);
  return "Check " + fields.join(", ") + " before saving.";
}
