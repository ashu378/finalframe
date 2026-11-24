const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const ts = require('typescript');
const {getFunctionName} = require('convex/server');

const file = path.resolve('src/components/production-workspace/performance-cutaway.tsx');
const component = new Module(file, module);
component.filename = file;
component.paths = Module._nodeModulePaths(path.dirname(file));
const options = {shotId:'shot', videos:[{id:'a',title:'Kitchen'},{id:'b',title:'Close-up'}], targetStartFrame:115,targetEndFrame:138,fps:24};
const states = new Map(), queries = [], writes = [], visits=[];
let scope, cursor;
function slot(initial) {
  const key = scope + ':' + cursor++;
  if (!states.has(key)) states.set(key, initial);
  return [states.get(key), next => states.set(key, next)];
}
const mocks = {
  react: {...React, useState:slot, useRef:value=>slot({current:value})[0]},
  'convex/react': {useQuery(ref,args) {queries.push(args); return args === 'skip' ? undefined : options;},
    useAction: ref => async args => {writes.push([getFunctionName(ref), args]);return {shotVersionId:'new',assetId:'output'};}},
  'next/navigation':{useRouter:()=>({refresh(){},push(url){visits.push(url);}})},
  '@/components/ui/button':{Button:'button'},
  './automatic-performance-repair':{AutomaticPerformanceRepair:'automatic-repair'},
};
component.require = name => mocks[name] || require(name);
component._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,file);
function render(fn, props) {scope = fn.name;cursor=0;return fn(props);}
function walk(node) {
  if (Array.isArray(node)) return node.flatMap(walk);
  return node?.props ? [node,...walk(node.props.children)] : [];
}
function panel() {return render(component.exports.PerformanceCutaway,{takeId:'failed'});}
function content() {const form=walk(panel()).find(node=>node.type?.name==='CutawayForm');return walk(render(form.type,form.props));}
function ranges() {return content().filter(node=>node.type?.name==='ClipRange');}
function save() {return content().find(n=>n.type==='button' && String(n.props.children).startsWith('Save new take'));}
(async()=>{
  const closed=panel();
  assert.deepEqual(queries[0],{shotVersionId:'failed',includeVideos:false});
  assert(!walk(closed).some(n=>n.props.children==='Open approved take'));
  options.approvedRepair={shotVersionId:'approved-sibling',versionNumber:12};
  const shortcut=walk(panel()).find(n=>n.props.children==='Open approved take');
  assert(shortcut);
  global.window={location:{href:'https://finalframe.test/workspace?production=part-1&take=failed'}};
  shortcut.props.onClick();
  assert( visits[0].includes('take=approved-sibling') && visits[0].includes('production=part-1') && visits[0].includes('clipStep=review') );
  assert.deepEqual(writes,[]);
  options.approvedRepair=null;
  walk(panel()).find(n=>n.type==='details').props.onToggle({currentTarget:{open:true}});
  assert.deepEqual(ranges().map(n=>[n.props.start,n.props.end]),[['115','137'],['','']]);
  ranges()[0].props.choose('a');
  assert.deepEqual(ranges()[1].props.videos.map(v=>v.id),['b']);
  ranges()[1].props.choose('b');
  ranges()[1].props.changeStart('28');
  assert(save().props.disabled);
  ranges()[1].props.changeEnd('68');
  assert(!save().props.disabled);
  const doubleClick=save().props.onClick;
  doubleClick();doubleClick();await new Promise(setImmediate);
  assert.deepEqual(writes,[['performanceCutaways:save',{shotVersionId:'failed',shotId:'shot',baseAssetId:'a',donorAssetId:'b',targetStartFrame:115,targetEndFrame:138,donorStartFrame:28,donorEndFrame:69}]]);
  assert(content().some(n=>n.props.children==='Review the new take'));
  console.log('PASS one-click approved correction without a save or render, lazy media list, suggested action window, end-frame inclusion, explicit save, double-click guard, review of new take');
})().catch(err=>{console.error(err);process.exitCode=1;});
