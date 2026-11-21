const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const root = path.resolve(__dirname,'../..');
function load(file, stubs={}) {
 const filename=path.join(root,file), m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const normal=m.require.bind(m);m.require=n=>Object.hasOwn(stubs,n)?stubs[n]:normal(n);
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return m.exports;
}
const returnPath=load('src/lib/auth/return-path.ts');
for (const value of ['/admin','/admin/users?cursor=next','/dashboard/projects/test#shots']) assert.equal(returnPath.authenticatedReturnPath(value),value);
for (const value of [null,'','https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','/login','/administer','/admin/../../login','/admin\n','/api/payments']) assert.equal(returnPath.authenticatedReturnPath(value),'/dashboard',String(value));
(async()=>{
 const pushes=[];let signingIn=true;let accountCalls=0;const Link=({children,...props})=>React.createElement('a',props,children);
 const auth=load('src/components/auth/convex-auth-form.tsx',{
 'react':{...React,useState:value=>[value,()=>{}]},'next/link':Link,'next/navigation':{useRouter:()=>({push:p=>pushes.push(p),refresh:()=>{}})},
 '@convex-dev/auth/react':{useAuthActions:()=>({signIn:async()=>({signingIn})})},'convex/react':{useMutation:()=>async()=>{accountCalls++;}},
 '@/lib/auth/return-path':returnPath,
 });
 global.window={location:{search:'?redirect=%2Fadmin%2Fusers'}};
 const form=auth.ConvexAuthForm({mode:'signIn'}),data=new FormData();data.set('email','fixture@example.test');data.set('password','fixture-only');
 await form.props.action(data);assert.equal(pushes.at(-1),'/admin/users');assert.equal(accountCalls,1);
 signingIn=false;await form.props.action(data);assert(pushes.at(-1).includes('redirect=%2Fadmin%2Fusers'));assert.equal(accountCalls,1);
 signingIn=true;window.location.search='?redirect=https%3A%2F%2Fevil.test';await form.props.action(data);assert.equal(pushes.at(-1),'/dashboard');
 const policy=load('src/lib/payments/launch-policy.ts');let role='ADMIN';
 const page=load('src/app/(admin)/admin/payments/page.tsx',{'next/link':Link,'@/lib/payments/launch-policy':policy,'@/lib/guards/platform':{requirePlatformRole:async allowed=>{if(!allowed.includes(role))throw Error('denied');}}});
 const html=renderToStaticMarkup(await page.default());assert(html.includes('Start at $3'));assert(html.includes('no expiry'));assert(!html.includes('<form'));assert(!html.includes('<button'));assert(html.includes('not active offers'));
 for (role of ['SUPPORT','MODERATOR']) await assert.rejects(page.default(),/denied/);
 console.log('PASS safe login destinations, verification handoff, owner-only policy and no purchase/activation controls. No database or paid requests.');
})().catch(e=>{console.error(e);process.exitCode=1;});
