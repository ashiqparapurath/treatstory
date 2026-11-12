const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = () => fs.readFileSync('src/app/login/page.tsx', 'utf8');

test('mobile login uses a borderless layout, safe tap targets and readable input sizes', () => {
  const src=page();
  assert.match(src, /min-h-\[100dvh\] min-w-0 flex-col bg-\[#fcfaf6\] px-5 pb-6 pt-6/);
  assert.match(src, /justify-start pb-7 pt-11 sm:justify-center sm:py-14/);
  assert.match(src, /max-w-\[420px\]/);
  assert.match(src, /text-\[clamp\(2\.15rem,9vw,2\.65rem\)\]/);
  assert.match(src, /h-\[54px\] rounded-\[14px\] border-\[#e2d9cd\] bg-white px-4 text-base/);
  assert.match(src, /h-\[54px\] rounded-full bg-\[#29251f\]/);
  assert.match(src, /inline-flex min-h-11 shrink-0 items-center/);
  assert.match(src, /sm:border sm:border-\[#e6ded2\] sm:bg-white/, 'Back link is unboxed on mobile');
  assert.match(src, /min-h-9 items-center text-xs font-semibold/, 'Password recovery is touch-accessible');
  assert.match(src, /focus-visible:outline/, 'Actions have keyboard focus states');
  assert.doesNotMatch(src, /rounded-xl border border-\[#e6ded2\] bg-white px-3/, 'Old mobile header button is gone');
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
