const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server'),{getFunctionName}=require('convex/server');
let source={projectId:'project',assetId:'asset',state:'APPROVED',repairUnavailable:false};
const filename=path.resolve(__dirname,'../../src/components/production-workspace/story-action-assistant.tsx'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod.require=name=>{
 if(name==='./performance-retake')return{PerformanceRetake:()=>null};
 if(name==='./timed-repair')return{TimedRepair:()=>null};
 if(name==='convex/react')return{useQuery:ref=>getFunctionName(ref)==='storyActionRepairs:sourceApproval'?source:undefined,useAction:()=>async()=>{},useMutation:()=>async()=>{}};
 if(name==='next/navigation')return{useRouter:()=>({refresh(){}})};
 if(name.endsWith('/_generated/api'))return{api:require('../../convex/_generated/api.js').api};
 if(name==='@/components/ui/button')return{Button:props=>React.createElement('button',props)};
 return require(name);
};mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
const render=canEdit=>renderToStaticMarkup(React.createElement(mod.exports.StoryActionAssistant,{takeId:'take',canEdit,humanFailed:true}));
assert.match(render(true),/Fix only this shot/);source.repairUnavailable=true;assert(!render(true).includes('Fix only this shot'));assert(!render(true).includes('Approve this video'));assert.match(render(true),/safe repair is not available/);
source={...source,state:'DRAFT',repairUnavailable:false};assert.match(render(true),/Approve this video/);assert(!render(false).includes('Approve this video'));assert(!render(false).includes('Fix only this shot'));
for(const code of ['ACTION_WINDOW_SOURCE_UNSUPPORTED','ACTION_WINDOW_RANGE_INVALID','ACTION_WINDOW_MEASUREMENT_REQUIRED','ACTION_WINDOW_MEDIA_INVALID'])assert.match(mod.exports.storyActionFailure(new Error(code),'fallback'),/original video is unchanged/);
assert.match(mod.exports.storyActionFailure(new Error('ACTION_WINDOW_WORKER_UNAVAILABLE'),'fallback'),/will not be purchased again/);assert.equal(mod.exports.storyActionFailure(new Error('secret provider payload'),'safe fallback'),'safe fallback');
console.log('PASS repair controls reflect eligibility and role; source approval remains separate; safe timing and worker errors hide internal details');
