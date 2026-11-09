const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
const { chromium } = require("playwright"),
  { initializeApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore");
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080"
)
  throw Error("Loopback demo required");
const fixture = JSON.parse(
  fs.readFileSync("/tmp/treatstory-audit/fixtures.json", "utf8"),
);
assert.equal(fixture.project, "demo-treatstory-audit");
const person = fixture.users.filter((u) => u.role === "buyer")[190],
  other = fixture.users.filter((u) => u.role === "buyer")[191],
  origin = "http://127.0.0.1:9030";
(async () => {
  const db = getFirestore(
      initializeApp({ projectId: "demo-treatstory-audit" }, "address-check"),
    ),
    legacy = db.doc("customer_addresses/" + person.uid),
    bookRef = db.doc("customer_address_books/" + person.uid),
    oldLegacy = await legacy.get(),
    oldBook = await bookRef.get(),
    checks = [];
  let browser;
  const home = {
      recipient: "Audit Home",
      phone: "9876543210",
      line1: "House 123 Main Street",
      locality: "Town",
      district: "Kozhikode",
      state: "Kerala",
      pincode: "673001",
    },
    office = {
      ...home,
      recipient: "Audit Office",
      line1: "Office 456 Market Road",
      pincode: "680001",
    },
    officeId = randomUUID();
  async function token(user) {
    const r = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=audit-public-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(r.status, 200);
    return (await r.json()).idToken;
  }
  try {
    await legacy.set(home);
    await bookRef.delete();
    const auth = await token(person),
      foreign = await token(other);
    async function action(body, expected = 200, credential = auth) {
      const r = await fetch(origin + "/api/addresses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(credential ? { Authorization: "Bearer " + credential } : {}),
        },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, expected, await r.clone().text());
      return r.json();
    }
    await action({ action: "remove", id: "legacy" }, 401, null);
    await action(
      { action: "save", id: officeId, address: office, uid: other.uid },
      400,
    );
    await action(
      { action: "save", id: officeId, address: { ...office, pincode: "123" } },
      400,
    );
    checks.push(
      "unauthenticated, forged-owner and invalid-PIN mutations rejected",
    );
    let book = await action({ action: "save", id: officeId, address: office });
    assert.equal(book.addresses.length, 2);
    assert.equal(book.defaultId, "legacy");
    book = await action({ action: "save", id: officeId, address: office });
    assert.equal(book.addresses.length, 2);
    checks.push(
      "legacy default preserved and repeat saves do not duplicate addresses",
    );
    await Promise.all(
      [1, 2].map((i) =>
        action({
          action: "save",
          id: randomUUID(),
          address: { ...home, recipient: "Concurrent " + i },
        }),
      ),
    );
    assert.equal((await bookRef.get()).data().addresses.length, 4);
    checks.push("concurrent adds preserve both addresses");
    await action({ action: "default", id: officeId });
    assert.equal((await legacy.get()).data().recipient, "Audit Office");
    await action({ action: "remove", id: officeId });
    assert.equal((await legacy.get()).data().recipient, "Audit Home");
    checks.push(
      "setting/removing default atomically updates the compatible default document",
    );
    for (let i = 3; i < 10; i++)
      await action({
        action: "save",
        id: randomUUID(),
        address: { ...home, recipient: "Limit " + i },
      });
    await action({ action: "save", id: randomUUID(), address: office }, 409);
    checks.push("address book bounded at 10 entries");
    const url =
      "http://127.0.0.1:8080/v1/projects/demo-treatstory-audit/databases/(default)/documents/customer_address_books/" +
      person.uid;
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer " + auth } }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(url, { headers: { Authorization: "Bearer " + foreign } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: { defaultId: { stringValue: "forged" } },
          }),
        })
      ).status,
      403,
    );
    checks.push(
      "actual rules permit owner reads and reject foreign reads/direct writes",
    );
    await bookRef.delete();
    await legacy.set(home);
    await action({ action: "save", id: officeId, address: office });
    await db.doc("geocoding_limits/service").delete();
    await db.doc("geocoding_limits/user_" + person.uid).delete();
    const geo = await fetch(origin + "/api/addresses/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify({ latitude: 11.2588, longitude: 75.7804 }),
    });
    assert.equal(geo.status, 200);
    assert.equal((await geo.json()).pincode, "673001");
    const limited = await fetch(origin + "/api/addresses/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify({ latitude: 11.2588, longitude: 75.7804 }),
    });
    assert.equal(limited.status, 429);
    assert.equal(
      (await db.doc("geocoding_limits/service").get()).data().latitude,
      undefined,
    );
    const invalidGeo = await fetch(origin + "/api/addresses/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify({ latitude: 91, longitude: 75 }),
    });
    assert.equal(invalidGeo.status, 400);
    checks.push(
      "location endpoint validates coordinates, rate-limits provider calls and does not store coordinates",
    );
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      permissions: ["geolocation"],
      geolocation: { latitude: 11.2588, longitude: 75.7804 },
    });
    await context.addInitScript(() =>
      sessionStorage.setItem("treatstory:install-dismissed", "1"),
    );
    await context.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    await context.route("**/api/addresses/location", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    const page = await context.newPage();
    await page.goto(origin + "/login?next=/account");
    await page.getByLabel("Email address", { exact: true }).fill(person.email);
    await page.getByLabel("Password", { exact: true }).fill(person.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/account");
    await page.getByRole("link", { name: "Wishlist", exact: false }).waitFor();
    await page
      .getByRole("heading", { name: "Saved delivery addresses" })
      .waitFor();
    await page
      .getByRole("button", { name: "Add new address", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Recipient name", { exact: true })
      .fill("Audit Gift");
    await dialog.getByLabel("Phone number", { exact: true }).fill("9876543210");
    await dialog
      .getByLabel("House / building, street", { exact: true })
      .fill("Gift House 789 Park Road");
    await dialog
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await dialog
      .getByLabel("Locality / post office", { exact: true })
      .fill("Buyer edited area");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("label")).some(
        (l) =>
          l.textContent.includes("District") &&
          l.querySelector("input")?.value === "Kozhikode",
      ),
    );
    assert.equal(
      await dialog
        .getByLabel("House / building, street", { exact: true })
        .inputValue(),
      "Gift House 789 Park Road",
    );
    assert.equal(
      await dialog.getByLabel("PIN code", { exact: true }).inputValue(),
      "673001",
    );
    assert.equal(
      await dialog
        .getByLabel("Locality / post office", { exact: true })
        .inputValue(),
      "Buyer edited area",
    );
    checks.push(
      "granted location suggests area/PIN and preserves house/street and edits made during lookup",
    );
    await dialog.getByLabel("PIN code", { exact: true }).fill("695001");
    await dialog
      .getByLabel("Locality / post office", { exact: true })
      .fill("Town");
    await dialog
      .getByLabel("District", { exact: true })
      .fill("Thiruvananthapuram");
    await dialog.getByLabel("State", { exact: true }).fill("Kerala");
    await dialog
      .getByRole("button", { name: "Save address", exact: true })
      .click();
    await page.getByText("Audit Gift", { exact: true }).waitFor();
    checks.push(
      "mobile profile shows Wishlist and saves an additional address in a popup",
    );
    await page
      .getByRole("button", { name: "Add new address", exact: true })
      .click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_success, failure) => failure({ code: 1 }),
        },
      }),
    );
    await page
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await page
      .getByText("Location access was not allowed", { exact: true })
      .waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    checks.push("permission denial leaves manual address entry available");
    await page.goto(origin + "/product/seller:audit-product-0998");
    await page
      .getByRole("button", { name: "Buy now", exact: true })
      .first()
      .click();
    await page.waitForURL("**/checkout?**");
    await page
      .getByRole("button", { name: "Change address", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Deliver to Audit Office, 680001",
        exact: true,
      })
      .click();
    await page.getByText("PIN 680001", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Change address", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Deliver to Audit Gift, 695001",
        exact: true,
      })
      .click();
    await page.getByText("PIN 695001", { exact: true }).waitFor();
    assert.equal((await legacy.get()).data().recipient, "Audit Home");
    checks.push(
      "checkout switches name/phone/address/PIN without changing the saved default",
    );
    await page
      .getByRole("button", { name: "Change address", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Enter address for this order only",
        exact: true,
      })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill("One Order Guest");
    await page.getByLabel("Delivery PIN code", { exact: true }).fill("682001");
    await page
      .getByRole("button", { name: "Use this address", exact: true })
      .click();
    await action({ action: "default", id: officeId });
    await page.getByText("PIN 682001", { exact: true }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(
      await page.getByText("PIN 682001", { exact: true }).count(),
      1,
    );
    checks.push("one-order override survives live default changes");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await context.close();
    await action({ action: "remove", id: officeId });
    let current = (await bookRef.get()).data();
    for (const entry of current.addresses)
      await action({ action: "remove", id: entry.id });
    assert.equal((await legacy.get()).exists, false);
    assert.equal((await bookRef.get()).data().addresses.length, 0);
    checks.push("removing last address clears default safely");
    fs.writeFileSync(
      "/tmp/treatstory-address-checks.json",
      JSON.stringify({ checks }, null, 2),
    );
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    if (browser) await browser.close();
    if (oldLegacy.exists) await legacy.set(oldLegacy.data());
    else await legacy.delete();
    if (oldBook.exists) await bookRef.set(oldBook.data());
    else await bookRef.delete();
    await db.terminate();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
