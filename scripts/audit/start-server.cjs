const { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  path = require("node:path");
if (
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Audit server requires explicit loopback emulators");
const dir = process.env.AUDIT_OUTPUT || "/tmp/treatstory-audit";
const env = {
  ...process.env,
  NODE_ENV: "production",
  TREATSTORY_AUDIT: "local-only",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-treatstory-audit",
  FIREBASE_SERVICE_ACCOUNT_JSON: fs.readFileSync(
    dir + "/fixture-service-account.json",
    "utf8",
  ),
  APP_URL: "http://127.0.0.1:9030",
  APPS_SCRIPT_MAIL_URL:
    "https://script.google.com/macros/s/treatstory-audit/exec",
  APPS_SCRIPT_MAIL_SECRET: "audit-only-not-a-real-secret-0123456789",
  CRON_SECRET: "audit-only-cron-secret-0123456789",
  CLOUDINARY_CLOUD_NAME: "treatstory-audit",
  CLOUDINARY_API_KEY: "audit-key",
  CLOUDINARY_API_SECRET: "audit-not-real",
  AUDIT_METRICS_FILE: dir + "/server-metrics.json",
  NODE_OPTIONS: `--require=${path.resolve("scripts/audit/external-stubs.cjs")}`,
};
// mailConfig intentionally requires HTTPS; staging mail flows use the canonical fake HTTPS origin.
env.APP_URL = "https://treatstory-audit.example";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "9030",
  ],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => (process.exitCode = code || 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
