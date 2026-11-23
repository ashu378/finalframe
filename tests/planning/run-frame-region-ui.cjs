const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {getFunctionName}=require('convex/server');let states=[],index=0;const calls=[];
let repair={id:'old-paid',status:'COMPLETED',stage:'REVIEW_READY',canRequestFreshEstimate:false};let motion={eligible:true,sourceState:'APPROVED',projectId:'project',assetId:'source',seconds:2.5};
const filename=path.resolve(__dirname,'../../src/components/production-workspace/story-action-assistant.tsx'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod.require=name=>{
 if(name==='./performance-retake')return{PerformanceRetake:()=>null};
 if(name==='./timed-repair')return{TimedRepair:()=>null};
 if(name==='react')return{...React,useState(initial){const i=index++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
 if(name==='next/navigation')return{useRouter:()=>({refresh(){}})};
 if(name==='convex/react')return{useQuery:(ref,args)=>{if(args==='skip')return undefined;const name=getFunctionName(ref);if(name==='storyActionChecks:get')return null;if(name==='storyActionRepairs:motionOption')return motion;if(name==='storyActionRepairs:get')return repair;if(name==='storyActionRepairs:sourceApproval')return{state:'APPROVED',repairUnavailable:false};throw Error(name);},useAction:ref=>async args=>{calls.push({name:getFunctionName(ref),args});return{estimateId:'new-estimate',quoteHash:'new-hash',providerHoldMicros:100000,totalCredits:9};},useMutation:ref=>async args=>{calls.push({name:getFunctionName(ref),args});repair={id:'fresh',status:'QUEUED',canRequestFreshEstimate:false};}};
 if(name.endsWith('/_generated/api'))return{api:require('../../convex/_generated/api.js').api};
 if(name==='@/components/ui/button')return{Button:props=>React.createElement('button',props)};
 return require(name);
};mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
function elements(node){return Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];}
function text(node){return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node&&node.props?text(node.props.children):'';}
function render(){index=0;return elements(mod.exports.StoryActionAssistant({takeId:'source',canEdit:true,humanFailed:true}));}
(async()=>{
 let tree=render();assert.equal(calls.length,0);let button=tree.find(n=>text(n)==='Prepare source frames — see motion cost');assert(button.props.disabled);
 tree.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=render();button=tree.find(n=>text(n)==='Prepare source frames — see motion cost');assert.equal(button.props.disabled,false);button.props.onClick();await new Promise(setImmediate);
 assert.deepEqual(calls,[{name:'storyActionRepairs:estimate',args:{takeId:'source',mode:'ANIMATE_MOTION',cartoonSourceConfirmed:true}}]);
 tree=render();assert(tree.some(n=>text(n).includes('four-second retiming')));assert(tree.some(n=>text(n).includes('conservative application reserve')));
 tree.find(n=>text(n)==='Confirm this shot repair').props.onClick();await new Promise(setImmediate);assert.deepEqual(calls[1],{name:'generationJobs:createReviewedTake',args:{estimateId:'new-estimate',quoteHash:'new-hash'}});
 motion={eligible:false,job:{id:'accepted-motion',status:'FAILED',canResumeSavedOutput:true}};tree=render();assert(!tree.some(n=>text(n)==='Prepare source frames — see motion cost'));assert(tree.some(n=>text(n)==='Resume saved motion · no new AI purchase'));assert.equal(calls.length,2);
 console.log('PASS explicit cartoon confirmation → no-cost frame preparation/quote → separate purchase confirmation; retiming/reserve disclosed and accepted result is resume-only');
})().catch(e=>{console.error(e);process.exitCode=1;});
