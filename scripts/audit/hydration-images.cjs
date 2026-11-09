const { chromium } = require("playwright"),
  fs = require("node:fs");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback staging required");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const results = [];
  for (const mobile of [false, true])
    for (let run = 0; run < 2; run++) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      if (mobile) {
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 200000,
          uploadThroughput: 93750,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      for (const path of [
        "/",
        "/products",
        "/product/seller:audit-product-0001",
      ]) {
        let failure;
        const errorStart = errors.length,
          start = Date.now();
        try {
          await page.goto("http://127.0.0.1:9030" + path, {
            waitUntil: "domcontentloaded",
          });
          await page
            .getByText(
              path.includes("/product/")
                ? "Audit Cake 0001"
                : "Audit Cake 0000",
              { exact: true },
            )
            .first()
            .waitFor({ timeout: 45000 });
          await page.waitForTimeout(700);
        } catch (e) {
          failure = e.message.slice(0, 180);
        }
        const measures = await page.evaluate(() => {
          const image = Array.from(document.images).find((i) =>
            i.alt.startsWith("Artisanal cakes"),
          );
          const resource =
            image &&
            performance
              .getEntriesByType("resource")
              .find((r) => r.name === image.currentSrc);
          return {
            lcpMs: window.__lcp,
            hero: image
              ? {
                  url: image.currentSrc,
                  complete: image.complete,
                  naturalWidth: image.naturalWidth,
                  width: Math.round(image.getBoundingClientRect().width),
                  bytes: resource?.encodedBodySize,
                  transferBytes: resource?.transferSize,
                }
              : null,
          };
        });
        results.push({
          path,
          mobile,
          run,
          elapsedMs: Date.now() - start,
          ...measures,
          hydrationErrors: errors
            .slice(errorStart)
            .filter((e) => /hydration|React error #418/i.test(e)),
          otherErrors: errors
            .slice(errorStart)
            .filter((e) => !/hydration|React error #418/i.test(e)),
          failure,
        });
        console.log(
          JSON.stringify({
            path,
            mobile,
            run,
            elapsedMs: Date.now() - start,
            hydrationErrors: errors
              .slice(errorStart)
              .filter((e) => /hydration|React error #418/i.test(e)).length,
          }),
        );
      }
      await context.close();
    }
  await browser.close();
  const output =
    process.env.AUDIT_IMAGE_OUTPUT ||
    "/tmp/treatstory-audit/hydration-images-after.json";
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        conditions: {
          origin: "loopback demo emulators",
          mobile: { latencyMs: 150, downMbps: 1.6, cpuSlowdown: 4, dpr: 2 },
          desktop: { width: 1440, dpr: 1 },
          concurrentLoad: false,
        },
        results,
      },
      null,
      2,
    ),
  );
  if (
    process.env.AUDIT_EXPECT_HYDRATION_ERRORS !== "true" &&
    results.some(
      (r) => r.hydrationErrors.length || r.otherErrors.length || r.failure,
    )
  )
    process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
