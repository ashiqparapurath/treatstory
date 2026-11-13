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
 const thread=read('src/components/support-chat-thread.tsx');
 assert.match(thread,/flex h-full min-h-0 flex-col/);
 assert.match(thread,/min-h-0 flex-1/);
 assert.match(thread,/overflow-y-auto/);
 assert.match(thread,/shrink-0 border-t/);
 assert.match(thread,/aria-label="Send message"/);
 assert.match(thread,/encryptSupportMessage/);
 assert.match(thread,/decryptSupportMessage/);
});

test('buyer, seller and admin screens use the same workspace and preserve encrypted messaging',()=>{
 const customer=read('src/app/support/page.tsx');
 const admin=read('src/components/admin/support-inbox.tsx');
 for(const source of [customer,admin]){
   assert.match(source,/SupportChatWorkspace/);
   assert.match(source,/SupportChatThread/);
 }
 assert.match(admin,/legacyPrivateKey/);
 assert.match(customer,/action:'create',category,encrypted,orderId/);
});
