const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server"),
  sharp = require("sharp");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback preview required");
const origin = "http://127.0.0.1:9032";
function load(file, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (id) => (id in mocks ? mocks[id] : require(id)),
    },
  );
  return module.exports;
}
const utils = load("src/lib/utils.ts"),
  skeleton = load("src/components/ui/skeleton.tsx", { "@/lib/utils": utils });
const { default: Loading } = load("src/app/loading.tsx", {
  "@/components/ui/skeleton": skeleton,
});
const loading = renderToStaticMarkup(React.createElement(Loading));
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
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("heading", { name: /Little finds/ }).waitFor();
    assert.equal(
      await page.locator(".pwa-launch-splash,[data-pwa-launch]").count(),
      0,
    );
    checks.push("installed page contains no second in-app splash");
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
    await page
      .getByRole("status", { name: "Loading page", exact: true })
      .waitFor();
    assert.equal(await page.locator("img").count(), 0);
    assert.ok(!(await page.locator("body").innerText()).includes("Since 2026"));
    await page.screenshot({ path: "/tmp/treatstory-native-only-loading.png" });
    checks.push(
      "route loading shows an unbranded page skeleton instead of another logo screen",
    );
    await page.goto(origin);
    const manifest = await (
      await page.request.get(origin + "/manifest.json")
    ).json();
    assert.ok(manifest.icons.every((icon) => icon.purpose === "any"));
    for (const icon of manifest.icons) {
      const response = await page.request.get(origin + icon.src);
      assert.equal(response.status(), 200);
      const { data } = await sharp(await response.body())
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(data[3], 0);
    }
    checks.push(
      "served Chrome manifest icons have transparent canvas and no advertised opaque maskable tile",
    );
    const apple = await page
        .locator('link[rel="apple-touch-icon"]')
        .getAttribute("href"),
      favicon = await page.locator('link[rel="icon"]').getAttribute("href");
    for (const path of [apple, favicon, "/icons/app-192.png", "/favicon.ico"])
      assert.equal(
        (await page.request.get(new URL(path, origin).href)).status(),
        200,
      );
    checks.push("Apple/favicon and stable legacy icon URLs remain available");
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
