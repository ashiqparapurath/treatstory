const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('support workspace occupies the viewport and has a responsive list/detail experience',()=>{
 const source=read('src/components/support-chat-workspace.tsx');
 assert.match(source,/fixed inset-0 z-\[200\]/);
 assert.match(source,/createPortal/);
 assert.match(source,/document.body/);
 assert.match(source,/items-stretch overflow-hidden/);
 assert.match(source,/aria-label="Support conversations"/);
 assert.match(source,/aria-label="Selected support chat"/);
 assert.match(source,/hidden md:flex/);
 assert.match(source,/Back to conversations/);
 assert.match(source,/Search conversations/);
 assert.match(source,/newConversation/);
});

test('chat thread scrolls and keeps its composer at the bottom',()=>{
 const thread=read('src/components/support-matrix-workspace.tsx');
 assert.match(thread,/flex h-full min-h-0 flex-col/);
 assert.match(thread,/min-h-0 flex-1/);
 assert.match(thread,/overflow-y-auto/);
 assert.match(thread,/shrink-0 border-t/);
 assert.match(thread,/aria-label="Send message"/);
 const client=read('src/lib/support-matrix/client.ts');
 assert.match(client,/encryptForConversation/);
 assert.match(client,/decryptSupportMessage/);
});

test('buyer, seller and administrator routes use the verified multi-device workspace',()=>{
 const customer=read('src/app/support/page.tsx');
 const admin=read('src/app/admin/page.tsx');
 const workspace=read('src/components/support-matrix-workspace.tsx');
 assert.match(customer,/SupportMatrixWorkspace/);
 assert.match(admin,/SupportMatrixWorkspace team/);
 assert.match(workspace,/SupportChatWorkspace/);
 assert.match(workspace,/migrateHistory/);
 assert.doesNotMatch(customer,/useSupportEncryption/);
});
