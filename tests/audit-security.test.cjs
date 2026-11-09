const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function load(path) {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (id) => {
        if (id === "@/lib/server/firebase-admin") return { ApiError };
        throw Error(id);
      },
      TextDecoder,
      Uint8Array,
      Map,
      Set,
      WeakMap,
      Promise,
    },
  );
  return module.exports;
}
const { readJsonBody, readBodyBytes } = load("src/lib/server/request-body.ts");
test("chunked bodies are bounded even without Content-Length and dishonest headers", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(6));
      c.enqueue(new Uint8Array(6));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": "1" },
    body,
    duplex: "half",
  });
  await assert.rejects(
    () => readBodyBytes(request, 10),
    (e) => e.status === 413,
  );
  assert.equal(cancelled, true);
});
test("JSON rejects malformed UTF-8, malformed syntax, wrong type and excessive advertised length", async () => {
  for (const [headers, body, status] of [
    [{ "content-type": "text/plain" }, "{}", 415],
    [{}, "{", 400],
    [{}, new Uint8Array([0xff]), 400],
    [{ "content-length": "999" }, "{}", 413],
  ])
    await assert.rejects(
      () =>
        readJsonBody(
          new Request("https://example.test", {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body,
          }),
          10,
        ),
      (e) => e.status === status,
    );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await readJsonBody(
          new Request("https://example.test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"valid":true}',
          }),
          20,
        ),
      ),
    ),
    { valid: true },
  );
});
test("checkout queue serializes shared keys, releases on exceptions and permits unrelated products", async () => {
  const { withCheckoutKeys } = load("src/lib/server/checkout-lock.ts"),
    db = {};
  let active = 0,
    max = 0;
  await Promise.all(
    Array.from({ length: 100 }, () =>
      withCheckoutKeys(db, ["b", "a", "a"], async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setImmediate(r));
        active--;
      }),
    ),
  );
  assert.equal(max, 1);
  await assert.rejects(() =>
    withCheckoutKeys(db, ["a"], async () => {
      throw Error("failure");
    }),
  );
  assert.equal(await withCheckoutKeys(db, ["a"], async () => 42), 42);
  let release;
  const wait = new Promise((r) => (release = r));
  const held = withCheckoutKeys(db, ["a"], () => wait);
  assert.equal(await withCheckoutKeys(db, ["b"], async () => 43), 43);
  release();
  await held;
});
