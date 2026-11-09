const assert = require("node:assert/strict"),
  fs = require("node:fs");
const { chromium } = require("playwright");
const { initializeApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore");
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080"
)
  throw Error("Explicit loopback demo required");
const origin = "http://127.0.0.1:9030",
  db = getFirestore(
    initializeApp({ projectId: "demo-treatstory-audit" }, "sharing-check"),
  ),
  checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}
(async () => {
  const ref = db.doc("marketplace_products/audit-social-only"),
    draft = db.doc("marketplace_products/audit-social-draft");
  await ref.set({
    name: "Audit fresh preview one",
    description: "Handmade chocolate cake for sharing.",
    status: "published",
    imageUrls: [
      "https://res.cloudinary.com/treatstory-audit/image/upload/v1/cake.jpg",
    ],
    privateNote: "PRIVATE_SENTINEL_9281",
    price: 928193,
    stock: 928194,
  });
  await draft.set({
    name: "PRIVATE_DRAFT_9281",
    status: "draft",
    imageUrls: [],
  });
  for (const bot of [
    "WhatsApp/2.0",
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "TelegramBot",
  ]) {
    const response = await fetch(
      origin + "/product/seller:audit-social-only?tracking=removed",
      { headers: { "user-agent": bot } },
    );
    const html = await response.text(),
      head = html.split("</head>")[0];
    check(
      bot + " receives public metadata in head",
      head.includes("Audit fresh preview one") &&
        head.includes('property="og:image"') &&
        head.includes("c_pad,w_1200,h_630"),
    );
    check(
      bot + " excludes private product fields",
      !html.includes("PRIVATE_SENTINEL_9281") &&
        !html.includes("928193") &&
        !html.includes("928194"),
    );
  }
  await ref.update({ name: "Audit fresh preview two" });
  let html = await (
    await fetch(origin + "/product/seller:audit-social-only", {
      headers: { "user-agent": "WhatsApp" },
    })
  ).text();
  check(
    "same URL immediately reflects changed product",
    html.split("</head>")[0].includes("Audit fresh preview two"),
  );
  html = await (
    await fetch(origin + "/product/seller:audit-social-draft", {
      headers: { "user-agent": "WhatsApp" },
    })
  ).text();
  check(
    "draft remains private and unindexed",
    !html.includes("PRIVATE_DRAFT_9281") && html.includes("noindex"),
  );
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
    });
    const page = await context.newPage();
    await page.addInitScript(
      mobile
        ? () => {
            window.__shares = [];
            navigator.share = async (data) => {
              window.__shares.push(data);
            };
          }
        : () => {
            Object.defineProperty(navigator, "share", { value: undefined });
            Object.defineProperty(navigator, "clipboard", {
              value: { writeText: async (text) => (window.__copied = text) },
            });
            window.open = (...args) => {
              window.__opened = args;
            };
          },
    );
    await page.goto(
      origin + "/product/seller:audit-product-0001?tracking=private#old",
    );
    const share = page.getByRole("button", {
      name: "Share Audit Cake 0001",
      exact: true,
    });
    await share.waitFor();
    await share.click();
    if (mobile) {
      await page.waitForFunction(() => window.__shares.length === 1);
      const payload = await page.evaluate(() => window.__shares[0]);
      check(
        "native share gets clean product URL",
        payload.url === origin + "/product/seller%3Aaudit-product-0001",
      );
    } else {
      await page
        .getByRole("button", { name: "Copy product link", exact: true })
        .click();
      check(
        "desktop copies clean product URL",
        (await page.evaluate(() => window.__copied)) ===
          origin + "/product/seller%3Aaudit-product-0001",
      );
      await share.click();
      await page
        .getByRole("button", { name: "Share on WhatsApp", exact: true })
        .click();
      const opened = await page.evaluate(() => window.__opened);
      check(
        "WhatsApp uses clean encoded product link",
        decodeURIComponent(opened[0]).includes(
          origin + "/product/seller%3Aaudit-product-0001",
        ) && opened[2] === "noopener,noreferrer",
      );
    }
    await page.goto(origin);
    await page.getByText("Audit Cake 0000", { exact: true }).first().waitFor();
    const hero = page.locator('img[alt^="Artisanal cakes"]');
    await hero.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.images).some(
        (i) =>
          i.alt.startsWith("Artisanal cakes") &&
          i.complete &&
          i.naturalWidth > 0,
      ),
    );
    check(
      (mobile ? "mobile" : "desktop") + " uses responsive AVIF hero",
      (await hero.evaluate((i) => i.currentSrc)).includes("/img/hero/") &&
        (await hero.evaluate((i) => i.currentSrc)).endsWith(".avif"),
    );
    check(
      (mobile ? "mobile" : "desktop") + " has no horizontal overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await context.close();
  }
  await browser.close();
  await ref.delete();
  await draft.delete();
  await db.terminate();
  fs.writeFileSync(
    "/tmp/treatstory-audit/sharing-check.json",
    JSON.stringify({ checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
