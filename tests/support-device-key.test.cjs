const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('customer support uses automatic local keys, no passphrase setup',()=>{
  const ui=read('src/app/support/page.tsx');
  assert.match(ui,/SupportMatrixWorkspace/);
  assert.doesNotMatch(ui,/support-passphrase|Your encryption key|Create an encryption passphrase/);
  const client=read('src/lib/support-matrix/client.ts');
  assert.match(client,/initRustCrypto/);
  assert.match(client,/requestOwnUserVerification/);
});

test('customer private keys are non-extractable and kept in IndexedDB',()=>{
  const key=read('src/lib/support-device-key.ts');
  assert.match(key,/indexedDB\.open\(DB_NAME,1\)/);
  assert.match(key,/generateKey\(/);
  assert.match(key,/false,\['encrypt','decrypt'\]/);
  assert.match(key,/getRandomValues|RSA-OAEP/);
  assert.doesNotMatch(key,/exportKey\('jwk',pair\.privateKey\)/);
  const client=read('src/lib/support-matrix/client.ts');
  assert.match(client,/loadSupportDeviceKey/);
  assert.doesNotMatch(client,/createSupportDeviceKey/);
  const api=read('src/app/api/support-chat/route.ts');
  assert.match(api,/retired/);
  assert.doesNotMatch(api,/tx\.create|tx\.set|store\.put/);
});
