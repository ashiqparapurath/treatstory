const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  sharp = require("sharp");
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
const { pwaLaunchScript } = load("src/lib/pwa-launch.ts");
function launch({ mode = false, standalone = false, referrer = "" } = {}) {
  const attributes = new Map(),
    timers = [];
  vm.runInNewContext(pwaLaunchScript, {
    matchMedia: () => ({ matches: mode }),
    navigator: { standalone },
    document: {
      referrer,
      documentElement: {
        setAttribute: (key, value) => attributes.set(key, value),
        removeAttribute: (key) => attributes.delete(key),
      },
    },
    setTimeout: (callback, ms) => timers.push({ callback, ms }),
  });
  return { attributes, timers };
}
test("ordinary browser visits never receive a launch cover or blocking timer", () => {
  const result = launch();
  assert.equal(result.attributes.size, 0);
  assert.equal(result.timers.length, 0);
});
test("installed launches get a first-paint cover and an independent failure deadline", () => {
  for (const context of [
    { mode: true },
    { standalone: true },
    { referrer: "android-app://com.example.treatstory" },
  ]) {
    const result = launch(context);
    assert.equal(result.attributes.get("data-pwa-launch"), "loading");
    assert.equal(result.timers[0].ms, 3000);
    result.timers[0].callback();
    assert.equal(result.attributes.size, 0);
  }
});
test("unsupported startup detection cannot block the page", () => {
  assert.doesNotThrow(() =>
    vm.runInNewContext(pwaLaunchScript, {
      matchMedia: () => {
        throw Error("Unavailable");
      },
    }),
  );
});
test("native startup images have declared portrait/landscape dimensions and match app background", async () => {
  const { pwaStartupImages } = load("src/lib/pwa-startup-images.ts"),
    branding = JSON.parse(fs.readFileSync("src/lib/pwa-branding.json")),
    manifest = JSON.parse(fs.readFileSync("public/manifest.json"));
  assert.equal(manifest.background_color, branding.background);
  assert.equal(manifest.theme_color, branding.background);
  assert.equal(
    new Set(pwaStartupImages.map((image) => image.media)).size,
    pwaStartupImages.length,
  );
  assert.equal(
    new Set(pwaStartupImages.map((image) => image.url)).size,
    pwaStartupImages.length,
  );
  for (const entry of pwaStartupImages) {
    const metadata = await sharp("public" + entry.url).metadata();
    assert.equal(metadata.width, entry.width);
    assert.equal(metadata.height, entry.height);
    assert.equal(metadata.format, "png");
    assert.ok(
      entry.media.includes(
        entry.width > entry.height ? "landscape" : "portrait",
      ),
    );
  }
  for (const entry of pwaStartupImages.slice(0, 2)) {
    const { data } = await sharp("public" + entry.url)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal("#" + Buffer.from(data).toString("hex"), branding.background);
  }
  assert.ok(
    fs
      .readFileSync("public" + branding.artwork, "utf8")
      .includes('viewBox="0 0 1562.000000 1007.000000"'),
  );
});

test("install icons and launcher background match the supplied splash, with safe adaptive padding", async () => {
  const branding = JSON.parse(fs.readFileSync("src/lib/pwa-branding.json")),
    manifest = JSON.parse(fs.readFileSync("public/manifest.json"));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /app-(192|512)(-maskable)?-[a-f0-9]{12}\.png$/);
    const metadata = await sharp("public" + icon.src).metadata();
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.hasAlpha, false);
    const { data } = await sharp("public" + icon.src)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal("#" + Buffer.from(data).toString("hex"), branding.background);
  }
  const mask = manifest.icons.find((icon) => icon.purpose === "maskable");
  const { data, info } = await sharp("public" + mask.src)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let pixels = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const at = (y * info.width + x) * 3;
      if (data[at] < 240 || data[at + 1] < 238 || data[at + 2] < 233) {
        pixels++;
        assert.ok(
          Math.hypot(x - (info.width - 1) / 2, y - (info.height - 1) / 2) <=
            info.width * 0.4,
          "wordmark must fit the central maskable safe circle",
        );
      }
    }
  assert.ok(pixels > 1000);
  for (const icon of manifest.icons) {
    const legacy =
      "public/icons/app-" +
      icon.sizes.split("x")[0] +
      (icon.purpose === "maskable" ? "-maskable" : "") +
      ".png";
    assert.equal(
      Buffer.compare(
        fs.readFileSync(legacy),
        fs.readFileSync("public" + icon.src),
      ),
      0,
    );
  }
});

test("route-loading fallback uses the exact splash artwork instead of the old app icon", () => {
  const branding = JSON.parse(fs.readFileSync("src/lib/pwa-branding.json"));
  const { default: Loading } = load("src/app/loading.tsx", {
    "@/lib/pwa-branding.json": branding,
  });
  const { PwaLaunchSplash } = load("src/components/pwa-launch-splash.tsx", {
    "@/lib/pwa-branding.json": branding,
  });
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  for (const component of [Loading, PwaLaunchSplash]) {
    const html = renderToStaticMarkup(React.createElement(component));
    assert.ok(html.includes('src="' + branding.artwork + '"'));
    assert.ok(html.includes('class="pwa-launch-artwork"'));
    assert.ok(html.includes("background-color:" + branding.background));
    assert.ok(!html.includes("/icons/app-192.png"));
  }
});

test("the refreshed browser icon contains valid PNG entries and the legacy URL matches", async () => {
  const { pwaIcons } = load("src/lib/pwa-icons.ts"),
    bytes = fs.readFileSync("public" + pwaIcons.favicon);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), 4);
  for (let i = 0; i < 4; i++) {
    const at = 6 + i * 16,
      size = bytes[at] || 256,
      length = bytes.readUInt32LE(at + 8),
      offset = bytes.readUInt32LE(at + 12);
    const metadata = await sharp(
      bytes.subarray(offset, offset + length),
    ).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
  assert.equal(Buffer.compare(bytes, fs.readFileSync("public/favicon.ico")), 0);
});
