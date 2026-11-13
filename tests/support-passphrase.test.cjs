const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = path => fs.readFileSync(path, 'utf8');

test('administrator inbox activates device keys without showing a team passphrase', () => {
  const inbox = read('src/components/admin/support-inbox.tsx');
  const hook = read('src/hooks/use-support-encryption.ts');
  assert.match(inbox, /Secure support inbox/);
  assert.match(inbox, /administrator device is ready/);
  assert.match(hook, /registerTeamDeviceKey/);
  assert.match(hook, /createSupportDeviceKey\(isTeam\?'team:'\+uid:uid\)/);
  assert.doesNotMatch(inbox, /Create team encryption passphrase|Unlock existing team key|Generate strong passphrase/);
  assert.doesNotMatch(inbox, /process\.env\./);
});

test('older encrypted team conversations retain optional legacy unlock only', () => {
  const inbox = read('src/components/admin/support-inbox.tsx');
  assert.match(inbox, /Access older encrypted conversations/);
  assert.match(inbox, /legacyConversations\.length>0/);
  assert.match(inbox, /crypto\.unlockLegacy/);
  const hook = read('src/hooks/use-support-encryption.ts');
  assert.match(hook, /unlockSupportKey\(keys\.teamKey,passphrase\)/);
});

test('server never accepts plaintext team passphrase or exports the admin private key', () => {
  const api = read('src/app/api/support-chat/route.ts');
  const local = read('src/lib/support-device-key.ts');
  assert.match(api, /registerTeamDeviceKey/);
  assert.match(api, /doc\('team_device'\)/);
  assert.match(api, /teamKeyVersion:2/);
  assert.doesNotMatch(api, /passphrase\s*:/);
  assert.doesNotMatch(api, /process\.env\.(SUPPORT|TEAM).*PASS/i);
  assert.doesNotMatch(local, /exportKey\('jwk',pair\.privateKey\)/);
});
