import type { NextRequest } from "next/server";
import { getServerFirebase, safeResponse } from "@/lib/server/firebase-admin";
import { normalizeProductSku } from "@/lib/product-sku";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous exact lookup, with no draft or seller-private data exposed. */
export async function GET(request: NextRequest) {
  const sku = normalizeProductSku(request.nextUrl.searchParams.get("sku") || "");
  const headers = { "Cache-Control": "no-store" };
  if (!sku) return Response.json({ error: "Enter a valid TreatStory product code." }, { status: 400, headers });
  try {
    const { db } = getServerFirebase();
    const claim = await db.collection("product_skus").doc(sku).get();
    const productId = claim.data()?.productId;
    if (typeof productId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(productId))
      return Response.json({ error: "No published product matches this code." }, { status: 404, headers });
    const product = await db.collection("marketplace_products").doc(productId).get();
    if (!product.exists || product.data()?.sku !== sku || product.data()?.status !== "published")
      return Response.json({ error: "No published product matches this code." }, { status: 404, headers });
    return Response.json({ sku, productId }, { headers });
  } catch(error) { return safeResponse(error); }
}
