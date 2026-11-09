// Run isolated progressive VUs; add one real browser when the 100-VU stage starts.
const { spawn } = require("node:child_process");
if (process.env.TREATSTORY_AUDIT !== "local-only")
  throw Error("Explicit local audit flag required");
const load = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "scripts/audit/load.ts"],
  { env: process.env, stdio: ["ignore", "pipe", "inherit"] },
);
let buffer = "",
  browser;
load.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    try {
      const e = JSON.parse(line);
      if (e.event === "stage-start" && e.concurrency === 100 && !browser) {
        browser = spawn(process.execPath, ["scripts/audit/browser.cjs"], {
          env: { ...process.env, AUDIT_BROWSER_RUNS: "1" },
          stdio: "inherit",
        });
      }
    } catch {}
  }
});
load.on("exit", (code) => {
  if (code) process.exitCode = code;
});
