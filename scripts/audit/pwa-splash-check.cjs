const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback preview required");
const origin = "http://127.0.0.1:9032",
  checks = [];
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "standalone", { value: true });
        window.__launchStates = [];
        new MutationObserver((records) => {
          for (const record of records)
            if (record.attributeName === "data-pwa-launch")
              window.__launchStates.push(
                document.documentElement.getAttribute("data-pwa-launch") ||
                  "hidden",
              );
        }).observe(document, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-pwa-launch"],
        });
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
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
      const cover = page.getByRole("status", {
        name: "Opening TreatStory",
        exact: true,
      });
      await cover.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const image = document.querySelector(".pwa-launch-splash img");
        return image?.complete && image.naturalWidth > 0;
      });
      assert.equal(
        await cover.evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(250, 248, 243)",
      );
      const frame = await cover.boundingBox();
      assert.equal(
        frame.width,
        await page.evaluate(() => document.documentElement.clientWidth),
      );
      assert.equal(frame.height, mobile ? 844 : 900);
      await page.screenshot({
        path:
          "/tmp/treatstory-splash-" + (mobile ? "mobile" : "desktop") + ".png",
      });
      checks.push(
        (mobile ? "mobile" : "desktop") +
          " installed launch paints supplied artwork on matching full-screen background before hydration",
      );
      release = true;
      await Promise.all(waiting.map((resume) => resume()));
      await page.waitForFunction(
        () => !document.documentElement.hasAttribute("data-pwa-launch"),
      );
      assert.ok(
        (await page.evaluate(() => window.__launchStates)).includes("ready"),
      );
      assert.equal(errors.length, 0, errors.join("\n"));
      await page.getByRole("heading", { name: /Little finds/ }).waitFor();
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
      assert.equal(await cover.count(), 0);
      checks.push(
        (mobile ? "mobile" : "desktop") +
          " splash clears after hydration, installed notice stays hidden and navigation does not replay splash",
      );
      await context.close();
    }
    let context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await context.newPage();
    const artworkRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("/splash/"))
        artworkRequests.push(request.url());
    });
    await page.goto(origin);
    await page.getByRole("heading", { name: /Little finds/ }).waitFor();
    assert.equal(
      await page
        .getByRole("status", { name: "Opening TreatStory", exact: true })
        .count(),
      0,
    );
    assert.equal(artworkRequests.length, 0);
    checks.push(
      "ordinary browser visit shows no splash and downloads no launch artwork",
    );
    const startup = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .count();
    assert.equal(startup, 42);
    assert.equal(
      await page
        .locator('meta[name="apple-mobile-web-app-capable"]')
        .getAttribute("content"),
      "yes",
    );
    const first = page.locator('link[rel="apple-touch-startup-image"]').first();
    const response = await page.request.get(
      new URL(await first.getAttribute("href"), origin).href,
    );
    assert.equal(response.status(), 200);
    assert.ok(response.headers()["content-type"].includes("image/png"));
    checks.push(
      "HTML declares installed iOS support and all 42 startup-image links; image is served as PNG",
    );
    await context.close();
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "standalone", { value: true }),
    );
    page = await context.newPage();
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    const start = Date.now();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("status", { name: "Opening TreatStory", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-pwa-launch"),
    );
    assert.ok(Date.now() - start < 5000);
    checks.push(
      "blocked application scripts cannot leave a stuck launch cover",
    );
    await context.close();
    context = await browser.newContext({ javaScriptEnabled: false });
    page = await context.newPage();
    await page.goto(origin);
    assert.equal(await page.locator(".pwa-launch-splash").isVisible(), false);
    checks.push("JavaScript-disabled browser is never covered by the splash");
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
