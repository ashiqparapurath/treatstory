import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  orderBy,
  documentId,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  terminate,
} from "firebase/firestore/lite";
import { initializeApp as initializeAdmin } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";

const project = "demo-treatstory-audit",
  origin = "http://127.0.0.1:9030";
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error(
    "Refusing load against anything except isolated loopback demo staging",
  );
const runId = randomUUID().slice(0, 8);
const output = process.env.AUDIT_OUTPUT || "/tmp/treatstory-audit";
const fixtures = JSON.parse(readFileSync(output + "/fixtures.json", "utf8"));
const duration = Number(process.env.AUDIT_STAGE_SECONDS || 30) * 1000;
const thinkMs = Number(process.env.AUDIT_THINK_MS || 100);
if (
  !Number.isFinite(thinkMs) ||
  thinkMs < 100 ||
  thinkMs > 5000 ||
  !Number.isFinite(duration) ||
  duration < 1000 ||
  duration > 300000
)
  throw Error("Invalid isolated run duration/think time");
const stages = (process.env.AUDIT_STAGES || "10,25,50,100,200")
  .split(",")
  .map(Number);
if (stages.some((n) => ![10, 25, 50, 100, 200].includes(n)))
  throw Error("Invalid isolated concurrency stage");
const admin = adminFirestore(
  initializeAdmin({ projectId: project }, "audit-load-admin"),
);
type Sample = {
  operation: string;
  ms: number;
  status: number;
  expected: boolean;
  ok: boolean;
  reads: number;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
    : 0;
};
const summarize = (rows: Sample[]) => ({
  count: rows.length,
  p50: percentile(
    rows.map((r) => r.ms),
    0.5,
  ),
  p95: percentile(
    rows.map((r) => r.ms),
    0.95,
  ),
  p99: percentile(
    rows.map((r) => r.ms),
    0.99,
  ),
  unexpectedErrors: rows.filter((r) => !r.ok && !r.expected).length,
  expectedResponses: rows.filter((r) => r.expected).length,
  logicalClientDocReads: rows.reduce((sum, r) => sum + r.reads, 0),
});
const api = async (path: string, token: string, data: unknown) => {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      Origin: origin,
    },
    body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
};
const checkout = (
  id: string,
  productId: string,
  price = 450,
  weight: any = { value: 500, unit: "g" },
) => ({
  checkoutId: id,
  lines: [
    {
      productId,
      quantity: 1,
      expectedPrice: price,
      weight,
      customizationNote: "Audit message",
    },
  ],
  advancePaymentAcknowledged: true,
  customerName: "Audit Buyer",
  customerPhone: "9876543210",
  deliveryAddress: "Synthetic audit address, Kozhikode, Kerala 673001",
  deliveryMode: "delivery",
  pincode: "673001",
  requestedDate: fixtures.date,
  requestedSlot: "10 AM–12 PM",
  customerNote: "",
  giftRecipient: "",
  giftMessage: "",
});
async function main() {
  const people = fixtures.users.filter((u: any) => u.role === "buyer");
  const clients = await Promise.all(
    people.map(async (person: any, index: number) => {
      const role =
        index % 20 === 0
          ? fixtures.admins[Math.floor(index / 20) % fixtures.admins.length]
          : index % 10 === 1
            ? fixtures.sellers[Math.floor(index / 10) % fixtures.sellers.length]
            : person;
      person = role;
      const login = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=audit-public-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: person.email,
            password: person.password,
            returnSecureToken: true,
          }),
        },
      );
      const session = await login.json();
      if (!login.ok) throw Error("Audit sign-in failed");
      person.token = session.idToken;
      const app = initializeApp(
        { projectId: project, apiKey: "audit-public-key" },
        "audit-vu-" + index,
      );
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8080, {
        mockUserToken: role.token,
      });
      return { app, db, person, role, index };
    }),
  );
  const results: any[] = [];
  for (const concurrency of stages) {
    console.log(
      JSON.stringify({
        event: "stage-start",
        concurrency,
        at: new Date().toISOString(),
      }),
    );
    // Restore only synthetic inventory/capacity between measured stages.
    const stores = await admin.collection("sellers").get();
    await Promise.all(
      stores.docs.map((store) => store.ref.update({ dailyOrderCapacity: 0 })),
    );
    const rows: Sample[] = [];
    const resources: any[] = [];
    let resourceTimer = setInterval(() => {
      try {
        resources.push({
          ...JSON.parse(readFileSync(output + "/server-metrics.json", "utf8")),
          cgroupMemoryBytes: (()=>{try{return Number(readFileSync('/sys/fs/cgroup/memory.current','utf8'));}catch{return null;}})(),
          cgroupCpu: (()=>{try{return readFileSync('/sys/fs/cgroup/cpu.stat','utf8');}catch{return null;}})(),
        });
      } catch {}
    }, 1000);
    const start = performance.now(),
      deadline = start + duration;
    const sample = async (
      operation: string,
      fn: () => Promise<{
        status?: number;
        expected?: boolean;
        reads?: number;
        ok?: boolean;
      }>,
    ) => {
      const started = performance.now();
      try {
        const result = await fn();
        const status = result.status || 200;
        rows.push({
          operation,
          ms: performance.now() - started,
          status,
          expected: !!result.expected,
          ok: result.ok ?? status < 400,
          reads: result.reads || 0,
        });
      } catch (error) {
        rows.push({
          operation,
          ms: performance.now() - started,
          status: 0,
          expected: false,
          ok: false,
          reads: 0,
        });
      }
    };
    await Promise.all(
      clients.slice(0, concurrency).map(async (client) => {
        let iteration = 0;
        let lastOrder = "";
        while (performance.now() < deadline) {
          const op = iteration++ % 12;
          if (op === 0)
            await sample("page.home", async () => {
              const r = await fetch(origin + "/");
              await r.text();
              return { status: r.status };
            });
          else if (op === 1)
            await sample("read.catalog", async () => {
              const s = await getDocs(
                query(
                  collection(client.db, "marketplace_products"),
                  where("status", "==", "published"),
                  orderBy(documentId()),
                  limit(24),
                ),
              );
              if (s.size !== 24) throw Error("Catalog incomplete");
              return { reads: s.size };
            });
          else if (op === 2)
            await sample("read.product.variant", async () => {
              const s = await getDoc(
                doc(
                  client.db,
                  "marketplace_products",
                  "audit-product-" +
                    String(client.index % 1000).padStart(4, "0"),
                ),
              );
              const p = s.data();
              if (!p || p.weightOptions[1].price !== 850)
                throw Error("Variant corrupted");
              return { reads: 1 };
            });
          else if (op === 3)
            await sample("read.categories.banners", async () => {
              const snapshots = await Promise.all([
                getDocs(query(collection(client.db, "categories"), limit(24))),
                getDocs(
                  query(
                    collection(client.db, "banners"),
                    where("isActive", "==", true),
                    limit(8),
                  ),
                ),
              ]);
              return { reads: snapshots.reduce((n, s) => n + s.size, 0) };
            });
          else if (op === 4)
            await sample("read.search.filter", async () => {
              const s = await getDocs(
                query(
                  collection(client.db, "marketplace_products"),
                  where("status", "==", "published"),
                  orderBy(documentId()),
                  limit(24),
                ),
              );
              const matches = s.docs.filter(
                (d) =>
                  d.data().name.toLowerCase().includes("cake") &&
                  d.data().price >= 450,
              );
              if (!matches.length) throw Error("Search mismatch");
              return { reads: s.size };
            });
          else if (op === 5)
            await sample("read.profile", async () => {
              const s = await getDoc(
                doc(client.db, "customer_addresses", client.role.uid),
              );
              return { reads: 1 };
            });
          else if (op === 6)
            await sample("page.products", async () => {
              const r = await fetch(origin + "/products");
              await r.text();
              return { status: r.status };
            });
          else if (op === 7 && client.role.role === "buyer")
            await sample("write.checkout", async () => {
              const result = await api(
                "/api/checkout",
                client.person.token,
                checkout(
                  randomUUID(),
                  "audit-product-" +
                    String(client.index % 1000).padStart(4, "0"),
                ),
              );
              if (result.status === 200) lastOrder = result.body.orderIds[0];
              return {
                status: result.status,
                expected: [409, 429].includes(result.status),
              };
            });
          else if (op === 7 && client.role.role === "seller")
            await sample("seller.product.edit", async () => {
              const snap = await getDocs(
                query(
                  collection(client.db, "marketplace_products"),
                  where("sellerId", "==", client.role.uid),
                  limit(1),
                ),
              );
              const document = snap.docs[0],
                { createdAt, updatedAt, searchPrefixes, sku, ...product } = document.data();
              const r = await api("/api/seller/products", client.person.token, {
                productId: document.id,
                expectedUpdatedAt: updatedAt.toMillis(),
                product: {
                  ...product,
                  price: 450,
                  imageUrls: [
                    "https://res.cloudinary.com/treatstory-audit/image/upload/audit-placeholder.svg",
                  ],
                },
              });
              return {
                status: r.status,
                expected: [409, 429].includes(r.status),
                reads: snap.size,
              };
            });
          else if (op === 7)
            await sample("admin.approval", async () => {
              const uid = "audit-approval-" + client.index;
              await updateDoc(doc(client.db, "seller_applications", uid), {
                ownerUid: uid,
                businessName: "Audit applicant",
                status: "approved",
                reviewedAt: serverTimestamp(),
                reviewedBy: client.role.uid,
              });
              return {};
            });
          else if (op === 8)
            await sample("read.orders", async () => {
              const field =
                client.role.role === "seller" ? "sellerId" : "buyerUid";
              const s = await getDocs(
                client.role.role === "admin"
                  ? query(collection(client.db, "seller_orders"), limit(20))
                  : query(
                      collection(client.db, "seller_orders"),
                      where(field, "==", client.role.uid),
                      limit(20),
                    ),
              );
              return { reads: Math.max(1, s.size) };
            });
          else if (op === 9)
            await sample("auth.sign-in", async () => {
              const r = await fetch(
                "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=audit-public-key",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: client.person.email,
                    password: client.person.password,
                    returnSecureToken: true,
                  }),
                },
              );
              await r.json();
              return { status: r.status };
            });
          else if (op === 10 && client.role.role === "buyer")
            await sample("auth.sign-up", async () => {
              const r = await fetch(
                "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=audit-public-key",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: `stage-${runId}-${concurrency}-${client.index}-${iteration}@example.test`,
                    password: "Audit-only-password-2026!",
                    returnSecureToken: true,
                  }),
                },
              );
              await r.json();
              return { status: r.status };
            });
          else
            await sample("read.product", async () => {
              await getDoc(
                doc(client.db, "marketplace_products", "audit-product-0001"),
              );
              return { reads: 1 };
            });
          await new Promise((resolve) => setTimeout(resolve, thinkMs));
        }
      }),
    );
    clearInterval(resourceTimer);
    const elapsed = (performance.now() - start) / 1000;
    const operations = Object.fromEntries(
      [...new Set(rows.map((r) => r.operation))].map((op) => [
        op,
        summarize(rows.filter((r) => r.operation === op)),
      ]),
    );
    const result = {
      concurrency,
      durationSeconds: elapsed,
      summary: summarize(rows),
      throughput: rows.length / elapsed,
      operations,
      resources: {
        samples: resources.length,
        peakServerRss: Math.max(0, ...resources.map((r) => r.memory.rss)),
        peakCgroupMemoryBytes: Math.max(
          0,
          ...resources.map((r) => r.cgroupMemoryBytes),
        ),
        peakEventLoopP95Ms: Math.max(
          0,
          ...resources.map((r) => r.eventLoop.p95Ms),
        ),
        first: resources[0],
        last: resources.at(-1),
      },
      targets: {
        standardReadP95Ms: percentile(
          rows.filter((r) => r.operation.startsWith("read.")).map((r) => r.ms),
          0.95,
        ),
        unexpectedErrorRate:
          rows.filter((r) => !r.ok && !r.expected).length /
          Math.max(1, rows.filter((r) => !r.expected).length),
      },
    };
    results.push(result);
    writeFileSync(
      output + "/load-results.json",
      JSON.stringify(
        {
          environment: {
            thinkTimeMs: thinkMs,
            cpuLimit: (()=>{try{const [quota,period]=readFileSync('/sys/fs/cgroup/cpu.max','utf8').split(' ').map(Number);return Number.isFinite(quota/period)?quota/period:null;}catch{return null;}})(),
            memoryGiB: (()=>{try{const value=Number(readFileSync('/sys/fs/cgroup/memory.max','utf8'))/1024**3;return Number.isFinite(value)?value:null;}catch{return null;}})(),
            project,
            providerDelivery: "stubbed",
            database: "emulator",
            clientTransport:
              "Firestore Lite REST (rules enforced); browser suite separately exercises live listeners",
          },
          results,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        concurrency,
        ...result.summary,
        throughput: result.throughput,
        targets: result.targets,
      }),
    );
  }
  // True simultaneous last-item race through the real Next endpoint.
  const raceProduct = "audit-race";
  const sellerId = fixtures.sellers[0].uid;
  await admin.doc("marketplace_products/" + raceProduct).set({
    sellerId,
    name: "Only one audit cake",
    status: "published",
    availability: "available",
    stockQuantity: 1,
    price: 100,
    showPrice: true,
    minimumOrderQuantity: 1,
    preparationDays: 0,
    weightOptions: [],
  });
  const race = await Promise.all(
    clients
      .slice(0, 100)
      .map((c) =>
        api(
          "/api/checkout",
          c.person.token,
          checkout(randomUUID(), raceProduct, 100, null),
        ),
      ),
  );
  const stock = (
    await admin.doc("marketplace_products/" + raceProduct).get()
  ).data()!.stockQuantity;
  const won = race.filter((r) => r.status === 200);
  const errors = race.filter((r) => ![200, 409, 429].includes(r.status));
  const retryId = randomUUID();
  const repeat = await Promise.all(
    Array.from({ length: 25 }, () =>
      api(
        "/api/checkout",
        clients[1].person.token,
        checkout(retryId, "audit-product-0001"),
      ),
    ),
  );
  const ids = new Set(
    repeat.filter((r) => r.status === 200).flatMap((r) => r.body.orderIds),
  );
  const correctness = {
    raceRequests: race.length,
    successfulOrders: won.length,
    rateLimitedRequests: race.filter(r=>r.status===429).length,
    remainingStock: stock,
    unexpectedStatuses: errors.map((r) => r.status),
    duplicateRequests: repeat.length,
    uniqueOrders: ids.size,
    duplicateUnexpectedStatuses: repeat
      .filter((r) => r.status !== 200)
      .map((r) => r.status),
    passed:
      won.length === 1 &&
      stock === 0 &&
      errors.length === 0 &&
      ids.size === 1 &&
      repeat.every((r) => r.status === 200),
  };
  writeFileSync(
    output + "/correctness-results.json",
    JSON.stringify(correctness, null, 2),
  );
  console.log("CORRECTNESS", JSON.stringify(correctness));
  for (const c of clients) {
    await terminate(c.db);
    await deleteApp(c.app);
  }
  await admin.terminate();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
