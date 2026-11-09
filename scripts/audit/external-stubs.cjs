// Loaded only by the isolated audit runner, never by the deployed application.
const fs = require("node:fs"),
  { monitorEventLoopDelay } = require("node:perf_hooks");
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-treatstory-audit" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error(
    "Audit stubs require the isolated demo project and loopback emulators.",
  );
const original = global.fetch;
const counts = {
  mail: 0,
  upload: 0,
  blockedEgress: 0,
  transactions: 0,
  transactionAttempts: 0,
  reads: 0,
  writes: 0,
};
global.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" ? input : input.url || String(input),
  );
  if (
    url.hostname === "script.google.com" &&
    url.pathname === "/macros/s/treatstory-audit/exec"
  ) {
    counts.mail++;
    const envelope = JSON.parse(String(options.body));
    return Response.json({ ok: true, id: envelope.id });
  }
  if (url.hostname === "nominatim.openstreetmap.org") return Response.json({address:{country_code:"in",suburb:"Audit Town",county:"Kozhikode",state:"Kerala",postcode:"673001"}});
  if (url.hostname === "api.cloudinary.com") {
    counts.upload++;
    return Response.json({
      secure_url:
        "https://res.cloudinary.com/treatstory-audit/image/upload/v1/audit.png",
      public_id: "audit",
    });
  }
  if (
    url.hostname === "firestore.googleapis.com" &&
    url.pathname.includes("/projects/demo-treatstory-audit/")
  )
    return original(
      "http://127.0.0.1:8080" + url.pathname + url.search,
      options,
    );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    counts.blockedEgress++;
    throw Error("Audit blocks external traffic");
  }
  return original(input, options);
};
const { Firestore, Transaction } = require("firebase-admin/firestore");
const run = Firestore.prototype.runTransaction;
Firestore.prototype.runTransaction = function (fn, ...rest) {
  counts.transactions++;
  return run.call(
    this,
    async (tx) => {
      counts.transactionAttempts++;
      return fn(tx);
    },
    ...rest,
  );
};
const get = Transaction.prototype.get;
Transaction.prototype.get = async function (...args) {
  const result = await get.apply(this, args);
  counts.reads += Array.isArray(result?.docs)
    ? Math.max(1, result.docs.length)
    : 1;
  return result;
};
for (const name of ["create", "set", "update", "delete"]) {
  const fn = Transaction.prototype[name];
  Transaction.prototype[name] = function (...args) {
    counts.writes++;
    return fn.apply(this, args);
  };
}
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
setInterval(() => {
  fs.writeFileSync(
    process.env.AUDIT_METRICS_FILE || "/tmp/treatstory-audit-metrics.json",
    JSON.stringify({
      at: Date.now(),
      pid: process.pid,
      counts,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      eventLoop: {
        p95Ms: delay.percentile(95) / 1e6,
        p99Ms: delay.percentile(99) / 1e6,
      },
    }),
  );
  delay.reset();
}, 1000).unref();
