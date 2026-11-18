const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('seller review retains server-side conflict safeguards',()=>{
  const api=read('src/app/api/seller-applications/route.ts');
  for(const message of [
    'Ask this applicant to register and verify their contact email, then approve again.',
    'The seller must verify their account email before activation.',
    'This application was already reviewed.',
    'Application changed; refresh before reviewing.',
    'Account already has seller access or is closing.',
    'Store address unavailable.',
  ])assert.ok(api.includes(message),message);
  assert.match(api,/await db\.runTransaction\(async \(tx\) => \{/);
  assert.match(api,/current\.data\(\)\?\.status !== 'pending'/);
  assert.match(api,/emailVerified/);
});

test('admin review shows the real conflict message, refreshes data and does not retry mutation',()=>{
  const ui=read('src/components/admin/seller-applications.tsx');
  assert.match(ui,/const \[reviewIssues, setReviewIssues\] = useState<Record<string,string>>\(\{\}\)/);
  assert.match(ui,/if\(response\.status === 409\) \{/);
  assert.match(ui,/setReviewIssues\(current => \(\{\.\.\.current,\[application\.id\]:message\}\)\)/);
  assert.match(ui,/retryLoad\(\)/);
  assert.match(ui,/Applicant needs a verified account/);
  assert.match(ui,/description:message/);
  assert.match(ui,/return;/);
  assert.match(ui,/new ActionError\(message,response\.status\)/);
  assert.match(ui,/reviewIssues\[application\.id\] && <p role="alert"/);
  assert.match(ui,/disabled=\{working !== null\}/);
  assert.match(ui,/response\.ok/);
});

test('install prompt waits for a genuine tap and remains available when browser supports it',()=>{
  const ui=read('src/components/app-install-notice.tsx');
  assert.match(ui,/event\.preventDefault\(\)/);
  assert.match(ui,/if \(!visible \|\| busy \|\| installEvent\) return/);
  assert.match(ui,/await installEvent\.prompt\(\)/);
  assert.match(ui,/onClick=\{\(\) => void install\(\)\}/);
  assert.match(ui,/\[visible, busy, installEvent\]/);
  assert.match(ui,/reminderShownKey/);
  assert.match(ui,/aria-label="Dismiss install notification"/);
});
