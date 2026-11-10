const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback preview required");
const origin = "http://127.0.0.1:9032",
  branding = JSON.parse(fs.readFileSync("src/lib/pwa-branding.json", "utf8"));
const moduleCopy = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/app/loading.tsx", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText,
  {
    module: moduleCopy,
    exports: moduleCopy.exports,
    require: (id) =>
      id === "@/lib/pwa-branding.json" ? branding : require(id),
  },
);
const loading = renderToStaticMarkup(
  React.createElement(moduleCopy.exports.default),
);
(async () => {
  const browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    }),
    checks = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "standalone", { value: true }),
    );
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
    await page.waitForFunction(() => {
      const i = document.querySelector(".pwa-launch-splash img");
      return i?.complete && i.naturalWidth > 0;
    });
    const splash = page.locator(".pwa-launch-splash"),
      image = splash.locator("img"),
      splashBounds = await image.boundingBox(),
      background = await splash.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
    await page.screenshot({ path: "/tmp/treatstory-matching-splash.png" });
    release = true;
    await Promise.all(waiting.map((fn) => fn()));
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-pwa-launch"),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    checks.push(
      "installed launch uses the supplied artwork and clears without hydration errors",
    );
    const css = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) =>
        links
          .map((link) => `<link rel="stylesheet" href="${link.href}">`)
          .join(""),
      );
    await page.route("**/__loading-preview", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body>${loading}</body></html>`,
      }),
    );
    await page.goto(origin + "/__loading-preview");
    const fallback = page.getByRole("status", {
      name: "Loading TreatStory",
      exact: true,
    });
    await fallback.locator("img").waitFor();
    await page.waitForFunction(() => {
      const i = document.querySelector("main img");
      return i?.complete && i.naturalWidth > 0;
    });
    const bounds = await fallback.locator("img").boundingBox();
    assert.equal(
      await fallback.locator("img").getAttribute("src"),
      branding.artwork,
    );
    assert.equal(
      await fallback.evaluate((node) => getComputedStyle(node).backgroundColor),
      background,
    );
    for (const key of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(bounds[key] - splashBounds[key]) <= 1,
        key + " artwork bounds should remain continuous",
      );
    assert.equal(await fallback.getByRole("img").count(), 1);
    await page.screenshot({ path: "/tmp/treatstory-matching-loading.png" });
    checks.push(
      "actual route-loading component has the same artwork, scale, position and background as the splash",
    );
    await page.goto(origin);
    const manifestResponse = await page.request.get(origin + "/manifest.json"),
      manifest = await manifestResponse.json();
    assert.equal(manifest.background_color, branding.background);
    assert.equal(manifest.theme_color, branding.background);
    for (const icon of manifest.icons) {
      assert.match(icon.src, /-[a-f0-9]{12}\.png$/);
      const response = await page.request.get(origin + icon.src);
      assert.equal(response.status(), 200);
      assert.ok(response.headers()["content-type"].includes("image/png"));
    }
    checks.push(
      "manifest selects the new versioned regular and Android maskable artwork on the shared background",
    );
    const apple = await page
        .locator('link[rel="apple-touch-icon"]')
        .getAttribute("href"),
      favicon = await page.locator('link[rel="icon"]').getAttribute("href");
    assert.match(apple, /app-180-[a-f0-9]{12}\.png$/);
    assert.match(favicon, /favicon-[a-f0-9]{12}\.ico$/);
    assert.equal(
      (await page.request.get(new URL(apple, origin).href)).status(),
      200,
    );
    assert.equal(
      (await page.request.get(new URL(favicon, origin).href)).status(),
      200,
    );
    assert.equal(
      (await page.request.get(origin + "/icons/app-192.png")).status(),
      200,
    );
    assert.equal(
      (await page.request.get(origin + "/favicon.ico")).status(),
      200,
    );
    checks.push(
      "Apple/browser metadata references refreshed artwork while old icon URLs remain valid",
    );
    await context.close();
    fs.writeFileSync(
      "/tmp/treatstory-matching-branding-checks.json",
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
