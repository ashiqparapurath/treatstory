import type { NextRequest } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import {
  verifiedUser,
  ApiError,
  safeResponse,
} from "@/lib/server/firebase-admin";
import { readJsonBody } from "@/lib/server/request-body";
import { suggestedAddress } from "@/lib/location-address";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const { uid, db } = await verifiedUser(request);
    const parsed = schema.safeParse(await readJsonBody(request, 1000));
    if (!parsed.success)
      throw new ApiError(
        400,
        "Could not read your location. Enter your address manually.",
      );
    // Distributed single-request spacing protects the public provider across app instances.
    // Only request counters/times are stored, never coordinates or reverse-geocoding results.
    const globalRef = db.collection("geocoding_limits").doc("service"),
      userRef = db.collection("geocoding_limits").doc("user_" + uid);
    await db.runTransaction(async (tx) => {
      const [g, u] = await Promise.all([tx.get(globalRef), tx.get(userRef)]),
        now = Date.now(),
        minute = Math.floor(now / 60000),
        count = u.data()?.minute === minute ? u.data()?.count || 0 : 0;
      if (count >= 5)
        throw new ApiError(
          429,
          "You have tried location lookup several times. Wait a minute or enter your address manually.",
        );
      if (now - (g.data()?.requestedAt?.toMillis?.() || 0) < 1200)
        throw new ApiError(
          429,
          "Location lookup is busy. Try again in a moment, or enter your address manually.",
        );
      tx.set(globalRef, { requestedAt: Timestamp.fromMillis(now) });
      tx.set(userRef, { minute, count: count + 1 });
    });
    const url = new URL(
      process.env.NOMINATIM_REVERSE_URL ||
        "https://nominatim.openstreetmap.org/reverse",
    );
    if (url.protocol !== "https:" || url.username || url.password)
      throw new ApiError(
        503,
        "Location lookup is unavailable. Enter your address manually.",
      );
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: parsed.data.latitude.toFixed(5),
      lon: parsed.data.longitude.toFixed(5),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "en",
    }).toString();
    let response: Response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
        headers: {
          "User-Agent": "TreatStory/1.0 (https://treatstory.vercel.app)",
          Accept: "application/json",
        },
      });
    } catch {
      throw new ApiError(
        503,
        "Location lookup is unavailable. Enter your address manually.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status === 429 ? 429 : 503,
        "Location lookup is temporarily unavailable. Please try again or enter your address manually.",
      );
    const suggestion = suggestedAddress(
      await response.json().catch(() => null),
    );
    if (!suggestion)
      throw new ApiError(
        422,
        "Could not find an Indian delivery address here. Enter your address manually.",
      );
    return Response.json(suggestion, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeResponse(error);
  }
}
