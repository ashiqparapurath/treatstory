const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

const read = path => fs.readFileSync(path, 'utf8');
function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, {module,exports:module.exports,require:id => mocks[id] ?? require(id)}, { filename:file });
  return module.exports;
}

test('Google sign-in uses Firebase popup and never changes authenticated roles locally', async () => {
  const calls=[];const notices=[];
  const auth={testAuth:true};
  let popupResult={user:{uid:'firebase-user'}};
  let rejectCode=null;
  class Provider {setCustomParameters(args){calls.push(['params',args]);}}
  const {GoogleSignInButton}=load('src/components/google-sign-in-button.tsx',{
    'firebase/auth': {
      GoogleAuthProvider:Provider,
      signInWithPopup:async (instance,provider) => {calls.push(['popup',instance,provider]);if(rejectCode)throw {code:rejectCode};return popupResult;},
    },
    '@/hooks/use-toast':{useToast:()=>({toast:x=>notices.push(x)})},
  });
  let done=0;
  let tree;await act(async()=>{tree=create(React.createElement(GoogleSignInButton,{auth,onSuccess:()=>done++}));});
  const button=()=>tree.root.findByType('button');
  assert.equal(button().props.type,'button');
  assert.equal(button().props['aria-busy'],false);
  await act(async()=>{await button().props.onClick();});
  assert.equal(done,1);assert.equal(calls.find(x=>x[0]==='popup')[1],auth);
  assert.equal(calls.find(x=>x[0]==='params')[1].prompt,'select_account');
  rejectCode='auth/popup-closed-by-user';
  await act(async()=>{await button().props.onClick();});
  assert.equal(notices.length,0,'closing Google account chooser is not an error');
  rejectCode='auth/popup-blocked';
  await act(async()=>{await button().props.onClick();});
  assert.equal(notices.at(-1).title,'Google sign-in was blocked');
  assert.doesNotMatch(JSON.stringify(notices),/token|secret|credential/i,'Never display provider secrets');
  rejectCode='auth/unauthorized-domain';
  await act(async()=>{await button().props.onClick();});
  assert.equal(notices.at(-1).title,'Google sign-in is not configured');
  await act(async()=>tree.unmount());
});

test('signup matches mobile iOS-style login, has Google and preserves account security', () => {
  const signup=read('src/app/register/page.tsx'),login=read('src/app/login/page.tsx');
  for(const phrase of [
    'bg-[#f5f5f7]', 'brand-wordmark absolute left-1/2', 'rounded-[17px] border border-[#e5e5ea]',
    'border-t border-[#eeeef0]', 'rounded-[15px] bg-[#1c1c1e]',
    'sm:rounded-full sm:bg-[#29251f]', 'GoogleSignInButton',
    'sm:space-y-5 sm:overflow-visible sm:rounded-none sm:border-0'
  ]) {
    assert.ok(signup.includes(phrase),'signup missing '+phrase);
    assert.ok(login.includes(phrase),'login missing '+phrase);
  }
  assert.match(signup,/createUserWithEmailAndPassword\(auth, email\.trim\(\), password\)/);
  assert.match(signup,/updateProfile\(result\.user, \{displayName:name\.trim\(\)\}\)/);
  assert.match(signup,/requestAccountMail\('verify-email'/);
  assert.match(signup,/requestAccountMail\('welcome'/);
  assert.match(signup,/minLength=\{6\}/);
  assert.match(signup,/autoComplete="new-password"/);
  assert.match(signup,/router\.replace\(nextDestination\(\)\)/);
  assert.match(signup,/next\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\)/);
  assert.match(signup,/aria-pressed=\{showPassword\}/);
  assert.match(signup,/GoogleSignInButton auth=\{auth\} disabled=\{submitting\}/);
  assert.match(login,/GoogleSignInButton auth=\{auth\} disabled=\{isLoading\}/);
  assert.match(login,/!resetMode && <div/);
  assert.match(login,/setRegisterHref\('\/register\?next=' \+ encodeURIComponent\(next\)\)/);
  assert.match(signup,/setSignInHref\('\/login\?next=' \+ encodeURIComponent\(next\)\)/);
  assert.match(signup,/href=\{signInHref\}/);
  assert.match(login,/href=\{registerHref\}/);
});
