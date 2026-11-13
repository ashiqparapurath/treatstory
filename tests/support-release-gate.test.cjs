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
  assert.match(admin,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' && process\.env\.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true' \? <SupportMatrixWorkspace team \/> : <SupportLegacyInbox \/>/);
  const legacy=read('src/components/admin/support-legacy-inbox.tsx');
  assert.match(legacy,/\/api\/support/);
  assert.match(legacy,/Send reply/);
  assert.match(legacy,/ticket\.encrypted!==true/);
});

test('unreviewed encrypted support API is disabled by default and key/message collections remain private',()=>{
  const api=read('src/app/api/support-chat/route.ts');
  assert.match(api,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED !== 'true'/);
  assert.match(api,/status: 410/);
  assert.match(api,/Secure chat is not enabled/);
  const rules=read('firestore.rules');
  assert.doesNotMatch(rules,/match \/support_chat_keys/);
  assert.doesNotMatch(rules,/match \/support_tickets\/\{ticketId\}\/messages/);
});
