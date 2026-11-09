const { chromium } = require("playwright"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback demo only");
const fixture = JSON.parse(
    fs.readFileSync("/tmp/treatstory-audit/fixtures.json", "utf8"),
  ),
  origin = "http://127.0.0.1:9030";
(async () => {
  const browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    }),
    checks = [];
  async function session(init, mobile = true, opts = {}) {
    const c = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      ...opts,
    });
    await c.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    if (init) await c.addInitScript(init);
    return { c, p: await c.newPage() };
  }
  let { c, p } = await session(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      value: undefined,
    });
    Object.defineProperty(navigator, "share", { value: undefined });
  });
  await p.goto(origin + "/product/seller:audit-product-0001");
  await p.getByRole("region", { name: "Install TreatStory" }).waitFor();
  checks.push("uninstalled browser receives install notice");
  await p.getByRole("button", { name: "Dismiss install notification" }).click();
  await p.reload();
  await p
    .getByRole("heading", { name: "Audit Cake 0001", exact: true })
    .waitFor();
  assert.equal(
    await p.getByRole("region", { name: "Install TreatStory" }).count(),
    0,
  );
  checks.push("dismissal survives navigation and reload in the session");
  const share = p.getByRole("button", {
    name: "Share Audit Cake 0001",
    exact: true,
  });
  const bounds = await share.boundingBox(),
    photo = await p
      .getByAltText("Audit Cake 0001 photo 1", { exact: true })
      .boundingBox();
  assert.ok(
    bounds.x >= photo.x + photo.width - 65 &&
      bounds.y >= photo.y &&
      bounds.y < photo.y + 60,
  );
  assert.equal(bounds.width, 44);
  await share.click();
  await p
    .getByRole("button", { name: "Copy product link", exact: true })
    .waitFor();
  checks.push(
    "mobile 44px share icon sits in image top-right and opens sharing",
  );
  await p.goto(origin + "/about");
  const story = p.getByAltText(
    "Homemade cakes, cookies and handmade gifts from independent makers",
  );
  await story.scrollIntoViewIfNeeded();
  await p.waitForFunction(() => {
    const i = document.querySelector('img[alt^="Homemade cakes"]');
    return i?.complete && i.naturalWidth > 0;
  });
  assert.ok((await story.getAttribute("src")).includes("landing-hero"));
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  checks.push("mobile story image loads and matches cakes/handmade gifts");
  await c.close();
  ({ c, p } = await session(() =>
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      value: undefined,
    }),
  ));
  await p.goto(origin);
  await p.getByRole("region", { name: "Install TreatStory" }).waitFor();
  await p.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    window.__prompts = 0;
    e.prompt = async () => {
      window.__prompts++;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await p
    .getByRole("button", { name: "Install TreatStory", exact: true })
    .waitFor();
  assert.equal(await p.evaluate(() => window.__prompts), 0);
  await p
    .getByRole("button", { name: "Install TreatStory", exact: true })
    .click();
  await p.waitForFunction(
    () => !document.querySelector('aside[aria-label="Install TreatStory"]'),
  );
  assert.equal(await p.evaluate(() => window.__prompts), 1);
  await p.reload();
  await p.getByRole("heading", { name: /Little finds/ }).waitFor();
  assert.equal(
    await p.getByRole("region", { name: "Install TreatStory" }).count(),
    0,
  );
  checks.push(
    "native prompt opens only from tap and accepted install stays hidden",
  );
  await c.close();
  for (const kind of ["standalone", "related", "ios", "race", "remembered"]) {
    ({ c, p } = await session(
      kind === "standalone"
        ? () => Object.defineProperty(navigator, "standalone", { value: true })
        : kind === "related"
          ? () =>
              Object.defineProperty(navigator, "getInstalledRelatedApps", {
                value: async () => [
                  {
                    platform: "webapp",
                    url: location.origin + "/manifest.json",
                  },
                ],
              })
          : kind === "remembered"
            ? () => {
                localStorage.setItem("treatstory:app-installed", "1");
                Object.defineProperty(navigator, "getInstalledRelatedApps", {
                  value: async () => [],
                });
              }
            : kind === "race"
              ? () =>
                  Object.defineProperty(navigator, "getInstalledRelatedApps", {
                    value: () =>
                      new Promise(
                        (resolve) => (window.__relatedResolve = resolve),
                      ),
                  })
              : () =>
                  Object.defineProperty(navigator, "getInstalledRelatedApps", {
                    value: undefined,
                  }),
      true,
      kind === "ios"
        ? {
            userAgent:
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
          }
        : {},
    ));
    await p.goto(origin);
    await p.getByRole("heading", { name: /Little finds/ }).waitFor();
    if (kind === "ios") {
      await p
        .getByText("In Safari, tap Share, then Add to Home Screen.", {
          exact: true,
        })
        .waitFor();
      checks.push("iPhone receives Add to Home Screen instructions");
    } else {
      if (kind === "race") {
        await p.waitForFunction(
          () => typeof window.__relatedResolve === "function",
        );
        await p.evaluate(() => {
          window.dispatchEvent(new Event("appinstalled"));
          window.__relatedResolve([]);
        });
        await p.waitForTimeout(150);
      }
      assert.equal(
        await p.getByRole("region", { name: "Install TreatStory" }).count(),
        0,
      );
      checks.push(kind + " installed detection hides notice");
    }
    await c.close();
  }
  for (const role of ["buyer", "seller", "admin"]) {
    const person = fixture.users.find((u) => u.role === role);
    ({ c, p } = await session(() =>
      sessionStorage.setItem("treatstory:install-dismissed", "1"),
    ));
    await p.goto(origin + "/login?next=/account");
    await p.getByLabel("Email address", { exact: true }).fill(person.email);
    await p.getByLabel("Password", { exact: true }).fill(person.password);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p.waitForURL("**/account");
    const sell = p
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Sell", exact: true });
    const destination =
      role === "admin"
        ? "/admin"
        : role === "seller"
          ? "/seller/dashboard"
          : "/become-a-seller";
    await p.waitForFunction(
      (expected) =>
        Array.from(
          document.querySelectorAll('nav[aria-label="Mobile navigation"] a'),
        ).some(
          (a) =>
            a.textContent === "Sell" && a.getAttribute("href") === expected,
        ),
      destination,
    );
    await sell.click();
    await p.waitForURL(origin + destination);
    checks.push(role + " mobile Sell opens " + destination);
    await c.close();
  }
  ({ c, p } = await session(
    () => sessionStorage.setItem("treatstory:install-dismissed", "1"),
    false,
  ));
  await p.goto(origin + "/product/seller:audit-product-0001");
  await p
    .getByRole("button", { name: "Share Audit Cake 0001", exact: true })
    .waitFor();
  assert.equal(
    (
      await p
        .getByRole("button", { name: "Share Audit Cake 0001", exact: true })
        .innerText()
    ).trim(),
    "Share",
  );
  checks.push("desktop retains labelled share button");
  await c.close();
  await browser.close();
  fs.writeFileSync(
    "/tmp/treatstory-mobile-ux-results.json",
    JSON.stringify({ checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
