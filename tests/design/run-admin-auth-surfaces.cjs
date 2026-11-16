const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Link = ({children,...props}) => React.createElement('a',props,children);
const contracts = load('src/lib/platform-admin/contracts.ts');
let role = 'ADMIN', authorized = true, calls = [];
const row = {id:'record',title:'Example record',subtitle:'Private record summary',createdAt:1,status:'OPEN',details:{projectId:'project',amount:10}};
const inventory = load('src/components/admin/platform-inventory.tsx',{
 'next/link':Link,'@/lib/guards/platform':{requirePlatformRole:async roles=>{ if(!authorized || !roles.includes(role)) throw Error('denied'); return {role}; }},
 '@/lib/platform-admin/contracts':contracts,
 '@/lib/platform-admin/actions':{getPlatformInventory:async args=>{calls.push(args);return{rows:[row],continueCursor:'next-token',isDone:false}}},
 './platform-action-form':{PlatformActionForm:props=>React.createElement('button',{'data-action':props.action},props.label)}
});
(async()=>{
 let html = renderToStaticMarkup(await inventory.PlatformInventory({kind:'reports',cursor:'saved',reportStatus:'OPEN'}));
 assert.deepEqual(calls[0],{kind:'reports',cursor:'saved',reportStatus:'OPEN'});
 assert(html.includes('data-action="DECIDE_REPORT"'));assert(html.includes('View record details'));assert(html.includes('<details'));
 assert(html.includes('cursor=next-token'));assert(html.includes('status=OPEN'));assert(html.includes('aria-current="page"'));
 console.log('PASS report filters/cursor and precise decision action survive the new disclosure layout');
 role='SUPPORT';html=renderToStaticMarkup(await inventory.PlatformInventory({kind:'users'}));assert(!html.includes('data-action='));
 role='ADMIN';row.status='disabled';html=renderToStaticMarkup(await inventory.PlatformInventory({kind:'users'}));assert(html.includes('data-action="ENABLE_USER"'));assert(html.includes('data-action="ROLE"'));
 console.log('PASS account actions stay ADMIN-only and retain enable/manage-role decisions');
 const count=calls.length;authorized=false;await assert.rejects(()=>inventory.PlatformInventory({kind:'users'}),/denied/);assert.equal(calls.length,count);authorized=true;
 console.log('PASS unauthorized inventory access fails before records are queried');
 const forms=load('src/lib/auth/forms.tsx',{'next/link':Link,'./actions':{requestPasswordReset:async()=>{},updatePassword:async()=>{}},'@/components/auth/convex-auth-form':{ConvexAuthForm:({mode})=>React.createElement('form',{'data-mode':mode})}});
 const login=renderToStaticMarkup(React.createElement(forms.LoginForm)), signup=renderToStaticMarkup(React.createElement(forms.SignupForm));
 assert.equal((login.match(/<form/g)||[]).length,1);assert(login.includes('data-mode="signIn"'));assert.equal((signup.match(/<form/g)||[]).length,1);assert(signup.includes('data-mode="signUp"'));
 console.log('PASS login/signup retain exactly one canonical Convex form each');
 const recoveryOff=renderToStaticMarkup(React.createElement(forms.ForgotPasswordForm)), recoveryOn=renderToStaticMarkup(React.createElement(forms.ForgotPasswordForm,{emailEnabled:true}));
 assert(!recoveryOff.includes('<form'));assert(recoveryOn.includes('<form'));assert(recoveryOff.includes('href="/login"'));
 console.log('PASS email recovery stays disabled by default and respects its existing explicit flag');
 const {OptionCard}=load('src/components/onboarding/option-card.tsx');let clicked=0;const option=OptionCard({label:'My media',selected:true,onClick:()=>clicked++});assert.equal(option.props['aria-pressed'],true);option.props.onClick();assert.equal(clicked,1);assert.equal(option.props.type,'button');
 console.log('PASS optional setup choices retain their callbacks and expose selection accessibly');
 console.log('6 admin/auth/setup presentation groups passed. No online database or paid provider calls.');
})().catch(error=>{console.error(error);process.exitCode=1});
