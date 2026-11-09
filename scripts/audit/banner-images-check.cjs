const assert = require("node:assert/strict"),
  fs = require("node:fs");
const { chromium } = require("playwright"),
  { initializeApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore");
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080"
)
  throw Error("Loopback demo only");
(async () => {
  const db = getFirestore(
      initializeApp({ projectId: "demo-treatstory-audit" }, "banner-check"),
    ),
    ref = db.doc("banners/banner-0"),
    original = (await ref.get()).data().imageUrl;
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.goto("http://127.0.0.1:9030");
    const first = page.getByRole("img", {
      name: "Audit banner 0",
      exact: true,
    });
    await first.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector('img[alt="Audit banner 0"]')?.naturalWidth > 0,
    );
    await page
      .getByRole("img", { name: "Audit banner 1", exact: true })
      .waitFor();
    assert.equal(await page.locator('img[alt^="Audit banner"]').count(), 2);
    await page.getByRole("button", { name: "Next slide", exact: true }).click();
    await page
      .getByRole("img", { name: "Audit banner 2", exact: true })
      .waitFor();
    assert.equal(await page.locator('img[alt^="Audit banner"]').count(), 3);
    await ref.update({ imageUrl: "/img/does-not-exist-audit.webp" });
    await page.waitForFunction(() =>
      document
        .querySelector('img[alt="Audit banner 0"]')
        ?.getAttribute("src")
        ?.includes("product-placeholder.svg"),
    );
    await ref.update({ imageUrl: "/img/login-side.avif?latest-banner=1" });
    await page.waitForFunction(() => {
      const i = document.querySelector('img[alt="Audit banner 0"]');
      return (
        i?.currentSrc.includes("latest-banner") &&
        i.complete &&
        i.naturalWidth > 0
      );
    });
    await page.goto("http://127.0.0.1:9030/product/seller:audit-product-0001");
    await page
      .getByRole("button", { name: "Next product photo", exact: true })
      .click();
    await page.waitForFunction(() => {
      const i = document.querySelector('img[alt="Audit Cake 0001 photo 2"]');
      return i?.complete && i.naturalWidth > 0;
    });
    const checks = [
      "only visible and adjacent banners mounted initially",
      "next slide requests next adjacent banner",
      "broken banner uses local fallback",
      "updated banner URL recovers live without reload",
      "next product gallery photo loads",
    ];
    fs.writeFileSync(
      "/tmp/treatstory-audit/banner-images-check.json",
      JSON.stringify({ checks }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    await ref.update({ imageUrl: original });
    await browser.close();
    await db.terminate();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
