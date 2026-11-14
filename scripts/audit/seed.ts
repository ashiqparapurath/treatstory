import { productSearchPrefixes } from '../../src/lib/search-index';
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
async function main() {
  const project = "demo-treatstory-audit";
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
  )
    throw Error("Refusing non-loopback seed");
  const dir = process.env.AUDIT_OUTPUT || "/tmp/treatstory-audit";
  mkdirSync(dir, { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(
    dir + "/fixture-service-account.json",
    JSON.stringify({
      project_id: project,
      client_email: `audit@${project}.iam.gserviceaccount.com`,
      private_key: privateKey,
    }),
    { mode: 0o600 },
  );
  const db = getFirestore(initializeApp({ projectId: project }, "audit-seed"));
  const password = "Audit-only-password-2026!";
  const users: any[] = [];
  async function account(uid: string, role: string) {
    const email = `${uid}@example.test`;
    const response = await fetch(
      `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=audit-public-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    let body = await response.json();
    if (!response.ok && body.error?.message === "EMAIL_EXISTS") {
      const login = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=audit-public-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      );
      body = await login.json();
      if (!login.ok) throw Error("Audit existing account login failed");
    } else if (!response.ok) throw Error("Audit auth seed failed");
    await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=audit-public-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: body.idToken,
          displayName: "Audit " + uid,
        }),
      },
    );
    const record = {
      uid: body.localId,
      email,
      password,
      token: body.idToken,
      role,
    };
    users.push(record);
    return record;
  }
  const sellers = [];
  for (let i = 0; i < 10; i++)
    sellers.push(await account("seller-" + i, "seller"));
  const admins = [];
  for (let i = 0; i < 5; i++) admins.push(await account("admin-" + i, "admin"));
  for (let offset = 0; offset < 200; offset += 10)
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        account("buyer-" + (offset + i), "buyer"),
      ),
    );
  const now = Timestamp.now(),
    date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  let batch = db.batch(),
    writes = 0;
  async function put(path: string, data: Record<string, unknown>) {
    if (/^(products|marketplace_products)\//.test(path)) data.searchPrefixes=productSearchPrefixes(data);
    batch.set(db.doc(path), data);
    writes++;
    if (writes === 400) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }
  for (const a of admins) await put("roles_admin/" + a.uid, {});
  for (const [i, s] of sellers.entries())
    await put("sellers/" + s.uid, {
      ownerUid: s.uid,
      slug: s.uid,
      businessName: `Audit Bakery ${i}`,
      businessCategory: "home-bakery",
      foodLicenseNumber: "00000000000000", // Synthetic emulator-only fixture
      foodLicenseVerifiedUntil: Timestamp.fromMillis(Date.now()+180*86400000),
      contactEmail: s.email,
      contactPhone: "9876543210",
      description: "Synthetic staging seller",
      status: "active",
      isOpen: true,
      accessType: "trial",
      accessStartsAt: now,
      accessEndsAt: Timestamp.fromMillis(Date.now() + 30 * 86400000),
      deliveryMethods: ["delivery", "pickup"],
      deliveryPincodes: ["673001"],
      deliveryFee: 50,
      pickupAddress: "Audit collection point",
      deliverySlots: ["10 AM–12 PM"],
      dailyOrderCapacity: 100,
      acceptanceHours: 24,
      createdAt: now,
      updatedAt: now,
    });
  for (let i = 0; i < 1000; i++)
    await put(
      "marketplace_products/audit-product-" + String(i).padStart(4, "0"),
      {
        sellerId: sellers[i % 10].uid,
        name: `Audit Cake ${String(i).padStart(4, "0")}`,
        description: "Synthetic chocolate cake for isolated audit. ".repeat(12),
        category: i % 2 ? "Cake" : "Handmade",
        price: 450,
        imageUrls: ["/img/product-placeholder.svg"],
        showPrice: true,
        availability: "available",
        stockQuantity: 10000,
        preparationDays: 0,
        minimumOrderQuantity: 1,
        weightOptions: [
          { value: 500, unit: "g", price: 450, stockQuantity: 10000 },
          { value: 1, unit: "kg", price: 850, stockQuantity: 10000 },
        ],
        customizationOptions: ["Cake message"],
        advancePaymentRequired: i % 3 === 0,
        careInstructions: "Keep cool",
        ingredients: "Synthetic test ingredients",
        allergens: ["Milk"],
        dietaryTags: [],
        storageInstructions: "Keep cool",
        status: "published",
        createdAt: now,
        updatedAt: now,
      },
    );
  for (let i = 0; i < 12; i++)
    await put("categories/category-" + i, {
      name: `Category ${i}`,
      description: "Audit category",
    });
  for (let i = 0; i < 50; i++)
    await put("products/legacy-" + i, {
      name: `Audit legacy product ${i}`,
      description: "Synthetic legacy product",
      category: "category-0",
      price: 100,
      imageUrls: ["/img/product-placeholder.svg"],
      showPrice: true,
    });
  for (let i = 0; i < 4; i++)
    await put("banners/banner-" + i, {
      title: `Audit banner ${i}`,
      subtitle: "Isolated synthetic staging",
      isActive: true,
      imageUrl: "/img/landing-hero.webp",
      buttonLink: "/products",
      buttonText: "Shop",
    });
  await put("settings/enquiry", { whatsappNumber: "919876543210" });
  for (const buyer of users.filter((u) => u.role === "buyer"))
    await put("customer_addresses/" + buyer.uid, {
      recipient: "Audit Buyer",
      phone: "9876543210",
      line1: "Synthetic audit house, Main Street",
      locality: "Town",
      district: "Kozhikode",
      state: "Kerala",
      pincode: "673001",
      updatedAt: now,
    });
  for (let i = 0; i < 200; i += 20)
    await put("seller_applications/audit-approval-" + i, {
      ownerUid: users.find((u) => u.email === "buyer-" + i + "@example.test")!
        .uid,
      businessName: "Audit applicant " + i,
      businessCategory: "home-bakery",
      foodLicenseNumber: "00000000000000", // Synthetic emulator-only fixture
      foodLicenseVerifiedUntil: Timestamp.fromMillis(Date.now()+180*86400000),
      contactEmail: "applicant@example.test",
      contactPhone: "9876543210",
      description: "Synthetic application",
      status: "pending",
      submittedAt: now,
    });
  if (writes) await batch.commit();
  writeFileSync(
    dir + "/fixtures.json",
    JSON.stringify({ project, date, users, sellers, admins }),
    { mode: 0o600 },
  );
  console.log(
    "Seeded isolated emulator:",
    users.length,
    "users, 1000 marketplace products, 50 legacy products.",
  );
  await db.terminate();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
