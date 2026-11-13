const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('team encryption passphrase is generated in browser only', () => {
  const inbox = fs.readFileSync('src/components/admin/support-inbox.tsx', 'utf8');
  assert.match(inbox, /globalThis\.crypto\.getRandomValues\(random\)/);
  assert.match(inbox, /new Uint8Array\(32\)/);
  assert.match(inbox, /Generate strong passphrase/);
  assert.match(inbox, /savedPassphrase/);
  assert.match(inbox, /I saved this passphrase in a secure password manager/);
  assert.match(inbox, /navigator\.clipboard\.writeText\(passphrase\)/);
  assert.doesNotMatch(inbox, /process\.env\./);
});

test('server support-chat endpoint never accepts plaintext passphrase', () => {
  const source = fs.readFileSync('src/app/api/support-chat/route.ts', 'utf8');
  assert.match(source, /lockedPrivateKey/);
  assert.doesNotMatch(source, /process\.env\.(SUPPORT|TEAM).*PASS/i);
  assert.doesNotMatch(source, /passphrase\s*:/);
});
