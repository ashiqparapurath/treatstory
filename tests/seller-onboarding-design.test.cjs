const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('mobile More history control is attached to page flow, never a floating overlay', () => {
  const trail = fs.readFileSync('src/components/more-navigation-trail.tsx', 'utf8');
  const header = fs.readFileSync('src/components/header.tsx', 'utf8');
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  assert.match(header, /<MoreNavigationTrail \/>/);
  assert.match(header, /<\/header>\s*<MoreNavigationTrail \/>/);
  assert.doesNotMatch(layout, /<MoreNavigationTrail \/>/);
  assert.match(trail, /aria-label="More navigation history"/);
  assert.match(trail, /section-shell flex min-h-12 items-center/);
  assert.match(trail, /bg-transparent px-0/);
  assert.doesNotMatch(trail, /\bfixed\b|\babsolute\b|\bshadow-/);
  assert.match(trail, /router.push\(previous/);
  assert.match(trail, /Back to More/);
});

test('Become a Seller has responsive editorial copy and retains existing safe application workflow', () => {
  const page = fs.readFileSync('src/app/become-a-seller/page.tsx', 'utf8');
  assert.match(page, /Made by you/);
  assert.match(page, /Discovered by more/);
  assert.match(page, /A simple way to get started/);
  assert.match(page, /Home bakery|home bakery/);
  assert.match(page, /Create account/);
  assert.match(page, /I already have an account/);
  assert.match(page, /\/register\?next=%2Fbecome-a-seller/);
  assert.match(page, /\/login\?next=%2Fbecome-a-seller/);
  assert.match(page, /md:grid-cols-\[1fr_auto\]/);
  assert.match(page, /grid gap-6 sm:grid-cols-3/);
  assert.match(page, /<form onSubmit=\{submit\}/);
  assert.match(page, /setDoc\(doc\(firestore, 'seller_applications', user.uid\)/);
  assert.match(page, /status: 'pending'/);
  assert.match(page, /requestSellerMail\(user,'application',user.uid\)/);
  assert.match(page, /disabled=\{submitting \|\| !firestore\}/);
  assert.match(page, /user\.displayName\?\.trim\(\)/);
  const rules = fs.readFileSync('firestore.rules','utf8');
  assert.match(rules, /Only an authenticated profile can request seller access/);
});

test('seller signup and sign-in calls to action stay horizontally aligned without wrapping', () => {
  const page = fs.readFileSync('src/app/become-a-seller/page.tsx', 'utf8');
  assert.match(page, /flex w-full min-w-0 flex-col gap-3 sm:flex-row md:w-64 md:shrink-0 md:flex-col/);
  const start = page.indexOf('href="/register?next=%2Fbecome-a-seller"');
  const end = page.indexOf('</div>', start);
  assert.ok(start > 0 && end > start, 'Both account calls to action share one container');
  const actions = page.slice(start, end);
  assert.match(actions, /Create account/);
  assert.match(actions, /I already have an account/);
  assert.match(actions, /whitespace-nowrap/);
  assert.match(actions, /min-h-12 w-full items-center justify-center/g);
  assert.doesNotMatch(actions, /md:w-48/);
});

test('seller landing hero and application form adapt to narrow mobile and wide desktop', () => {
  const page = fs.readFileSync('src/app/become-a-seller/page.tsx','utf8');
  assert.match(page,/lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,0\.95fr\)\]/);
  assert.match(page,/px-6 py-9 sm:px-10 sm:py-12/);
  assert.match(page,/id="seller-page-heading"/);
  assert.match(page,/href="#seller-application"/);
  assert.match(page,/id="seller-application"/);
  assert.ok(page.indexOf('id="seller-application"') < page.indexOf('id="how-it-works"'),
    'Account creation and application must be accessible before long informational sections');
  assert.match(page,/className="mt-8 space-y-6 rounded-\[24px\] bg-white p-5/);
  assert.match(page,/sm:grid-cols-3/);
  assert.match(page,/sm:flex-row md:w-64 md:shrink-0 md:flex-col/);
  assert.doesNotMatch(page,/md:w-48/);
  assert.match(page,/scroll-mt-28/);
});
