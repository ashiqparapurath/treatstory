const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback preview required");
const origin = "http://127.0.0.1:9032";
(async () => {
  const browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    }),
    checks = [];
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
      });
      await context.addInitScript(() =>
        Object.defineProperty(navigator, "standalone", { value: true }),
      );
      const page = await context.newPage(),
        errors = [],
        images = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.url().includes("/splash/treatstory.svg"))
          images.push(request.url());
      });
      let release = false;
      const waiting = [];
      await page.route("**/_next/static/**/*.js", (route) =>
        release
          ? route.continue()
          : new Promise((resolve) =>
              waiting.push(async () => {
                await route.continue();
                resolve();
              }),
            ),
      );
      await page.goto(origin, { waitUntil: "commit" });
      await page.getByRole("heading", { name: /Little finds/ }).waitFor();
      assert.equal(
        await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
        0,
      );
      assert.equal(images.length, 0);
      checks.push(
        (mobile ? "mobile" : "desktop") +
          " installed page has no second splash before hydration",
      );
      release = true;
      await Promise.all(waiting.map((fn) => fn()));
      await page.waitForFunction(() => document.readyState === "complete");
      assert.equal(
        await page
          .getByRole("region", { name: "Install TreatStory", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("link", { name: "Explore the collection", exact: true })
        .click();
      await page.waitForURL("**/products");
      assert.equal(
        await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
        0,
      );
      assert.equal(images.length, 0);
      assert.equal(errors.length, 0, errors.join("\n"));
      checks.push(
        (mobile ? "mobile" : "desktop") +
          " installed navigation has no logo replay or hydration errors",
      );
      await context.close();
    }
    let context = await browser.newContext(),
      page = await context.newPage();
    const startupRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("/splash/"))
        startupRequests.push(request.url());
    });
    await page.goto(origin);
    await page.getByRole("heading", { name: /Little finds/ }).waitFor();
    assert.equal(
      await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
      0,
    );
    assert.equal(startupRequests.length, 0);
    checks.push(
      "regular browser has no splash cover or splash-artwork downloads",
    );
    assert.equal(
      await page.locator('link[rel="apple-touch-startup-image"]').count(),
      42,
    );
    assert.equal(
      await page
        .locator('meta[name="apple-mobile-web-app-capable"]')
        .getAttribute("content"),
      "yes",
    );
    const image = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .first()
      .getAttribute("href");
    assert.equal(
      (await page.request.get(new URL(image, origin).href)).status(),
      200,
    );
    checks.push(
      "native iOS startup declarations and PNG resource remain available",
    );
    await context.close();
    context = await browser.newContext();
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "standalone", { value: true }),
    );
    page = await context.newPage();
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Little finds/ }).waitFor();
    assert.equal(
      await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
      0,
    );
    checks.push(
      "blocked application scripts cannot create or strand a launch cover",
    );
    await context.close();
    context = await browser.newContext({ javaScriptEnabled: false });
    page = await context.newPage();
    await page.goto(origin);
    assert.equal(
      await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
      0,
    );
    checks.push("JavaScript-disabled browser has no launch cover");
    await context.close();
    fs.writeFileSync(
      "/tmp/treatstory-pwa-splash-checks.json",
      JSON.stringify({ checks }, null, 2) + "\n",
    );
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
