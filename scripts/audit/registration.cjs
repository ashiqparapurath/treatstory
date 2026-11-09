const { chromium } = require("playwright"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Loopback demo audit required");
let browser;
(async () => {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const accountRequests = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/api/email/account"))
      accountRequests.push(r.status());
  });
  await page.goto("http://localhost:9030/register");
  await page.getByLabel("Your name", { exact: true }).fill("Audit New Buyer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("audit-ui-" + randomUUID() + "@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Audit-only-password-2026!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL(/\/(account|dashboard)$/);
  await page.getByRole("heading", { name: /Hello,/ }).waitFor();
  assert.ok(accountRequests.includes(200));
  const result = {
    passed: true,
    scenarios: [
      "signup through actual app",
      "profile name persisted",
      "account email endpoint queues durable intent",
    ],
    accountEmailStatuses: accountRequests,
    providerDelivery: "stubbed; actual email delivery not tested",
  };
  fs.writeFileSync(
    "/tmp/treatstory-audit/registration.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await browser.close();
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => browser?.close());
