import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { placeAtomicCheckout } from "@/lib/server/atomic-checkout";
import type { CheckoutPayload } from "@/lib/checkout-schema";
async function main() {
  if (
    process.env.TREATSTORY_AUDIT !== "local-only" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080"
  )
    throw Error("Loopback demo emulator required");
  const databases = Array.from({ length: 5 }, (_, i) =>
      getFirestore(
        initializeApp(
          { projectId: "demo-treatstory-audit" },
          "independent-instance-" + i,
        ),
      ),
    ),
    db = databases[0],
    suffix = randomUUID(),
    sellerId = "race-seller-" + suffix,
    productId = "race-product-" + suffix,
    date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await db.doc("sellers/" + sellerId).set({
    ownerUid: sellerId,
    status: "active",
    isOpen: true,
    accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000),
    dailyOrderCapacity: 0,
    deliveryFee: 0,
  });
  await db.doc("marketplace_products/" + productId).set({
    sellerId,
    name: "Independent-instance last item",
    status: "published",
    availability: "available",
    price: 100,
    showPrice: true,
    stockQuantity: 1,
    weightOptions: [],
  });
  const payload = (id = randomUUID()): CheckoutPayload => ({
    checkoutId: id,
    lines: [
      {
        productId,
        quantity: 1,
        expectedPrice: 100,
        weight: null,
        customizationNote: "",
      },
    ],
    customerName: "Synthetic buyer",
    customerPhone: "9876543210",
    deliveryAddress: "Synthetic test address",
    deliveryMode: "pickup",
    pincode: "",
    requestedDate: date,
    requestedSlot: "10 AM–12 PM",
    customerNote: "",
    giftRecipient: "",
    giftMessage: "",
    advancePaymentAcknowledged: false,
  });
  const started = performance.now(),
    race = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        placeAtomicCheckout(
          databases[i % 5],
          "race-buyer-" + suffix + "-" + i,
          payload(),
        ).then(
          (r) => ({ status: 200, ids: r.orderIds }),
          (e) => ({ status: e.status || 503, ids: [] }),
        ),
      ),
    );
  const stock = (
    await db.doc("marketplace_products/" + productId).get()
  ).data()!.stockQuantity;
  await db
    .doc("marketplace_products/" + productId)
    .update({ stockQuantity: 10 });
  const repeat = payload(),
    responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        placeAtomicCheckout(
          databases[i % 5],
          "repeat-buyer-" + suffix,
          repeat,
        ).then(
          (r) => ({ status: 200, ids: r.orderIds }),
          (e) => ({ status: e.status || 503, ids: [] }),
        ),
      ),
    );
  const unique = new Set(responses.flatMap((r) => r.ids)),
    result = {
      independentFirestoreInstances: 5,
      requests: 100,
      elapsedMs: performance.now() - started,
      successes: race.filter((r) => r.status === 200).length,
      remainingStockAfterRace: stock,
      unexpectedStatuses: race
        .filter((r) => ![200, 409].includes(r.status))
        .map((r) => r.status),
      duplicateRequests: 25,
      uniqueDuplicateOrders: unique.size,
      duplicateStatuses: responses.map((r) => r.status),
      stockAfterDuplicate: (
        await db.doc("marketplace_products/" + productId).get()
      ).data()!.stockQuantity,
      limitations:
        "Independent Firestore objects with separate local queues in one process; not deployed multi-region Vercel instances.",
    };
  writeFileSync(
    "/tmp/treatstory-audit/distributed-race.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await Promise.all(databases.map((d) => d.terminate()));
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
