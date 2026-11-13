const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('the production support route uses the working legacy ticket system unless E2EE is deliberately enabled',()=>{
  const layout=read('src/app/support/layout.tsx');
  assert.match(layout,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true'/);
  assert.match(layout,/<LegacySupportPage/);
  const legacy=read('src/components/support-legacy-page.tsx');
  assert.match(legacy, /\/api\/support/);
  assert.match(legacy, /Submit request/);
  assert.match(legacy,/Your support requests/);
});

test('the admin inbox defaults to the working ticket responder and cannot activate E2EE implicitly',()=>{
  const admin=read('src/app/admin/page.tsx');
  assert.match(admin,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' \? <SupportInbox \/> : <SupportLegacyInbox \/>/);
  const legacy=read('src/components/admin/support-legacy-inbox.tsx');
  assert.match(legacy,/\/api\/support/);
  assert.match(legacy,/Send reply/);
});

test('unreviewed encrypted support API is disabled by default and Firestore rules remain unchanged',()=>{
  const api=read('src/app/api/support-chat/route.ts');
  assert.equal((api.match(/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED !== 'true'/g)||[]).length,2);
  assert.match(api,/Secure chat is not enabled/);
  const rules=read('firestore.rules');
  assert.doesNotMatch(rules,/match \/support_chat_keys/);
  assert.doesNotMatch(rules,/match \/support_tickets\/\{ticketId\}\/messages/);
});
