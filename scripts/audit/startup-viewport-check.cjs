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
    for (const viewport of [
      { width: 393, height: 852 },
      { width: 852, height: 393 },
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile: true,
        deviceScaleFactor: 2,
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "standalone", { value: true });
        window.__viewportChanges = [];
        new MutationObserver((records) => {
          for (const record of records) {
            const node = record.target;
            if (node instanceof HTMLMetaElement && node.name === "viewport")
              window.__viewportChanges.push(node.content);
          }
        }).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["content"],
        });
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of ["/", "/products", "/about"]) {
        const response = await page.goto(origin + route, {
          waitUntil: "domcontentloaded",
        });
        assert.equal(response.status(), 200);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const meta = page.locator('meta[name="viewport"]');
        assert.equal(await meta.count(), 1);
        assert.match(await meta.getAttribute("content"), /viewport-fit=auto/);
        assert.ok(!(await meta.getAttribute("content")).includes("cover"));
        if (viewport.width < 768) {
          const dock = await page
            .getByRole("navigation", { name: "Mobile navigation", exact: true })
            .boundingBox();
          assert.ok(
            dock.x >= -1 &&
              dock.y >= 0 &&
              dock.x + dock.width <= viewport.width + 1 &&
              dock.y + dock.height <= viewport.height + 1,
          );
        } else {
          await page.getByRole("banner").waitFor();
          assert.equal(
            await page
              .getByRole("navigation", {
                name: "Mobile navigation",
                exact: true,
              })
              .count(),
            0,
          );
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.equal(
          await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
          0,
        );
        checks.push(
          `${viewport.width}x${viewport.height} ${route}: default viewport, visible navigation, no overflow or extra splash`,
        );
      }
      const values = await page.evaluate(() => window.__viewportChanges);
      assert.ok(values.every((value) => value.includes("viewport-fit=auto")));
      assert.equal(errors.length, 0, errors.join("\n"));
      await context.close();
    }
    fs.writeFileSync(
      "/tmp/treatstory-startup-viewport-checks.json",
      JSON.stringify(
        { physicalAndroidLaunchVerified: false, checks },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
