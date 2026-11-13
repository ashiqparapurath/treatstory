const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const canonical = require('another-json');
function load(path, overrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require, Buffer, URL, AbortSignal, process, ...overrides });
  return module.exports;
}
const signatures = load('src/lib/server/support-matrix-signatures.ts');
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function server(extra = {}) {
  return load('src/lib/server/support-matrix.ts', { require: name => name === './firebase-admin' ? { ApiError } : name === './support-matrix-signatures' ? signatures : require(name),
    process: { env: { NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED: 'true', NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED: 'true', SUPPORT_MATRIX_PRIVATE_TRANSPORT_CONFIRMED: 'true', SUPPORT_MATRIX_HOMESERVER_URL: 'https://matrix.internal', SUPPORT_MATRIX_SERVER_NAME: 'matrix.test', SUPPORT_MATRIX_JWT_SECRET: 'a'.repeat(64), SUPPORT_MATRIX_SERVICE_TOKEN: 'service-test-only', SUPPORT_MATRIX_GATEWAY_SECRET: 'g'.repeat(64) } }, ...extra });
}
function key() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64').replace(/=+$/, '');
  return { ...pair, id: 'ed25519:' + publicKey, encoded: publicKey };
}
function sign(object, userId, key) {
  return { ...object, signatures: { [userId]: { [key.id]: crypto.sign(null, Buffer.from(canonical.stringify(object)), key.privateKey).toString('base64') } } };
}
test('Matrix identity mapping is stable, namespaced and does not expose Firebase IDs', () => {
  const api = server();
  assert.match(api.matrixLocalpart('customer/with:punctuation'), /^ts_[0-9a-f]{64}$/);
  assert.notEqual(api.matrixLocalpart('buyer'), api.matrixLocalpart('seller'));
  const jwt = api.loginJWT('buyer', 'secret', 1000);
  const [head, body, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(body, 'base64url')).exp, 1060);
  assert.equal(signature, crypto.createHmac('sha256', 'secret').update(head + '.' + body).digest('base64url'));
  assert.notEqual(jwt, api.loginJWT('buyer', 'secret', 1000));
});
test('Matrix cross-signatures reject altered keys and substituted roots', async () => {
  const root = key(), self = key(), deviceKey = key();
  const api = server(); const uid = 'buyer', userId = api.matrixUserId(uid, 'matrix.test');
  const selfObject = sign({ user_id: userId, usage: ['self_signing'], keys: { [self.id]: self.encoded } }, userId, root);
  const device = sign({ user_id: userId, device_id: 'DEVICE', algorithms: ['m.olm.v1.curve25519-aes-sha2'], keys: { [deviceKey.id]: deviceKey.encoded } }, userId, self);
  assert.equal(signatures.verifyMatrixSignature(selfObject, userId, { [root.id]: root.encoded }), true);
  assert.equal(signatures.verifyMatrixSignature({ ...selfObject, user_id: '@other:test' }, userId, { [root.id]: root.encoded }), false);
  assert.equal(signatures.verifyMatrixSignature(selfObject, userId, { [key().id]: key().encoded }), false);
  let pinned = root.encoded;
  const db = { doc: () => ({ get: async () => ({ data: () => ({ masterKey: pinned }) }) }) };
  const query = { master_keys: { [userId]: { user_id: userId, usage: ['master'], keys: { [root.id]: root.encoded } } }, self_signing_keys: { [userId]: selfObject }, device_keys: { [userId]: { DEVICE: device } } };
  const verified = server({ fetch: async () => ({ ok: true, json: async () => query }) });
  await verified.requireTrustedDevice(db, uid, 'DEVICE', 'session-token');
  await assert.rejects(verified.requireTrustedDevice(db, uid, 'PENDING', 'session-token'), error => error.status === 403);
  pinned = key().encoded;
  await assert.rejects(verified.requireTrustedDevice(db, uid, 'DEVICE', 'session-token'), error => error.status === 403);
});
test('a removed support role cannot re-enter its prior account as a customer', async () => {
  const api = server();
  const db = { doc: path => ({ get: async () => ({ exists: false, data: () => path.startsWith('support_matrix_accounts/') ? { agent: true } : undefined }) }) };
  await assert.rejects(api.supportRole(db, 'removed-admin'), error => error.status === 403);
});
test('production transport is fail-closed without an explicitly configured private homeserver', () => {
  assert.throws(() => server({ process: { env: {} } }).matrixConfig(), error => error.status === 503);
  assert.throws(() => server({ process: { env: { NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED: 'true' } } }).matrixConfig(), error => error.status === 503);
});
