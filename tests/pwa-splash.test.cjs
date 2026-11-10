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
test("root layout does not inject a second in-app splash or artwork preload", () => {
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(!layout.includes("PwaLaunchSplash"));
  assert.ok(!layout.includes("pwaLaunchScript"));
  assert.ok(!layout.includes('as="image" href={branding.artwork}'));
  assert.ok(layout.includes("pwaStartupImages"));
  assert.ok(layout.includes("pwaIcons"));
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

test("Chrome launcher icons have transparent canvas while Apple and legacy adaptive assets stay valid", async () => {
  const branding = JSON.parse(fs.readFileSync("src/lib/pwa-branding.json")),
    manifest = JSON.parse(fs.readFileSync("public/manifest.json"));
  assert.ok(manifest.icons.every((icon) => icon.purpose === "any"));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /app-(192|512)(-maskable)?-[a-f0-9]{12}\.png$/);
    const metadata = await sharp("public" + icon.src).metadata();
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.hasAlpha, true);
    const { data } = await sharp("public" + icon.src)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(data.length, 4);
    assert.equal(data[3], 0);
    const pixels = await sharp("public" + icon.src)
      .ensureAlpha()
      .raw()
      .toBuffer();
    let clear = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) clear++;
      else if (pixels[i + 3] > 8)
        assert.ok(
          pixels[i] < 10 && pixels[i + 1] < 10 && pixels[i + 2] < 10,
          "only logo ink may be opaque; no colored tile",
        );
    }
    assert.ok(clear > size * size * 0.7);
  }
  const { pwaIcons } = load("src/lib/pwa-icons.ts");
  const apple = await sharp("public" + pwaIcons.apple)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.equal("#" + apple.toString("hex"), branding.background);
  const mask = { src: pwaIcons.maskable };
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

test("route loading is a neutral skeleton without another full-screen logo", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { default: Loading } = load("src/app/loading.tsx", {
    "@/components/ui/skeleton": {
      Skeleton: (props) => React.createElement("div", props),
    },
  });
  const html = renderToStaticMarkup(React.createElement(Loading));
  assert.ok(html.includes('aria-label="Loading page"'));
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("/splash/"));
  assert.ok(!html.includes("/icons/"));
  assert.ok(!html.includes("Since 2026"));
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
