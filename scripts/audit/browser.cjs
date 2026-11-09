const { chromium } = require("playwright"),
  fs = require("node:fs");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Audit browser runs only against loopback staging");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const results = [];
  for (const mobile of [false, true])
    for (
      let run = 0;
      run <
      Math.max(1, Math.min(3, Number(process.env.AUDIT_BROWSER_RUNS || 3)));
      run++
    ) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
        deviceScaleFactor: mobile ? 2 : 1,
      });
      let blocked = 0;
      const errors = [];
      await context.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (!["127.0.0.1", "localhost"].includes(u.hostname)) {
          blocked++;
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      if (mobile) {
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 1_600_000 / 8,
          uploadThroughput: 750_000 / 8,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      await page.addInitScript(() => {
        window.__auditLcp = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__auditLcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      for (const [path, selector] of [
        ["/", "text=Audit Cake 0000"],
        ["/products", "text=Audit Cake 0000"],
        ["/product/seller:audit-product-0001", "h1"],
      ]) {
        const start = Date.now();
        let failure;
        try {
          await page.goto("http://127.0.0.1:9030" + path, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
          await page
            .locator(selector)
            .first()
            .waitFor({ state: "visible", timeout: 60000 });
          if (path.includes("/product/"))
            await page
              .getByRole("button", { name: "Buy now", exact: true })
              .first()
              .waitFor({ state: "visible", timeout: 10000 });
        } catch (e) {
          failure = e.message.slice(0, 160);
        }
        const usableMs = Date.now() - start;
        const timing = await page.evaluate(() => ({
          lcpMs: window.__auditLcp,
          navigation: performance.getEntriesByType("navigation").map((n) => ({
            ttfb: n.responseStart,
            domContentLoaded: n.domContentLoadedEventEnd,
          })),
          resources: performance
            .getEntriesByType("resource")
            .reduce((a, r) => a + r.transferSize, 0),
        }));
        results.push({
          mobile,
          run,
          path,
          usableMs,
          startedAt: new Date(start).toISOString(),
          ...timing,
          failure,
          errors: [...errors],
          blockedExternalRequests: blocked,
        });
        console.log(JSON.stringify({ mobile, run, path, usableMs, failure }));
      }
      await context.close();
    }
  await browser.close();
  fs.writeFileSync(
    "/tmp/treatstory-audit/browser-results.json",
    JSON.stringify(
      {
        conditions: {
          mobile: {
            latencyMs: 150,
            downloadMbps: 1.6,
            uploadKbps: 750,
            cpuSlowdown: 4,
          },
          images: "local synthetic fixtures; no production CDN",
          origin: "http://127.0.0.1:9030",
        },
        results,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
