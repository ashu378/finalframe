const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {getFunctionName}=require('convex/server');let states=[],index=0;const calls=[];
let repair={id:'failed',status:'FAILED',stage:'FAILED',canRequestFreshEstimate:true};
const filename=path.resolve(__dirname,'../../src/components/production-workspace/story-action-assistant.tsx'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod.require=name=>{
 if(name==='react')return{...React,useState(initial){const i=index++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
 if(name==='next/navigation')return{useRouter:()=>({refresh(){}})};
 if(name==='convex/react')return{useQuery:(ref,args)=>{if(args==='skip')return undefined;const name=getFunctionName(ref);if(name==='storyActionChecks:get')return null;if(name==='storyActionRepairs:get')return repair;if(name==='storyActionRepairs:sourceApproval')return{state:'APPROVED',repairUnavailable:false};throw Error(name);},useAction:ref=>async args=>{calls.push({name:getFunctionName(ref),args});return{estimateId:'new-estimate',quoteHash:'new-hash',providerHoldMicros:100000,totalCredits:9};},useMutation:ref=>async args=>{calls.push({name:getFunctionName(ref),args});repair={id:'fresh',status:'QUEUED',canRequestFreshEstimate:false};}};
 if(name.endsWith('/_generated/api'))return{api:require('../../convex/_generated/api.js').api};
 if(name==='@/components/ui/button')return{Button:props=>React.createElement('button',props)};
 return require(name);
};mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
function elements(node){return Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];}
function text(node){return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node&&node.props?text(node.props.children):'';}
function render(){index=0;return elements(mod.exports.StoryActionAssistant({takeId:'source',canEdit:true,humanFailed:true}));}
(async()=>{
 let tree=render();assert.equal(calls.length,0);tree.find(n=>text(n)==='Retry local preparation — see fresh cost').props.onClick();await new Promise(setImmediate);assert.deepEqual(calls,[{name:'storyActionRepairs:estimate',args:{takeId:'source',retryOfJobId:'failed'}}]);
 tree=render();tree.find(n=>text(n)==='Confirm this shot repair').props.onClick();await new Promise(setImmediate);assert.deepEqual(calls[1],{name:'generationJobs:createReviewedTake',args:{estimateId:'new-estimate',quoteHash:'new-hash'}});tree=render();assert(!tree.some(n=>text(n)==='Retry local preparation — see fresh cost'));assert(!tree.some(n=>text(n)==='Confirm this shot repair'));
 repair={id:'accepted',status:'FAILED',canRequestFreshEstimate:false,canResumeSavedOutput:true};tree=render();assert(!tree.some(n=>text(n)==='Retry local preparation — see fresh cost'));assert(tree.some(n=>text(n)==='Resume saved repair · no new AI purchase'));assert.equal(calls.length,2);
 console.log('PASS local-preparation recovery requires deliberate fresh estimate then exact confirmation; mount/reload never purchase; accepted output retains resume-only action');
})().catch(e=>{console.error(e);process.exitCode=1;});
