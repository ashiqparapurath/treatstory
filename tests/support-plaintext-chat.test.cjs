const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');

test('unencrypted support remains gated away from Matrix and uses a full-screen workspace', () => {
  const layout = read('src/app/support/layout.tsx');
  const buyer = read('src/components/support-legacy-page.tsx');
  const admin = read('src/components/admin/support-legacy-inbox.tsx');
  const shared = read('src/components/support-chat-workspace.tsx');
  assert.match(layout, /NEXT_PUBLIC_ENCRYPTED_SUPPORT_ENABLED === 'true' && process\.env\.NEXT_PUBLIC_SUPPORT_MATRIX_ENABLED === 'true'/);
  assert.match(layout, /LegacySupportPage/);
  for (const surface of [buyer, admin]) {
    assert.match(surface, /SupportChatWorkspace/);
    assert.match(surface, /secure=\{false\}/);
    assert.match(surface, /SupportTicketThread/);
    assert.match(surface, /\/api\/support/);
  }
  assert.match(shared, /createPortal/);
  assert.match(shared, /fixed inset-0 z-\[200\]/);
  assert.match(shared, /not end-to-end encrypted/);
  assert.match(shared, /Back to conversations/);
});

test('buyer followups and admin replies use existing verified support endpoint', () => {
  const api = read('src/app/api/support/route.ts');
  const customer = read('src/components/support-legacy-page.tsx');
  const admin = read('src/components/admin/support-legacy-inbox.tsx');
  assert.match(api, /z\.literal\('followup'\)/);
  assert.match(api, /previous\.ownerUid!==uid/);
  assert.match(api, /!admin\.exists/);
  assert.match(api, /previous\.encrypted===true/);
  assert.match(api, /previous\.status==='closed'/);
  assert.match(api, /history\.length>=80/);
  assert.match(api, /previous\.response/);
  assert.match(api, /thread:history/);
  assert.match(api, /queueNotification/);
  assert.match(customer, /action: 'followup'/);
  assert.match(admin, /action: 'reply' \| 'close'/);
  assert.match(admin, /orderBy\('updatedAt', 'desc'\)/);
  const rules = read('firestore.rules');
  assert.match(rules, /match \/support_tickets\/\{ticketId\} \{[\s\S]*?allow create, update, delete: if false;/);
});

test('thread keeps original request and legacy response, offers mobile composer and never promises E2EE', () => {
  const thread = read('src/components/support-ticket-thread.tsx');
  assert.match(thread, /initial-request/);
  assert.match(thread, /legacy-support-response|historical-reply/);
  assert.match(thread, /ticket\.thread \|\| \[\]/);
  assert.match(thread, /aria-label="Support message history"/);
  assert.match(thread, /aria-label="Send message"/);
  assert.match(thread, /ticket\.status === 'closed'/);
  assert.match(thread, /not end-to-end encrypted/);
  assert.match(thread, /Support replies are handled by the team/);
  assert.match(thread, /Close ticket/);
});
