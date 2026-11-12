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
  assert.match(page, /mt-7 grid gap-5 sm:grid-cols-3/, 'Creator benefits should form a three-column grid on desktop');
  assert.match(page, /mt-8 grid gap-7 sm:grid-cols-3/, 'Application steps should form a three-column grid on desktop');
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
  assert.match(page,/px-0 py-3 sm:px-10 sm:py-12/);
  assert.match(page,/id="seller-page-heading"/);
  assert.match(page,/href="#seller-application"/);
  assert.match(page,/id="seller-application"/);
  assert.ok(page.indexOf('id="seller-application"') < page.indexOf('id="how-it-works"'),
    'Account creation and application must be accessible before long informational sections');
  assert.match(page,/className="mt-7 space-y-6 bg-transparent p-0 shadow-none sm:mt-8 sm:rounded-\[24px\] sm:bg-white/);
  assert.match(page,/sm:grid-cols-3/);
  assert.match(page,/sm:flex-row md:w-64 md:shrink-0 md:flex-col/);
  assert.doesNotMatch(page,/md:w-48/);
  assert.match(page,/scroll-mt-28/);
});

test('small screens show concise creator categories instead of a tall decorative panel', () => {
  const page = fs.readFileSync('src/app/become-a-seller/page.tsx','utf8');
  assert.match(page,/aria-label="Marketplace creator categories" className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden"/);
  assert.match(page,/aria-label="Creators featured at TreatStory" className="hidden min-w-0/);
  assert.match(page,/sm:block sm:p-7/);
  assert.match(page,/Get started/);
});

test('mobile creator onboarding is an unboxed editorial layout while desktop styling stays intact', () => {
  const page = fs.readFileSync('src/app/become-a-seller/page.tsx', 'utf8');
  assert.match(page, /rounded-none bg-transparent sm:rounded-\[34px\] sm:bg-\[#ede4d8\]/, 'Mobile hero blends into page, desktop retains hero card');
  assert.match(page, /px-0 py-3 sm:px-10 sm:py-12/, 'Mobile hero has no inset card padding');
  assert.match(page, /aria-label="Marketplace creator categories" className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden"/);
  assert.doesNotMatch(page, /rounded-full border border-\[#cebca6\]/, 'Mobile category labels must not look like bordered pills');
  assert.match(page, /sm:rounded-\[30px\] sm:bg-\[#f6f1e9\] sm:px-9 sm:py-10/, 'Desktop signup card retained');
  assert.match(page, /gap-5 bg-transparent px-0 py-0 sm:gap-7/, 'Mobile signup is borderless and unboxed');
  assert.match(page, /bg-transparent p-0 shadow-none sm:mt-8 sm:rounded-\[24px\] sm:bg-white/, 'Mobile application form no longer sits in a card');
  assert.match(page, /group border-0 pt-0 sm:border-t/, 'Mobile benefits are borderless');
  assert.match(page, /mt-14 border-0 pt-0 sm:mt-20 sm:border-t/, 'Mobile steps are separated by spacing, not heavy borders');
  assert.match(page, /sm:rounded-full sm:bg-white\/75 sm:px-4 sm:no-underline/, 'Secondary CTA is a simple link on phones and pill on desktop');
  assert.match(page, /sm:rounded-\[26px\] sm:bg-\[#edf2e9\]/, 'Success state has its desktop style intact');
});
