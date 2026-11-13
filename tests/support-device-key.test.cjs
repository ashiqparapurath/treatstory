const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('customer support uses automatic local keys, no passphrase setup',()=>{
  const ui=read('src/app/support/page.tsx');
  assert.match(ui,/useSupportEncryption\(false\)/);
  assert.doesNotMatch(ui,/support-passphrase|Your encryption key|Create an encryption passphrase/);
  assert.match(ui,/Preparing secure messaging on this device/);
  assert.match(ui,/original device|device where it was started/);
});

test('customer private keys are non-extractable and kept in IndexedDB',()=>{
  const key=read('src/lib/support-device-key.ts');
  assert.match(key,/indexedDB\.open\(DB_NAME,1\)/);
  assert.match(key,/generateKey\(/);
  assert.match(key,/false,\['encrypt','decrypt'\]/);
  assert.match(key,/getRandomValues|RSA-OAEP/);
  assert.doesNotMatch(key,/exportKey\('jwk',pair\.privateKey\)/);
  const hook=read('src/hooks/use-support-encryption.ts');
  assert.match(hook,/createSupportDeviceKey/);
  assert.match(hook,/registerUserDeviceKey/);
  const api=read('src/app/api/support-chat/route.ts');
  assert.match(api,/registerUserDeviceKey/);
  assert.match(api,/deviceOnly:true/);
});
