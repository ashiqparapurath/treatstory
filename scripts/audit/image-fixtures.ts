import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080")
    throw Error("Loopback demo only");
  const db = getFirestore(
    initializeApp({ projectId: "demo-treatstory-audit" }, "image-fixtures"),
  );
  await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      db
        .doc("banners/banner-" + i)
        .update({ imageUrl: "/img/landing-hero.webp?audit-banner=" + i }),
    ),
  );
  await db
    .doc("marketplace_products/audit-product-0001")
    .update({
      imageUrls: [
        "/img/landing-hero.webp?audit-product=1",
        "/img/login-side.avif?audit-product=2",
      ],
    });
  await db.terminate();
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
