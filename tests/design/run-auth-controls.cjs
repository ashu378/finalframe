const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '../..');
function load(file, stubs) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const values = []; let cursor = 0, payload, ensured, destination, refreshes = 0, fails = false;
const mocks = {
  react: { ...React, useState: initial => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; } },
  'next/link': ({children,...props}) => React.createElement('a',props,children),
  'next/navigation': { useRouter: () => ({push: value => { destination = value; },refresh: () => { refreshes++; }}) },
  '@convex-dev/auth/react': {useAuthActions: () => ({signIn: async (provider,args) => { assert.equal(provider,'password');payload=args;if(fails) throw Error('PRIVATE PROVIDER TRACE');return {signingIn:true}; }})},
  'convex/react': {useMutation: () => async args => { ensured = args; }},
  '../../../convex/_generated/api': {api:{account:{ensureAccount:'ensure'}}},
};
const {ConvexAuthForm} = load('src/components/auth/convex-auth-form.tsx',mocks);
const render = mode => {cursor=0;return ConvexAuthForm({mode});};
function nodes(node,result=[]) { if (!React.isValidElement(node)) return result; result.push(node); React.Children.forEach(node.props.children,child=>nodes(child,result)); return result; }
(async()=>{
  let form=render('signIn');let controls=nodes(form);
  assert.equal(controls.find(n=>n.type==='input'&&n.props.name==='password').props.type,'password');
  const toggle=controls.find(n=>n.type==='button'&&n.props.type==='button');assert.equal(toggle.props['aria-label'],'Show password');toggle.props.onClick();
  controls=nodes(render('signIn'));assert.equal(controls.find(n=>n.type==='input'&&n.props.name==='password').props.type,'text');assert.equal(controls.find(n=>n.type==='button'&&n.props.type==='button').props['aria-pressed'],true);
  assert(controls.find(n=>n.props.href==='/forgot-password'));
  console.log('PASS password visibility is a non-submit accessible control; recovery link remains available');
  const data=new FormData();data.set('email','  PERSON@Example.com  ');data.set('password','secret123');data.set('fullName','  Example Creator  ');
  form=render('signUp');await form.props.action(data);
  assert.deepEqual(payload,{flow:'signUp',email:'person@example.com',password:'secret123',name:'Example Creator'});assert.deepEqual(ensured,{name:'Example Creator'});assert.equal(destination,'/dashboard');assert.equal(refreshes,1);
  controls=nodes(render('signUp'));const password=controls.find(n=>n.props.name==='password');assert.equal(password.props.minLength,8);assert.equal(password.props.autoComplete,'new-password');assert(controls.find(n=>n.props.name==='fullName'&&n.props.autoComplete==='name'));
  console.log('PASS real signup submit retains canonical payload, account setup and dashboard destination');
  fails=true;await render('signIn').props.action(data);form=render('signIn');controls=nodes(form);assert.equal(form.props['aria-busy'],false);const alert=controls.find(n=>n.props.role==='alert');assert(alert);assert(!String(alert.props.children).includes('PRIVATE'));assert(!controls.find(n=>n.props.type==='submit').props.disabled);
  console.log('PASS provider failure stays private and restores the submit control');
})().catch(error=>{console.error(error);process.exitCode=1});
