const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read=path=>fs.readFileSync(path,'utf8');

test('mobile More navigation history stays in page flow, not floating over seller onboarding',()=>{
  const trail=read('src/components/more-navigation-trail.tsx');
  const header=read('src/components/header.tsx');
  const layout=read('src/app/layout.tsx');
  assert.match(header,/<MoreNavigationTrail \/>/);
  assert.match(header,/<\/header>\s*<MoreNavigationTrail \/>/);
  assert.doesNotMatch(layout,/<MoreNavigationTrail \/>/);
  assert.match(trail,/aria-label="More navigation history"/);
  assert.match(trail,/section-shell flex min-h-12 items-center/);
  assert.doesNotMatch(trail,/\bfixed\b|\babsolute\b|\bshadow-/);
});

test('new seller landing is a fully rebuilt editorial page that respects mobile gutters',()=>{
  const page=read('src/app/become-a-seller/page.tsx');
  assert.match(page,/function CreatorHero\(\)/);
  assert.match(page,/function SellerBenefits\(\)/);
  assert.match(page,/function HowItWorks\(\)/);
  assert.match(page,/function SellerFaq\(\)/);
  assert.match(page,/Made by you\./);
  assert.match(page,/Loved by many\./);
  assert.match(page,/src="\/img\/our-story-creators\.svg"/);
  assert.match(page,/alt="Illustration of cakes, ceramics, embroidery and handmade gifts/);
  assert.match(page,/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,0\.95fr\)\]/);
  assert.match(page,/-mx-4 overflow-hidden bg-\[#252a25\]/);
  assert.match(page,/sm:mx-0 sm:rounded-\[28px\]/);
  assert.match(page,/section-shell mx-auto max-w-\[1280px\]/);
  assert.match(page,/sm:grid-cols-3/);
  assert.match(page,/scroll-mt-28/);
  assert.match(page,/href="#seller-application"/);
  assert.match(page,/href="#how-it-works"/);
  assert.match(page,/SELLER_TRIAL_MESSAGE/);
});

test('guest seller application retains server verification, honeypot and step validation',()=>{
  const page=read('src/app/become-a-seller/page.tsx');
  const route=read('src/app/api/seller-applications/route.ts');
  assert.match(page,/No account is needed to apply/);
  assert.match(page,/<form onSubmit=\{submit\}/);
  assert.match(page,/if\(step !== 3\)/);
  assert.match(page,/fetch\('\/api\/seller-applications'/);
  assert.match(page,/new FormData\(event\.currentTarget\)\.get\('website'\)/);
  assert.match(page,/user\.getIdToken\(\)/);
  assert.match(page,/if\(!response\.ok\)throw new Error/);
  assert.match(page,/setSubmitted\(true\)/);
  assert.doesNotMatch(page,/await setDoc/);
  assert.match(route,/emailVerified/);
  assert.match(route,/activateApprovedSeller/);
  assert.match(route,/queueApprovedSellerApplicationMail/);
  assert.match(route,/roles_admin/);
});

test('seller onboarding is a three-step accessible form instead of a crowded long mobile form',()=>{
  const page=read('src/app/become-a-seller/page.tsx');
  assert.match(page,/aria-label="Application progress"/);
  assert.match(page,/aria-current=\{active\?'step':undefined\}/);
  assert.match(page,/Step \{step\} of 3/);
  assert.match(page,/step===1 && <>/);
  assert.match(page,/step===2 && <>/);
  assert.match(page,/step===3 && <>/);
  for(const id of ['businessName','businessCategory','businessCity','businessState','contactEmail','contactPhone','description'])assert.ok(page.includes('id="'+id+'"'),id);
  assert.match(page,/type="email" required/);
  assert.match(page,/type="tel" required minLength=\{5\}/);
  assert.match(page,/id="description" required minLength=\{1\} maxLength=\{2000\}/);
  assert.match(page,/setStep\(current => \(current \+ 1\) as ApplicationStep\)/);
  assert.match(page,/setStep\(current=>\(current-1\) as ApplicationStep\)/);
  assert.match(page,/disabled=\{submitting\}/);
  assert.match(page,/aria-label="Apply to sell on TreatStory"/);
  assert.match(page,/!applicationVisible/);
  assert.match(page,/sm:rounded-\[24px\] sm:border/);
  assert.match(page,/lg:sticky lg:top-24/);
});
