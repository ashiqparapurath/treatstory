const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');

test('password recovery uses Firebase Authentication with the active website domain',async()=>{
  const calls=[];
  const auth={id:'firebase-auth'};
  const source=fs.readFileSync('src/lib/firebase-password-reset.ts','utf8');
  const module={exports:{}};
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:id=>{
    if(id==='firebase/auth')return {sendPasswordResetEmail:async(...args)=>calls.push(args)};
    throw Error('Unexpected dependency: '+id);
  },URL});
  await module.exports.requestFirebasePasswordReset(auth,' buyer@example.com ','https://treatstory.in');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],auth);
  assert.equal(calls[0][1],'buyer@example.com');
  assert.equal(calls[0][2].url,'https://treatstory.in/login');
  await module.exports.requestFirebasePasswordReset(auth,'buyer@example.com','https://www.treatstory.in');
  assert.equal(calls[1][2].url,'https://www.treatstory.in/login');
  await assert.rejects(()=>module.exports.requestFirebasePasswordReset(auth,'buyer@example.com','http://unsafe.example'),/secure website/);
  assert.equal(calls.length,2);
});

test('forgot-password UI does not use the Apps Script mail API',()=>{
  const src=fs.readFileSync('src/app/login/page.tsx','utf8');
  assert.match(src,/requestFirebasePasswordReset\(auth,email,window\.location\.origin\)/);
  assert.doesNotMatch(src,/requestAccountMail|\/api\/email\/account/);
});
