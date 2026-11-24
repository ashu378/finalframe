const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const ts = require('typescript');
const {getFunctionName} = require('convex/server');

const file = path.resolve('src/components/production-workspace/automatic-performance-repair.tsx');
const entry = new Module(file, module);
entry.filename = file;
entry.paths = Module._nodeModulePaths(path.dirname(file));
const slots = [], calls = [], visits = [];
let cursor, price, result, persisted = null, routeId='project_x|y';
const routeFile=path.resolve('src/lib/project/route-id.ts');
const routeIdModule=new Module(routeFile,module);
routeIdModule._compile(ts.transpileModule(fs.readFileSync(routeFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,routeFile);
function slot(value) {
  const key = cursor++;
  if (!(key in slots)) slots[key] = value;
  return [slots[key], next => { slots[key] = next; }];
}
const mocks = {
  react: {...React, useState: slot, useRef: value => slot({current:value})[0]},
  'convex/react': {useQuery: () => persisted, useAction: ref => async args => {
    const method = getFunctionName(ref).split(':')[1];
    calls.push({method,args});
    if (method === 'estimate') return {maximumCostUsd:price, candidateCount:2, quoteKey:'bound-quote'};
    persisted = result;
    return result;
  }},
  'next/navigation': {
    useRouter: () => {throw new Error('Review must navigate directly to the newly saved take');},
    useParams: () => ({id:routeId}),
    useSearchParams: () => new URL(window.location.href).searchParams,
  },
  '@/components/ui/button': {Button:'button'},
  '@/lib/project/route-id':routeIdModule.exports,
};
entry.require = name => mocks[name] || require(name);
entry._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
global.window = {location:{href:'https://finalframe.test/dashboard/projects/project_x%7Cy/workspace/storyboard?production=episode&clipStep=make&shot=old&take=failed'}};
function walk(element) {
  if (Array.isArray(element)) return element.flatMap(walk);
  return element?.props ? [element,...walk(element.props.children)] : [];
}
function elements() {
  cursor = 0;
  return walk(entry.exports.AutomaticPerformanceRepair({takeId:'failed'}));
}
function button(label) {
  const found = elements().find(element=>element.type==='button' && element.props.children===label);
  assert(found, label);
  return found;
}
function reviewLink(take) {
  const link=elements().find(e=>e.type==='a' && e.props.children==='Review repaired take');
  assert(link);
  assert.equal(link.props.onClick,undefined,'The browser must request the exact destination in a single navigation.');
  const target=new URL(link.props.href,window.location.href);
  assert.equal(target.pathname,'/dashboard/projects/project_x%7Cy/workspace/takes');
  assert.deepEqual(Object.fromEntries(target.searchParams),{production:'episode',clipStep:'review',shot:'shot',take});
  return target;
}
function reset() {slots.length=0;calls.length=0;visits.length=0;persisted=null;}
const settle=()=>new Promise(setImmediate);
(async()=>{
  price=0.08;
  result={status:'SAVED',shotId:'shot',shotVersionId:'draft',assetId:'output'};
  const start = button('Find footage and fix this shot');
  assert.deepEqual(calls,[]);
  start.props.onClick(); start.props.onClick(); await settle();
  assert.deepEqual(calls.map(c=>c.method),['estimate']);
  const confirm=button('Confirm search and repair');
  confirm.props.onClick(); confirm.props.onClick(); await settle();
  assert.deepEqual(calls,[{method:'estimate',args:{takeId:'failed'}},{method:'launch',args:{takeId:'failed',quoteKey:'bound-quote'}}]);
  const target=reviewLink('draft');
  routeId='project_x%7Cy'; // A proxy-preserved dynamic segment must never become %257C.
  assert.equal(reviewLink('draft').href,target.href);
  window.location.href=target.href;
  reviewLink('draft'); // Reloading the saved review keeps the same exact take.

  reset();price=0;result={status:'NO_MATCH',message:'No clear performance in your project clips.'};
  button('Find footage and fix this shot').props.onClick();await settle();
  assert.deepEqual(calls.map(c=>c.method),['estimate','launch']);
  assert(elements().some(e=>e.props.role==='status' && e.props.children===result.message));
  assert.deepEqual(visits,[]);
  reset();price=NaN;
  button('Find footage and fix this shot').props.onClick();await settle();
  assert.deepEqual(calls.map(c=>c.method),['estimate']);assert(elements().some(e=>e.props.role==='alert'));
  reset();persisted={status:'RUNNING'};
  assert(elements().some(e=>e.props.role==='status' && /return to review/.test(e.props.children)));
  assert(!elements().some(e=>e.type==='button'));
  persisted={status:'SAVED',shotId:'shot',shotVersionId:'saved-in-background',assetId:'output'};
  reviewLink('saved-in-background');
  assert.deepEqual(calls,[]);
  console.log('PASS automatic search UI: no passive purchase, capped confirmation, no donor or timing input, duplicate suppression, draft-only review, zero-cost/no-match, invalid estimate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
