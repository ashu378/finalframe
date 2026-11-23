const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), React = require('react');
const {getFunctionName} = require('convex/server');
const filename = path.resolve(__dirname,'../../src/components/production-workspace/performance-retake.tsx');
const mod = new Module(filename,module); mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
let index=0, option={projectId:'project',assetId:'source',audioAssetId:'recording',duration:8,state:'APPROVED',audioState:'DRAFT'};
const states=[], calls=[];
mod.require = name=>{
  if(name==='react') return {...React,useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=v;}];},useRef(initial){const i=index++;return states[i]??(states[i]={current:initial});}};
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
  if(name==='convex/react') return {
    useQuery(ref,args){if(args==='skip')return;switch(getFunctionName(ref)){
      case 'storyActionRepairs:performanceOption':return option;
      case 'assetStorage:listProjectAssets':return [{_id:'pic',scope:'PROJECT',storageId:'img',mimeType:'image/png',name:'Biscuit cast'}];
      case 'resourceStates:get':return {state:'LOCKED'};
      default:throw Error(getFunctionName(ref));}},
    useAction:ref=>async args=>{calls.push([getFunctionName(ref),args]);return {estimateId:'est',quoteHash:'hash',model:'reviewed performance model',totalCredits:103,providerHoldMicros:1700001};},
    useMutation:ref=>async args=>{const op=getFunctionName(ref);calls.push([op,args]);if(op==='approvals:approve')option.audioState='APPROVED';if(op==='generationJobs:createReviewedTake')option={job:'QUEUED'};}
  };
  if(name.endsWith('/_generated/api'))return {api:require('../../convex/_generated/api.js').api};
  if(name==='@/components/ui/button')return {Button:p=>React.createElement('button',p)};
  return require(name);
};
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
function elements(n){return Array.isArray(n)?n.flatMap(elements):n?.props?[n,...elements(n.props.children)]:[];}
function text(n){return typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';}
function tree(){index=0;return elements(mod.exports.PerformanceRetake({takeId:'failed'}));}
async function click(label){tree().find(n=>text(n)===label).props.onClick();await new Promise(setImmediate);}
(async()=>{
  let ui=tree();assert.equal(calls.length,0);
  ui.find(n=>n.type==='select').props.onChange({target:{value:'pic'}});
  assert(!tree().some(n=>text(n)==='See performance price'));
  await click('Approve the original recording');
  assert.deepEqual(calls.map(c=>c[0]),['approvals:submitForReview','approvals:approve']);
  await click('See performance price');
  assert.deepEqual(calls[2],['storyActionRepairs:estimatePerformance',{takeId:'failed',imageId:'pic',qualityTier:'PREMIUM'}]);
  assert(!calls.some(([op])=>op==='generationJobs:createReviewedTake'));
  assert(tree().some(n=>text(n).includes('reviewed performance model')));
  await click('Confirm new performance');
  assert.deepEqual(calls[3],['generationJobs:createReviewedTake',{estimateId:'est',quoteHash:'hash'}]);
  assert(tree().some(n=>text(n).includes('queued')));assert(!tree().some(n=>text(n)==='Confirm new performance'));
  console.log('PASS actual review controls: select approved picture, approve separate recording, premium price, separate purchase confirmation, saved job across reload.');
})().catch(e=>{console.error(e);process.exitCode=1;});
