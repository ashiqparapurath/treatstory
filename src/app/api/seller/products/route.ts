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
import { invalidProductMessage } from "@/lib/seller-product-validation";
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
