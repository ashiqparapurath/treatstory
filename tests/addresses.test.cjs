const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const moduleCopy = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/addresses.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { module: moduleCopy, exports: moduleCopy.exports, require },
);
const {
  changeAddressBook,
  deliveryAddressSchema,
  addressActionSchema,
  savedAddressOptions,
} = moduleCopy.exports;
const address = {
    recipient: "Buyer",
    phone: "9876543210",
    line1: "House 123 Main Street",
    locality: "Town",
    district: "Kozhikode",
    state: "Kerala",
    pincode: "673001",
  },
  id = "00000000-0000-4000-8000-000000000001",
  id2 = "00000000-0000-4000-8000-000000000002";
test("address schema rejects foreign ownership, paths and invalid delivery fields", () => {
  assert.ok(deliveryAddressSchema.safeParse(address).success);
  for (const value of [
    { ...address, pincode: "67301" },
    { ...address, line1: "short" },
    { ...address, state: "" },
    { ...address, recipient: "x".repeat(121) },
  ])
    assert.equal(deliveryAddressSchema.safeParse(value).success, false);
  assert.equal(
    addressActionSchema.safeParse({
      action: "save",
      id,
      address,
      uid: "someone-else",
    }).success,
    false,
  );
  assert.equal(
    addressActionSchema.safeParse({ action: "remove", id: "../someone" })
      .success,
    false,
  );
});
test("migration keeps existing delivery fields and excludes unrelated document fields", () => {
  const list = savedAddressOptions(null, {
    ...address,
    updatedAt: "timestamp",
    private: "omit",
  });
  assert.equal(list[0].id, "legacy");
  assert.equal(list[0].pincode, address.pincode);
  assert.equal(list[0].updatedAt, undefined);
  assert.equal(list[0].private, undefined);
  assert.equal(
    savedAddressOptions({ addresses: [], defaultId: null }, address).length,
    0,
  );
});
test("address changes preserve a default, avoid retry duplicates and select another when removed", () => {
  const original = {
    addresses: [{ ...address, id: "legacy" }],
    defaultId: "legacy",
  };
  let book = changeAddressBook(original, {
    action: "save",
    id,
    address: { ...address, recipient: "Work", pincode: "680001" },
  });
  assert.equal(original.addresses.length, 1);
  assert.equal(book.addresses.length, 2);
  assert.equal(book.defaultId, "legacy");
  book = changeAddressBook(book, {
    action: "save",
    id,
    address: { ...address, recipient: "Work updated" },
  });
  assert.equal(book.addresses.length, 2);
  assert.equal(
    book.addresses.find((a) => a.id === id).recipient,
    "Work updated",
  );
  book = changeAddressBook(book, { action: "default", id });
  assert.equal(book.defaultId, id);
  book = changeAddressBook(book, { action: "remove", id });
  assert.equal(book.defaultId, "legacy");
  book = changeAddressBook(book, { action: "remove", id: "legacy" });
  assert.equal(book.defaultId, null);
  assert.equal(book.addresses.length, 0);
  assert.throws(
    () => changeAddressBook(book, { action: "default", id }),
    /ADDRESS_NOT_FOUND/,
  );
});
test("bounded address books permit edits at capacity and reject extra entries", () => {
  let book = { addresses: [], defaultId: null };
  for (let i = 0; i < 10; i++)
    book = changeAddressBook(book, { action: "save", id: String(i), address });
  assert.throws(
    () => changeAddressBook(book, { action: "save", id: id2, address }),
    /ADDRESS_LIMIT/,
  );
  const edited = changeAddressBook(book, {
    action: "save",
    id: "0",
    address: { ...address, recipient: "Edited" },
  });
  assert.equal(edited.addresses.length, 10);
  assert.equal(edited.addresses[0].recipient, "Edited");
});

test("location suggestions expose only Indian area fields and require an unambiguous PIN", () => {
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/lib/location-address.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { module, exports: module.exports },
  );
  const parse = module.exports.suggestedAddress;
  const result = parse({
    address: {
      country_code: "in",
      suburb: "Town",
      county: "District",
      state: "Kerala",
      postcode: "673001",
      road: "Private road",
      house_number: "42",
    },
  });
  assert.equal(result.pincode, "673001");
  assert.equal(result.district, "District");
  assert.equal(result.house_number, undefined);
  assert.equal(result.road, undefined);
  assert.equal(parse({ address: { country_code: "us" } }), null);
  assert.equal(parse(null), null);
  assert.equal(
    parse({ address: { country_code: "in", postcode: "673001;673002" } })
      .pincode,
    "",
  );
});
