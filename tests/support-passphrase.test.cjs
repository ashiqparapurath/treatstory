const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('administrator inbox uses independent Matrix identities without a shared passphrase', () => {
  const inbox = read('src/app/admin/page.tsx');
  const client = read('src/lib/support-matrix/client.ts');
  assert.match(inbox, /SupportMatrixWorkspace team/);
  assert.doesNotMatch(inbox, /<SupportInbox/);
  assert.match(client, /requestOwnUserVerification/);
  assert.match(client, /initRustCrypto/);
});

test('previous passphrases are used only for explicit local pilot-history import', () => {
  const ui = read('src/components/support-matrix-workspace.tsx');
  const client = read('src/lib/support-matrix/client.ts');
  assert.match(ui, /Previous passphrase \(version-1 history only\)/);
  assert.match(client, /unlockSupportKey\(page\.lockedKey, previousPassphrase\)/);
  assert.doesNotMatch(read('src/app/api/support-matrix/legacy/route.ts'), /passphrase\s*:/);
});

test('server never accepts plaintext team passphrase or exports the admin private key', () => {
  const api = read('src/app/api/support-chat/route.ts');
  const local = read('src/lib/support-device-key.ts');
  assert.match(api, /retired/);
  const importer=read('src/app/api/support-matrix/legacy/route.ts');
  assert.match(importer,/createdBy !== ctx\.uid/);
  assert.doesNotMatch(api, /passphrase\s*:/);
  assert.doesNotMatch(api, /process\.env\.(SUPPORT|TEAM).*PASS/i);
  assert.doesNotMatch(local, /exportKey\('jwk',pair\.privateKey\)/);
});
