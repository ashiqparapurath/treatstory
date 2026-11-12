const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = () => fs.readFileSync('src/app/login/page.tsx', 'utf8');

test('iOS-inspired mobile login uses a native-feeling navigation bar and inset-grouped fields', () => {
  const src = page();
  assert.match(src, /bg-\[#f5f5f7\] px-5 pb-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\] pt-3 sm:bg-\[#faf8f4\]/);
  assert.match(src, /brand-wordmark absolute left-1\/2 max-w-\[55%\] -translate-x-1\/2/);
  assert.match(src, /aria-label="Back to shop"/);
  assert.match(src, /<span className="sm:hidden">Shop<\/span>/);
  assert.match(src, /justify-start pb-7 pt-14 sm:justify-center sm:py-14/);
  assert.match(src, /text-\[clamp\(2\.2rem,9vw,2\.75rem\)\] font-semibold/);
  assert.match(src, /overflow-hidden rounded-\[17px\] border border-\[#e5e5ea\] bg-white/);
  assert.match(src, /border-t border-\[#eeeef0\] px-4 py-3 sm:space-y-2 sm:border-0/);
  assert.match(src, /h-9 rounded-none border-0 bg-transparent px-0 text-base/, 'Email text is at least 16px on mobile');
  assert.match(src, /h-9 rounded-none border-0 bg-transparent px-0 pr-12 text-base/, 'Password text is at least 16px on mobile');
  assert.match(src, /min-h-11 items-center text-\[13px\] font-medium/, 'Forgot-password action has a usable touch target');
  assert.match(src, /h-\[54px\] w-full rounded-\[15px\] bg-\[#1c1c1e\]/);
  assert.match(src, /sm:rounded-full sm:bg-\[#29251f\]/, 'Desktop button style is maintained');
  assert.match(src, /sm:space-y-5 sm:overflow-visible sm:rounded-none sm:border-0/, 'Desktop fields remain independent');
  assert.doesNotMatch(src, /<p className="mb-3 text-\[10px\] font-semibold uppercase/, 'Mobile title needs no decorative eyebrow');
  assert.doesNotMatch(src, /rounded-\[14px\] border-\[#e2d9cd\]/, 'No separate mobile input cards');
});

test('redesign leaves desktop editorial image and secure auth flow unchanged', () => {
  const src=page();
  assert.match(src, /hidden min-h-screen overflow-hidden bg-\[#e9dfd0\] lg:flex/);
  assert.match(src, /bg-\[url\('\/img\/login-side\.avif'\)\]/);
  assert.match(src, /lg:grid lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(src, /signInWithEmailAndPassword\(auth,email\.trim\(\),password\)/);
  assert.match(src, /requestAccountMail\('reset-password',\{email:email\.trim\(\)\}\)/);
  assert.match(src, /getErrorNotice\(error,reset\?'reset-password':'sign-in'\)/);
  assert.match(src, /autoComplete="email"/);
  assert.match(src, /autoComplete="current-password"/);
  assert.match(src, /aria-pressed=\{showPassword\}/);
  assert.match(src, /router\.replace\(destination\)/);
  assert.match(src, /next\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\)/);
  assert.match(src, /Forgot password\?/);
  assert.match(src, /Back to sign in/);
  assert.match(src, /New to TreatStory\?/);
});
