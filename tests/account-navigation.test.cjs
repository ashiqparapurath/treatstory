const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const read = path => fs.readFileSync(path,'utf8');
const menuSource=read('src/lib/more-navigation.ts');
const iconMocks=new Proxy({}, {get:()=>()=>null});
const code=ts.transpileModule(menuSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const moduleRef={exports:{}};
vm.runInNewContext(code,{module:moduleRef,exports:moduleRef.exports,require:id=>id==='lucide-react'?iconMocks:require(id)});
const {morePageSections}=moduleRef.exports;

test('More shows a single Account settings hub, not duplicate nested settings',()=>{
  for(const role of ['admin','seller','customer']){
    const account=morePageSections(role,true,{orders:false,applications:false}).account;
    const hrefs=Array.from(account,item=>item.href);
    assert.deepEqual(hrefs,['/account/settings']);
    assert.equal(account[0].label, 'Account settings');
    assert.equal(new Set(hrefs).size,hrefs.length);
    assert.ok(hrefs.every(h=>!h.includes('#') && h!=='/account'),'Account settings must be a real page');
  }
  assert.equal(morePageSections(null,false,{orders:false,applications:false}).account.length,0);
  const morePage=read('src/app/more/page.tsx');
  assert.match(morePage, /<MenuSection heading="Account & preferences" items=\{sections.account\} \/>/);
  const hub=read('src/app/account/settings/page.tsx');
  for(const link of ['/account/personal','/account/delivery','/notifications','/account/privacy']){
    assert.ok(hub.includes(link),'The Account settings page should offer '+link);
    assert.ok(!menuSource.includes("href: '"+link+"'"),'More should not duplicate '+link);
  }

});

test('All account destinations exist and each page contains only its relevant settings',()=>{
  const pages=[
    ['src/app/account/settings/page.tsx','Account settings'],
    ['src/app/account/personal/page.tsx','Personal information'],
    ['src/app/account/delivery/page.tsx','Delivery addresses'],
    ['src/app/account/privacy/page.tsx','Privacy & security'],
  ];
  for (const [file,title] of pages){
    const source=read(file);
    assert.match(source,/export default function /,file);
    assert.ok(source.includes('title="'+title+'"'),file);
    assert.match(source,/AccountPreferencesShell/,file);
  }
  const hub=read(pages[0][0]);
  for(const href of ['/account/personal','/account/delivery','/account/privacy','/notifications'])assert.ok(hub.includes(href));
  const personal=read(pages[1][0]);
  assert.match(personal,/updateProfile\(user, \{ displayName: value \}\)/);
  assert.match(personal,/<AccountEmailSettings/);
  assert.doesNotMatch(personal,/SavedAddressList|DeleteAccountSection/);
  const delivery=read(pages[2][0]);
  assert.match(delivery,/<SavedAddressList \/>/);
  assert.doesNotMatch(delivery,/DeleteAccountSection|AccountEmailSettings/);
  const privacy=read(pages[3][0]);
  assert.match(privacy,/role === 'admin'/);
  assert.match(privacy,/roleError/);
  assert.match(privacy,/<DeleteAccountSection/);
  assert.doesNotMatch(privacy,/SavedAddressList|AccountEmailSettings/);
  const profile=read('src/app/account/page.tsx');
  for(const href of ['/account/settings','/account/personal','/account/delivery','/account/privacy'])assert.ok(profile.includes(href));
  assert.doesNotMatch(profile,/#profile-details|#delivery-address|#delete-account/);
  assert.doesNotMatch(profile,/<DefaultDeliveryAddress|<AccountEmailSettings|<DeleteAccountSection/);
});

test('Account setting pages require authentication and preserve More breadcrumbs and stepwise back',()=>{
  const shell=read('src/components/account-preferences-shell.tsx');
  const trail=read('src/components/more-navigation-trail.tsx');
  assert.match(shell,/useUser\(\)/);
  assert.match(shell,/!isUserLoading && !user/);
  assert.match(shell,/router.replace\('\/login\?next=' \+ encodeURIComponent\(pathname\)\)/);
  assert.match(shell,/aria-label="Account settings breadcrumb"/);
  assert.match(shell,/href="\/account\/settings"/);
  assert.match(shell,/href="\/more"/);
  assert.match(trail,/moreJourneyBackLabel\(previous\)/);
  assert.match(trail,/Back to More/);
  assert.doesNotMatch(trail,/fixed|shadow-/, 'Back should remain integrated under the header');
});
