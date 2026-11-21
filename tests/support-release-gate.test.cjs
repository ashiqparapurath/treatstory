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
  assert.match(legacy, /Message a seller/);
  assert.match(legacy, /Contact TreatStory support/);
  assert.match(legacy,/Your support requests/);
});

test('the admin inbox defaults to the working ticket responder and cannot activate E2EE implicitly',()=>{
  const admin=read('src/app/admin/page.tsx');
  assert.match(admin,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' && process\.env\.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true' \? <SupportMatrixWorkspace team \/> : <SupportLegacyInbox \/>/);
  const legacy=read('src/components/admin/support-legacy-inbox.tsx');
  assert.match(legacy,/\/api\/support/);
  assert.match(legacy,/SupportChatWorkspace/);
  assert.match(legacy,/SupportTicketThread/);
  assert.match(legacy,/ticket\.encrypted\s*!==\s*true/);
  const thread=read('src/components/support-ticket-thread.tsx');
  assert.match(thread,/Send message/);
  assert.match(thread,/not end-to-end encrypted/);
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

test('disabled Matrix feature does not load its heavy client bundle on the legacy support page',()=>{
  const support=read('src/app/support/page.tsx');
  const layout=read('src/app/support/layout.tsx');
  assert.doesNotMatch(support,/^'use client'/);
  assert.match(support,/if \(!enabled\) return null/);
  assert.match(support,/await import\('@\/components\/support-matrix-workspace'\)/);
  assert.match(support,/NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true'/);
  assert.match(support,/NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true'/);
  assert.match(layout,/<LegacySupportPage/);
});
