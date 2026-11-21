const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {create,act} = require('react-test-renderer');

function load(file,mocks={},globals={}) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true
  }}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:id=>id in mocks?mocks[id]:require(id),console,URLSearchParams,...globals},{filename:file});
  return module.exports;
}
const policy=load('src/lib/signup-password-policy.ts');

test('signup password requirements match TreatStory Firebase policy',()=>{
  const valid='TreatStory123!';
  assert.equal(valid.length>=12,true);
  assert.equal(policy.meetsSignupPasswordPolicy(valid),true);
  const cases=[
    ['treatstory123!', 'uppercase'],
    ['TREATSTORY123!', 'lowercase'],
    ['TreatStory!!!!', 'number'],
    ['TreatStory1234', 'special'],
    ['Ab1!', 'length'],
    ['Aa1!'+'x'.repeat(4093), 'length'],
    ['TreatStory12🙂', 'special'],
  ];
  for(const [password,missing] of cases) {
    assert.equal(policy.meetsSignupPasswordPolicy(password),false);
    assert.equal(policy.signupPasswordRequirements(password).find(rule=>rule.key===missing).met,false);
  }
  assert.equal(policy.meetsSignupPasswordPolicy('Aa1!'+'x'.repeat(4092)),true,'4096 characters is accepted');
  assert.equal(policy.meetsSignupPasswordPolicy('TreatStory123['),true,'Firebase-supported punctuation is accepted');
  const notice=policy.signupPasswordNotice('abc123');
  assert.equal(notice.field,'password');
  assert.match(notice.description,/12–4,096 characters/);
  assert.equal(policy.signupPasswordNotice(valid),null);
});

test('signup shows a responsive checklist and blocks weak passwords before Firebase account creation',async()=>{
  const notices=[],created=[],firebaseValidated=[],routes=[],mail=[];
  let firebaseValid=false;
  const auth={id:'mock-auth'};
  const {default:Register}=load('src/app/register/page.tsx',{
    'next/navigation':{useRouter:()=>({replace:href=>routes.push(href)})},
    'next/link':'a',
    '@/firebase':{useAuth:()=>auth},
    '@/lib/user-notices':{
      validateEmail:email=>email.includes('@')?null:{title:'Invalid email',description:'Invalid email',field:'email'},
      getErrorNotice:()=>({title:'Could not create account',description:'Please retry'}),
    },
    '@/lib/signup-password-policy':policy,
    '@/lib/account-mail':{requestAccountMail:async(action)=>mail.push(action)},
    '@/components/google-sign-in-button':{GoogleSignInButton:()=>null},
    '@/components/ui/button':{Button:'button'},
    '@/components/ui/input':{Input:props=>React.createElement('input',props)},
    '@/components/ui/label':{Label:'label'},
    '@/hooks/use-toast':{useToast:()=>({toast:item=>notices.push(item)})},
    'lucide-react':new Proxy({}, {get:()=>()=>null}),
    'firebase/auth':{
      createUserWithEmailAndPassword:async(...args)=>{created.push(args);return {user:{uid:'new-user'}};},
      updateProfile:async()=>{},
      validatePassword:async(...args)=>{firebaseValidated.push(args);return {isValid:firebaseValid};},
    }
  },{window:{location:{search:''}}});
  let tree;await act(async()=>{tree=create(React.createElement(Register));});
  const input=id=>tree.root.findByProps({id});
  const change=(id,value)=>act(()=>input(id).props.onChange({target:{value}}));
  change('registerName','Test User');
  change('email','buyer@example.com');
  assert.equal(tree.root.findAllByType('li').length,5,'all requirements are visible before typing');
  change('password','abc');
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(firebaseValidated.length,0,'invalid password never reaches Firebase');
  assert.equal(created.length,0);
  assert.match(notices.at(-1).description,/uppercase letter/);
  change('password','TreatStory123!');
  assert.equal(tree.root.findAllByType('li').length,5);
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(firebaseValidated.length,1,'local valid password is checked against current Firebase policy');
  assert.equal(created.length,0,'Firebase policy mismatch stops account creation');
  firebaseValid=true;
  await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(created.length,1);
  assert.equal(created[0][0],auth);
  assert.equal(created[0][1],'buyer@example.com');
  assert.equal(created[0][2],'TreatStory123!');
  assert.equal(mail.join(','),'verify-email,welcome');
  assert.equal(routes.at(-1),'/dashboard');
  await act(async()=>tree.unmount());
});

test('signup registration page exposes the policy to mobile and assistive technology',()=>{
  const source=fs.readFileSync('src/app/register/page.tsx','utf8');
  assert.match(source,/id="signup-password-requirements"/);
  assert.match(source,/aria-describedby=\{formError\?'registration-error signup-password-requirements':'signup-password-requirements'\}/);
  assert.match(source,/minLength=\{12\} maxLength=\{4096\}/);
  assert.match(source,/min-\[360px\]:grid-cols-2/);
  assert.match(source,/passwordRequirements\.map/);
  assert.doesNotMatch(source,/At least 6 characters/);
});
