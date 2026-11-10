const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  sharp = require("sharp");
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    { module, exports: module.exports },
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
