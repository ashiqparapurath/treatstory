const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('seller review retains server-side conflict safeguards',()=>{
  const api=read('src/app/api/seller-applications/route.ts');
  for(const message of [
    'This application was already reviewed.',
    'Application changed; refresh before reviewing.',
    'Choose a 3-month trial, 6-month trial or full access before approving.',
  ])assert.ok(api.includes(message),message);
  assert.match(api,/await db\.runTransaction\(async \(tx\) => \{/);
  assert.match(api,/current\.data\(\)\?\.status !== 'pending'/);
  assert.match(api,/emailVerified/);
  assert.match(api,/queueApprovedSellerApplicationMail/);
  const activation=read('src/app/api/seller-applications/activate/route.ts');
  assert.match(activation,/account\.emailVerified/);
  assert.match(activation,/data\.contactEmail !== email/);
  assert.match(activation,/activatedAt/);
  const helper=read('src/lib/server/seller-activation.ts');
  assert.match(helper,/Account already has seller access or is closing/);
  assert.match(helper,/Store address unavailable/);
});

test('admin review shows the real conflict message, refreshes data and does not retry mutation',()=>{
  const ui=read('src/components/admin/seller-applications.tsx');
  assert.match(ui,/const \[reviewIssues, setReviewIssues\] = useState<Record<string,string>>\(\{\}\)/);
  assert.match(ui,/if\(response\.status === 409\) \{/);
  assert.match(ui,/setReviewIssues\(current => \(\{\.\.\.current,\[application\.id\]:message\}\)\)/);
  assert.match(ui,/retryLoad\(\)/);
  assert.match(ui,/Application needs attention/);
  assert.match(ui,/Select a plan before approval/);
  assert.match(ui,/Review & approve/);
  assert.match(ui,/description:message/);
  assert.match(ui,/return;/);
  assert.match(ui,/new ActionError\(message,response\.status\)/);
  assert.match(ui,/reviewIssues\[application\.id\] && <p role="alert"/);
  assert.match(ui,/disabled=\{working !== null\}/);
  assert.match(ui,/response\.ok/);
});

test('install prompt awaits a user tap and its notice auto-hides after seven seconds',()=>{
  const ui=read('src/components/app-install-notice.tsx');
  assert.match(ui,/event\.preventDefault\(\)/);
  assert.match(ui,/if \(!visible \|\| busy\) return/);
  assert.match(ui,/if \(!isDismissed\(\) && storage\("sessionStorage", reminderShownKey\) !== "1"\)/);
  assert.match(ui,/await installEvent\.prompt\(\)/);
  assert.match(ui,/onClick=\{\(\) => void install\(\)\}/);
  assert.match(ui,/\[visible, busy\]/);
  assert.match(ui,/7000/);
  assert.match(ui,/reminderShownKey/);
  assert.match(ui,/aria-label="Dismiss install notification"/);
});
