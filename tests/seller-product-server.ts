import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  saveProductRequest,
  saveSellerProduct,
} from "@/lib/server/seller-product";
async function main() {
  if (
    !/^(127\.0\.0\.1|localhost):\d+$/.test(
      process.env.FIRESTORE_EMULATOR_HOST || "",
    )
  )
    throw Error("Loopback emulator required");
  const projectId = process.env.GCLOUD_PROJECT || "demo-treatstory";
  if (!projectId.startsWith("demo-")) throw Error("Demo project required");
  const db = getFirestore(initializeApp({ projectId }, "seller-server-test")),
    uid = "product-api-" + randomUUID();
  await db.doc("sellers/" + uid).set({
    ownerUid: uid,
    status: "active",
    accessEndsAt: Timestamp.fromMillis(Date.now() + 86400000),
  });
  const product = {
    sellerId: uid,
    name: "Maximum detailed cake",
    description: "Test",
    category: "Cake",
    price: 450,
    imageUrls: Array(10).fill(
      "https://res.cloudinary.com/test/image/upload/cake.jpg",
    ),
    showPrice: true,
    availability: "made-to-order",
    stockQuantity: 0,
    preparationDays: 1,
    minimumOrderQuantity: 1,
    customizationOptions: Array(6).fill("Message"),
    advancePaymentRequired: true,
    careInstructions: "",
    ingredients: "",
    allergens: Array(12).fill("Milk"),
    dietaryTags: Array(12).fill("Vegetarian"),
    storageInstructions: "",
    weightOptions: Array.from({ length: 8 }, (_, i) => ({
      value: i + 1,
      unit: "kg",
      price: 450,
      stockQuantity: 5,
    })),
    status: "published",
  };
  assert.equal(
    saveProductRequest.safeParse({ product, expectedUpdatedAt: 123.5 }).success,
    true,
  );
  const updatedMaximum = { ...product, preparationDays: 365, weightOptions: product.weightOptions.slice(0, 2) };
  assert.equal(saveProductRequest.safeParse({ product: updatedMaximum }).success, true, "Two sizes and 365 preparation days are valid");
  assert.equal(saveProductRequest.safeParse({ product: { ...updatedMaximum, preparationDays: 366 } }).success, false);
  const withTwoSizes = {
    ...product,
    preparationDays: 365,
    weightOptions: product.weightOptions.slice(0, 2),
    imageUrls: ['https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_900/cake.png'],
  };
  assert.equal(saveProductRequest.safeParse({ product: withTwoSizes }).success, true);
  assert.equal(saveProductRequest.safeParse({ product: { ...withTwoSizes, preparationDays: 366 } }).success, false);
  const input = saveProductRequest.parse({ product });
  const created = await saveSellerProduct(db, uid, input);
  assert.match(created.sku, /^TS-[A-HJ-NP-Z2-9]{8}$/);
  const ref = db.doc("marketplace_products/" + created.productId);
  assert.equal((await ref.get()).data()?.sku, created.sku);
  assert.equal((await db.doc("product_skus/" + created.sku).get()).data()?.productId, created.productId);
  const other = await saveSellerProduct(db, uid, input);
  assert.notEqual(other.sku, created.sku, "Separate listings need distinct SKUs");
  assert.equal((await db.doc("product_skus/" + other.sku).get()).data()?.productId, other.productId);

  await ref.update({updatedAt:new Timestamp(Math.floor(Date.now()/1000),123456789)});
  const stored = (await ref.get()).data()!;
  assert.equal(stored.weightOptions.length, 8);
  assert.equal(stored.imageUrls.length, 10);
  const edit = {
    ...input,
    productId: created.productId,
    expectedUpdatedAt: stored.updatedAt.toMillis(),
    product: { ...input.product, name: "Edited maximum cake" },
  };
  const edited = await saveSellerProduct(db, uid, edit);
  assert.equal(edited.sku, created.sku, "SKU is immutable across edits");
  assert.equal((await ref.get()).data()?.sku, created.sku);
  await assert.rejects(
    () => saveSellerProduct(db, uid, edit),
    (e) => (e as { status: number }).status === 409,
  );
  await assert.rejects(
    () => saveSellerProduct(db, "another-user", input),
    (e) => (e as { status: number }).status === 403,
  );
  for (const invalid of [
    { ...product, price: -1 },
    { ...product, imageUrls: [{ url: "x" }] },
    { ...product, imageUrls: ["https://evil.example/cake.jpg"] },
    {
      ...product,
      weightOptions: [{ value: 1, unit: "g", price: 0, extra: true }],
    },
    { ...product, role: "admin" },
    { ...product, sku: "TS-ABCDEF23" },
  ])
    assert.equal(
      saveProductRequest.safeParse({ product: invalid }).success,
      false,
    );
  await db
    .doc("sellers/" + uid)
    .update({ accessEndsAt: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(
    () => saveSellerProduct(db, uid, input),
    (e) => (e as { status: number }).status === 403,
  );
  console.log(
    "PASS maximum seller listing create/edit, stale inventory rejection, ownership, active access and strict server validation",
  );
  await db.terminate();
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
