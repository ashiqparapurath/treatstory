const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const source = ts.transpileModule(fs.readFileSync('src/lib/support-device-key.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function client(indexedDB, crypto = webcrypto) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, indexedDB, crypto, Uint8Array });
  return module.exports;
}
function database(indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('treatstory-private-support-v1', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('device-keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
test('concurrent independent tabs keep one committed identity and reload its non-exportable private key', async () => {
  const indexedDB = new IDBFactory();
  const a = client(indexedDB), b = client(indexedDB);
  const [first, second] = await Promise.all([a.createSupportDeviceKey('customer'), b.createSupportDeviceKey('customer')]);
  assert.deepEqual(first.publicKey, second.publicKey);
  const reloaded = await client(indexedDB).loadSupportDeviceKey('customer');
  assert.deepEqual(reloaded.publicKey, first.publicKey);
  assert.equal(reloaded.privateKey.extractable, false);
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'RSA-OAEP' },
    await webcrypto.subtle.importKey('jwk', first.publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']),
    new TextEncoder().encode('history'));
  assert.equal(new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, reloaded.privateKey, ciphertext)), 'history');
  await assert.rejects(webcrypto.subtle.exportKey('jwk', reloaded.privateKey));
});
test('an aborted write never reports a successfully persisted key', async () => {
  const indexedDB = new IDBFactory();
  const db = await database(indexedDB);
  const tx = db.transaction('device-keys', 'readwrite');
  const proto = Object.getPrototypeOf(tx.objectStore('device-keys'));
  const add = proto.add;
  await new Promise(resolve => { tx.oncomplete = resolve; });
  proto.add = function (...args) {
    const request = add.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    await assert.rejects(client(indexedDB).createSupportDeviceKey('aborted'), /storage failed/);
    assert.equal(await client(indexedDB).loadSupportDeviceKey('aborted'), null);
  } finally { proto.add = add; db.close(); }
});
test('existing malformed key records are preserved instead of being silently replaced', async () => {
  const indexedDB = new IDBFactory();
  const db = await database(indexedDB);
  const tx = db.transaction('device-keys', 'readwrite');
  tx.objectStore('device-keys').add({ damaged: true }, 'owner:customer');
  await new Promise(resolve => { tx.oncomplete = resolve; });
  db.close();
  const api = client(indexedDB, { subtle: { generateKey: () => { throw Error('must not replace'); } } });
  assert.deepEqual(await api.createSupportDeviceKey('customer'), { damaged: true });
});
