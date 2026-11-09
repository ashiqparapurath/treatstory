const { chromium } = require("playwright"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback demo audit required");
const fixture = JSON.parse(
    fs.readFileSync("/tmp/treatstory-audit/fixtures.json", "utf8"),
  ),
  origin = "http://127.0.0.1:9030";
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const rows = process.env.AUDIT_ROLES_ONLY
    ? JSON.parse(
        fs.readFileSync("/tmp/treatstory-audit/customer-flow.json", "utf8"),
      ).results.filter((r) => r.role === "buyer")
    : [];
  async function session(person, mobile) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
    });
    await context.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(origin + "/login?next=/account");
    await page.getByLabel("Email address", { exact: true }).fill(person.email);
    await page.getByLabel("Password", { exact: true }).fill(person.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/account");
    return { context, page };
  }
  for (const mobile of process.env.AUDIT_ROLES_ONLY ? [] : [false, true]) {
    let context, page;
    try {
      const s = await session(
        fixture.users.filter((u) => u.role === "buyer")[mobile ? 151 : 150],
        mobile,
      );
      context = s.context;
      const p = s.page;
      page = p;
      await p.getByRole("heading", { name: /Hello,/ }).waitFor();
      await p.goto(origin + "/product/seller:audit-product-0998");
      await p.getByRole("button", { name: "1 kg", exact: true }).click();
      await p
        .getByRole("button", {
          name: "Add Audit Cake 0998 to bag",
          exact: true,
        })
        .click();
      await p.goto(origin + "/cart");
      await p
        .getByRole("button", { name: "Increase Audit Cake 0998", exact: true })
        .click();
      assert.equal(
        await p.evaluate(
          () =>
            JSON.parse(localStorage.getItem("treatstory-cart-v2"))[0].quantity,
        ),
        2,
      );
      await p.goto(origin + "/product/seller:audit-product-0998");
      await p.getByRole("button", { name: "1 kg", exact: true }).click();
      await p
        .getByRole("button", { name: "Buy now", exact: true })
        .first()
        .click();
      await p.waitForURL("**/checkout?**");
      assert.ok((await p.evaluate(() => scrollY)) < 120);
      assert.equal(
        await p.evaluate(
          () =>
            JSON.parse(localStorage.getItem("treatstory-cart-v2"))[0].quantity,
        ),
        2,
      );
      await p.locator("input[type=date]").fill(fixture.date);
      await p.getByPlaceholder("e.g. 10 AM – 12 PM").fill("10 AM–12 PM");
      await p.locator("input[value=cod]").check();
      const responsePromise = p.waitForResponse(
        (r) =>
          r.url().endsWith("/api/checkout") && r.request().method() === "POST",
      );
      await p
        .getByRole("button", { name: "Place 1 order", exact: true })
        .click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const order = await response.json();
      assert.equal(order.orderIds.length, 1);
      assert.equal(order.total, 900);
      await p
        .getByRole("heading", { name: "Thank you for ordering!" })
        .waitFor();
      rows.push({
        role: "buyer",
        mobile,
        passed: true,
        scenarios: [
          "sign-in",
          "profile",
          "variant price",
          "add cart",
          "quantity update",
          "direct buy keeps cart unchanged",
          "checkout scroll reset",
          "saved address",
          "COD checkout",
          "authoritative 900 INR total",
          "confirmation",
        ],
      });
    } catch (e) {
      rows.push({
        role: "buyer",
        mobile,
        passed: false,
        error: e.message.slice(0, 300),
        url: page?.url(),
        pageText: page
          ? (await page.locator("body").innerText()).slice(0, 1400)
          : "",
      });
    } finally {
      await context?.close();
    }
  }
  for (const role of ["seller", "admin"]) {
    let context, page;
    try {
      const s = await session(
        role === "seller" ? fixture.sellers[0] : fixture.admins[0],
        false,
      );
      context = s.context;
      const p = s.page;
      page = p;
      await p.goto(
        origin +
          (role === "seller"
            ? "/seller/dashboard?section=products"
            : "/admin?tab=sellers"),
      );
      if (role === "seller") {
        await p
          .getByRole("heading", { name: "My products", exact: true })
          .waitFor();
        await p
          .getByRole("button", { name: /Edit Audit Cake/ })
          .first()
          .click();
        await p
          .getByLabel("Product name", { exact: true })
          .fill("Audit Cake browser edited");
        await p
          .locator("summary")
          .filter({ hasText: "Photos & gallery" })
          .click();
        await p
          .getByText("Or paste image URLs manually", { exact: true })
          .click();
        await p
          .locator("#creatorImages")
          .fill(
            "https://res.cloudinary.com/treatstory-audit/image/upload/audit-placeholder.svg",
          );
        const reply = p.waitForResponse(
          (r) =>
            r.url().endsWith("/api/seller/products") &&
            r.request().method() === "POST",
        );
        await p
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        assert.equal((await reply).status(), 200);
      } else
        await p
          .getByRole("button", { name: "Manage access", exact: true })
          .first()
          .waitFor();
      rows.push({
        role,
        mobile: false,
        passed: true,
        scenarios:
          role === "seller"
            ? ["authorized dashboard", "product editor", "server product save"]
            : ["authorized admin dashboard", "seller access controls"],
      });
    } catch (e) {
      rows.push({
        role,
        mobile: false,
        passed: false,
        error: e.message.slice(0, 300),
        url: page?.url(),
        pageText: page
          ? (await page.locator("body").innerText()).slice(0, 1400)
          : "",
      });
    } finally {
      await context?.close();
    }
  }
  await browser.close();
  const result = {
    passed: rows.every((r) => r.passed),
    results: rows,
    limitations:
      "Only loopback emulator data; no real mail, uploads or online payments.",
  };
  fs.writeFileSync(
    "/tmp/treatstory-audit/customer-flow.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
