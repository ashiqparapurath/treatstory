const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function load(file, overrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require, Buffer, crypto: webcrypto,
    TextEncoder, TextDecoder, btoa, atob, Response, process, ...overrides });
  return module.exports;
}
const encryption = load('src/lib/support-encryption.ts');
const pair = () => webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
const keys = Promise.all([pair(), pair(), pair()]);
test('legacy envelopes survive reload for both recipients and reject a different identity', async () => {
  const [owner, team, stranger] = await keys;
  const message = await encryption.encryptSupportMessage('preserve historical message',
    await webcrypto.subtle.exportKey('jwk', owner.publicKey), await webcrypto.subtle.exportKey('jwk', team.publicKey));
  const persisted = JSON.parse(JSON.stringify(message));
  assert.equal(await encryption.decryptSupportMessage(persisted, owner.privateKey, 'owner'), 'preserve historical message');
  assert.equal(await encryption.decryptSupportMessage(persisted, team.privateKey, 'team'), 'preserve historical message');
  await assert.rejects(encryption.decryptSupportMessage(persisted, stranger.privateKey, 'owner'));
  for (const field of ['ciphertext', 'iv', 'ownerKey', 'teamKey']) {
    const bytes = Buffer.from(message[field], 'base64'); bytes[0] ^= 1;
    await assert.rejects(encryption.decryptSupportMessage({ ...message, [field]: bytes.toString('base64') },
      field === 'teamKey' ? team.privateKey : owner.privateKey, field === 'teamKey' ? 'team' : 'owner'));
  }
});
test('registration schema rejects private factors, weak keys and inappropriate key operations', async () => {
  const { publicSupportKeySchema: schema } = load('src/lib/support-key-schema.ts');
  const [owner] = await keys;
  const publicKey = await webcrypto.subtle.exportKey('jwk', owner.publicKey);
  assert.equal(schema.safeParse(publicKey).success, true);
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) {
    assert.equal(schema.safeParse({ ...publicKey, [field]: 'secret' }).success, false, field);
  }
  for (const changes of [{ n: 'AQAB' }, { e: 'Aw' }, { alg: 'RSA1_5' },
    { key_ops: ['decrypt'] }, { key_ops: ['encrypt', 'decrypt'] }, { kty: 'EC' }]) {
    assert.equal(schema.safeParse({ ...publicKey, ...changes }).success, false);
  }
});
test('retired pilot never reads or rewrites key records, including when its old flag is enabled', async () => {
  const route = load('src/app/api/support-chat/route.ts', {
    process: { env: { NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED: 'true' } },
    require: () => { throw Error('The retired endpoint must not load Firebase or mutate keys.'); },
  });
  assert.equal((await route.GET({})).status, 410);
  assert.equal((await route.POST({})).status, 410);
  const disabled = load('src/app/api/support-chat/route.ts', { process: { env: {} } });
  assert.equal((await disabled.GET({})).status, 503);
});
