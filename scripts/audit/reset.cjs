// Destructive only inside the explicitly named, loopback-only disposable demo project.
if (
  process.env.TREATSTORY_AUDIT !== "local-only" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Refusing reset outside isolated loopback demo staging");
(async () => {
  for (const url of [
    "http://127.0.0.1:8080/emulator/v1/projects/demo-treatstory-audit/databases/(default)/documents",
    "http://127.0.0.1:9099/emulator/v1/projects/demo-treatstory-audit/accounts",
  ]) {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) throw Error("Demo reset failed: " + response.status);
  }
  console.log("Cleared only demo-treatstory-audit emulator fixtures.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
