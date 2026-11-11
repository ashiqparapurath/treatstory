import type { NextRequest } from "next/server";
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from "@/lib/server/firebase-admin";
import { readJsonBody } from "@/lib/server/request-body";
import {
  saveProductRequest,
  saveSellerProduct,
} from "@/lib/server/seller-product";
/** Only field labels and public form guidance leave the server: never echo submitted values. */
function invalidProductMessage(issues: Array<{ path: PropertyKey[] }>) {
  const labels: Record<string, string> = {
    sellerId: "seller account",
    name: "product name (2–120 characters)",
    description: "description (up to 2,000 characters)",
    category: "category",
    price: "selling price",
    imageUrls: "product photo links (supported HTTPS hosts only)",
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
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const parsed = saveProductRequest.safeParse(
      await readJsonBody(request, 64000),
    );
    if (!parsed.success)
      throw new ApiError(
        400,
        invalidProductMessage(parsed.error.issues),
      );
    return Response.json(await saveSellerProduct(db, uid, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeResponse(error);
  }
}
