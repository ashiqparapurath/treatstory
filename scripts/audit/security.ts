import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  terminate,
} from "firebase/firestore/lite";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminDb, Timestamp } from "firebase-admin/firestore";
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Loopback demo emulators required");
const fixture = JSON.parse(
    readFileSync("/tmp/treatstory-audit/fixtures.json", "utf8"),
  ),
  project = "demo-treatstory-audit",
  origin = "http://127.0.0.1:9030";
async function main() {
  const admin = adminDb(adminApp({ projectId: project }, "security-seed"));
  const rows: Array<{ test: string; passed: boolean; detail?: string }> = [];
  const people = [
    fixture.users.find((p: any) => p.role === "buyer"),
    fixture.users.filter((p: any) => p.role === "buyer")[1],
    fixture.sellers[0],
    fixture.admins[0],
  ];
  const clients = await Promise.all(
    people.map(async (p: any, i: number) => {
      const response = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=audit-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: p.email,
            password: p.password,
            returnSecureToken: true,
          }),
        },
      );
      const session = await response.json();
      assert.equal(response.status, 200);
      const app = initializeApp(
        { projectId: project, apiKey: "audit-key" },
        "security-" + i,
      );
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8080, {
        mockUserToken: session.idToken,
      });
      return { ...p, app, db, token: session.idToken };
    }),
  );
  const [buyer, other, seller, administrator] = clients;
  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      rows.push({ test: name, passed: true });
    } catch (error) {
      rows.push({
        test: name,
        passed: false,
        detail: (error as Error).message.slice(0, 180),
      });
    }
  }
  const denied = async (fn: () => Promise<unknown>) =>
    assert.rejects(
      fn,
      (e) => (e as { code?: string }).code === "permission-denied",
    );
  const post = async (path: string, token: string, body: unknown) => {
    const r = await fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  await admin.doc("seller_orders/audit-private-order").set({
    buyerUid: other.uid,
    sellerId: "unrelated-seller",
    status: "pending",
  });
  await admin
    .doc("custom_quotes/audit-private-quote")
    .set({ buyerUid: other.uid, sellerId: "unrelated-seller" });
  await admin
    .doc("support_tickets/audit-private-ticket")
    .set({ buyerUid: other.uid });
  await admin
    .doc("mail_outbox/audit-private-job")
    .set({ uid: other.uid, status: "sent" });
  for (const path of [
    "customer_addresses/" + other.uid,
    "seller_orders/audit-private-order",
    "custom_quotes/audit-private-quote",
    "support_tickets/audit-private-ticket",
    "mail_outbox/audit-private-job",
    "notifications/" + other.uid + "/items/x",
    "favorites/" + other.uid + "/items/x",
  ])
    await check("Cross-account read denied: " + path.split("/")[0], () =>
      denied(() => getDoc(doc(buyer.db, path))),
    );
  await check("Self-granted administrator rejected", () =>
    denied(() =>
      setDoc(doc(buyer.db, "roles_admin", buyer.uid), { role: "admin" }),
    ),
  );
  await check("Direct fabricated order rejected", () =>
    denied(() =>
      setDoc(doc(buyer.db, "seller_orders", "audit-forged"), {
        buyerUid: buyer.uid,
        sellerId: seller.uid,
        status: "completed",
        unitPrice: 0,
      }),
    ),
  );
  await check("Buyer cannot edit seller product", () =>
    denied(() =>
      updateDoc(doc(buyer.db, "marketplace_products", "audit-product-0000"), {
        price: 0,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  await check("Seller cannot change access grant", () =>
    denied(() =>
      updateDoc(doc(seller.db, "sellers", seller.uid), {
        accessEndsAt: new Date(Date.now() + 365 * 86400000),
      }),
    ),
  );
  await check("Seller cannot edit another seller product", () =>
    denied(() =>
      updateDoc(doc(seller.db, "marketplace_products", "audit-product-0001"), {
        price: 1,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
  await check("Buyer cannot approve seller", () =>
    denied(() =>
      updateDoc(doc(buyer.db, "seller_applications", "audit-approval-180"), {
        status: "approved",
      }),
    ),
  );
  await check("Administrator can inspect order", async () =>
    assert.equal(
      (
        await getDoc(
          doc(administrator.db, "seller_orders", "audit-private-order"),
        )
      ).exists(),
      true,
    ),
  );
  await check("Unauthenticated checkout rejected", async () =>
    assert.equal((await post("/api/checkout", "", {})).status, 401),
  );
  await check("Forged bearer rejected", async () =>
    assert.equal((await post("/api/checkout", "not-a-token", {})).status, 401),
  );
  await check("Malformed authenticated checkout rejected", async () =>
    assert.equal((await post("/api/checkout", buyer.token, {})).status, 400),
  );
  await check("Cross-account order mutation rejected", async () =>
    assert.equal(
      (
        await post("/api/orders/action", buyer.token, {
          orderId: "audit-private-order",
          action: "request-cancellation",
          reason: "Please cancel this order",
        })
      ).status,
      403,
    ),
  );
  await check("Chunked oversized checkout rejected", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(" ".repeat(26000)));
        c.close();
      },
    });
    const response = await fetch(origin + "/api/checkout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + buyer.token,
        "Content-Type": "application/json",
      },
      body: stream,
      duplex: "half",
    } as RequestInit);
    assert.equal(response.status, 413);
  });
  const input = {
    checkoutId: randomUUID(),
    lines: [
      {
        productId: "audit-product-0999",
        quantity: 1,
        expectedPrice: 1,
        weight: { value: 500, unit: "g" },
        customizationNote: "",
      },
    ],
    advancePaymentAcknowledged: true,
    deliveryMode: "delivery",
    pincode: "673001",
    customerName: "Audit Buyer",
    customerPhone: "9876543210",
    deliveryAddress: "Isolated test address PIN 673001",
    requestedDate: fixture.date,
    requestedSlot: "10 AM–12 PM",
    customerNote: "",
    giftRecipient: "",
    giftMessage: "",
  };
  await check(
    "Browser price manipulation rejected without inventory reservation",
    async () => {
      const ref = admin.doc("marketplace_products/audit-product-0999"),
        before = (await ref.get()).data()!.weightOptions[0].stockQuantity;
      const response = await post("/api/checkout", other.token, input);
      assert.equal(response.status, 409);
      assert.equal(
        (await ref.get()).data()!.weightOptions[0].stockQuantity,
        before,
      );
    },
  );
  await check(
    "Unsupported image objects rejected by seller rules",
    async () => {
      const owned = await admin
        .collection("marketplace_products")
        .where("sellerId", "==", seller.uid)
        .limit(1)
        .get();
      await denied(() =>
        updateDoc(doc(seller.db, owned.docs[0].ref.path), {
          imageUrls: [{ url: "javascript:alert(1)" }],
          updatedAt: serverTimestamp(),
        }),
      );
    },
  );
  await check("Unsafe image origins rejected by seller rules", async () => {
    const owned = await admin
      .collection("marketplace_products")
      .where("sellerId", "==", seller.uid)
      .limit(1)
      .get();
    await denied(() =>
      updateDoc(doc(seller.db, owned.docs[0].ref.path), {
        imageUrls: ["https://attacker.example/x"],
        updatedAt: serverTimestamp(),
      }),
    );
  });
  await check(
    "Custom quote persists authoritative seller/product names",
    async () => {
      const response = await post("/api/quotes", buyer.token, {
        action: "create",
        sellerId: fixture.sellers[9].uid,
        productId: "audit-product-0999",
        occasion: "Birthday",
        description:
          "Synthetic chocolate cake with simple flowers for an isolated test.",
        budget: 1000,
        requestedDate: fixture.date,
        referenceUrl: "",
      });
      assert.equal(response.status, 200);
      const saved = (
        await admin.doc("custom_quotes/" + response.body.id).get()
      ).data();
      assert.equal(saved?.productName, "Audit Cake 0999");
      assert.equal(saved?.sellerName, "Audit Bakery 9");
    },
  );
  for (const [path, body] of [
    [
      "/api/checkout",
      {
        ...input,
        lines: [{ ...input.lines[0], productId: "nested/collection/product" }],
      },
    ],
    ["/api/quotes", { action: "accept", id: "nested/collection/quote" }],
    ["/api/support", { action: "close", ticketId: "nested/collection/ticket" }],
    ["/api/reviews", { action: "publish", orderId: "nested/collection/order" }],
    [
      "/api/orders/action",
      { orderId: "nested/collection/order", action: "accepted" },
    ],
  ] as Array<[string, unknown]>)
    await check("Nested document path rejected: " + path, async () =>
      assert.equal((await post(path, buyer.token, body)).status, 400),
    );
  const result = {
    passed: rows.every((r) => r.passed),
    checks: rows.length,
    results: rows,
  };
  writeFileSync(
    "/tmp/treatstory-audit/security-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  for (const c of clients) {
    await terminate(c.db);
    await deleteApp(c.app);
  }
  await admin.terminate();
  if (!result.passed) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
