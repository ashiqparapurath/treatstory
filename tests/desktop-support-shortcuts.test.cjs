const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('desktop buyer account sidebar includes Help & Support linking to existing support route', () => {
  const account = fs.readFileSync('src/app/account/page.tsx', 'utf8');
  const desktop = account.slice(account.indexOf('<div className="hidden lg:block">'));
  assert.ok(desktop.includes('<nav aria-label="Account navigation"'));
  assert.match(desktop,/href="\/support"[^>]+>\s*<LifeBuoy/);
  assert.match(desktop,/Help &amp; Support/);
  assert.equal((desktop.match(/href="\/support"/g) || []).length, 1);
});

test('desktop seller workspace has support shortcut without modifying mobile section navigation', () => {
  const dashboard = fs.readFileSync('src/app/seller/dashboard/page.tsx', 'utf8');
  assert.match(dashboard,/<nav aria-label="Seller workspace"/);
  assert.match(dashboard,/href="\/support" className="hidden min-h-11[^"]*lg:flex"/);
  assert.match(dashboard,/Help &amp; Support/);
  assert.equal((dashboard.match(/href="\/support"/g) || []).length, 1);
  assert.match(dashboard,/type Section = 'overview' \| 'products' \| 'orders' \| 'store'/);
});

test('buyer and seller continue using the same support ticket page', () => {
  const support = fs.readFileSync('src/app/support/page.tsx', 'utf8');
  assert.match(support,/New support request/);
  assert.match(support,/Your support requests/);
  assert.match(support,/fetch\('\/api\/support'/);
});
