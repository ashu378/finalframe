const assert=require('node:assert/strict');
const {load,api}=require('../recipes/backend-fixture.cjs');
const vision=load('src/lib/production/repair-source-vision.ts');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const filename=path.resolve('convex/automaticRepairVision.ts');
const brief={action:{id:'beat',subject:'performer in green',action:'lift the glass and drink',startSeconds:1,endSeconds:2,beforeSeconds:2},
  scene:'sunlit terrace',frameCount:48,targetStartFrame:24,targetEndFrame:48};
function match(){
  return {status:'MATCH',actionId:'beat',confidence:.93,identityMatches:true,sceneMatches:true,framingCompatible:true,movement:'ARTICULATED',
    firstFrame:0,lastFrame:24,evidence:'The hand lifts the glass up to the lips.',phases:[0,12,21].map((frame,i)=>({phaseNumber:i+1,frame,observation:['Fingers curl around the glass.','Elbow bends and glass rises.','Glass tilts against the lips.'][i]}))};
}
const negative={...match(),status:'NO_MATCH',confidence:.97,firstFrame:null,lastFrame:null,phases:[]};
function handlers(execute){
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 const model={id:'approved/reviewer',inputModalities:['image','video'],outputModalities:['text'],supportedParameters:['structured_outputs'],contextLength:8192,pricing:{input:.000001,output:.000002},raw:{pricing:{}}};
 m.require=n=>{
  if(n==='./_generated/server')return{internalAction:v=>v}; if(n==='./_generated/api')return{internal:api};
  if(n.endsWith('model-discovery'))return{discoverOpenRouterModels:async()=>[model]};
  if(n.endsWith('model-registry'))return{getModelForCapability:()=>({id:model.id}),getFallbackModelsForCapability:()=>[]};
  if(n.endsWith('openrouter-adapter'))return{executeAITask:execute};
  if(n.startsWith('.'))return load(path.resolve(path.dirname(filename),n)+'.ts');
  return require(n);
 };
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
 return m.exports;
}
function context(){
 const events=[],receipts=new Map(),mask=async ref=>{throw Error('Unexpected ref: '+ref);};
 const base={storageId:'base',assetId:'a',checksum:'a'.repeat(64),byteSize:7000,frameCount:48};
 const candidate={...base,assetId:'b',storageId:'candidate',checksum:'b'.repeat(64)};
 const data={...brief,contextHash:'pin',projectId:'one',fps:24,base,candidates:[candidate]};
 const c={storage:{getUrl:async id=>'https://fixture.convex.cloud/api/storage/'+id},runQuery:async(ref,a)=>{
   if(ref==='automaticPerformanceRepair.context')return data;if(ref==='providerTextRequests.inspect')return receipts.get(a.requestKey);return mask(ref);
 },runMutation:async(ref,a)=>{
   events.push([ref,a]);if(ref==='providerTextRequests.reserve'){const row={_id:a.requestKey,status:'RESERVED'};receipts.set(row._id,row);return {created:true,request:row};}
   const row=receipts.get(a.requestId);if(ref==='providerTextRequests.markSubmitting'){row.status='SUBMITTING';return null;}
   if(ref==='providerTextRequests.finish'){if(row.status==='COMPLETED')return null;row.status=a.content?'COMPLETED':'RECONCILIATION_REQUIRED';row.content=a.content;return null;}return mask(ref);
 }};
 let headroom=10,invalid=false;
 global.fetch=async(url,opts)=>{
   if(url==='https://openrouter.ai/api/v1/key')return Response.json({data:{limit_remaining:headroom}});
   assert.equal(url,'https://worker.invalid/media/probe');const req=JSON.parse(opts.body);assert.equal(req.verifyVideoTiming,true);assert.equal(opts.redirect,'error');
   const isBase=req.repairSample.kind==='CONTEXT';assert.equal(req.url,'https://fixture.convex.cloud/api/storage/'+(isBase?'base':'candidate'));assert.equal(req.checksum,(isBase?base:candidate).checksum);
   const images=(isBase?['/9j/AAAA']:['/9j/BBBB','/9j/CCCC']);
   return Response.json({checksum:invalid?'0'.repeat(64):req.checksum,byteSize:base.byteSize,repairSamples:{version:'REPAIR_SAMPLES_V1',kind:req.repairSample.kind,
      firstFrame:isBase?24:0,stride:isBase?1:3,frameCount:48,images}});
 };
 return {c,data,events,setHeadroom:x=>{headroom=x;},invalidate:()=>{invalid=true;}};
}
(async()=>{
 const v=x=>vision.verifyDiscovery(brief,x);
 assert.deepEqual(v(match()),{status:'MATCH',donorStartFrame:0,donorEndFrame:25});
 for(const patch of [{movement:'DETACHED_PATCH'},{movement:'STILL_OR_CAMERA_ONLY'},{identityMatches:false},{sceneMatches:false},{framingCompatible:false},{confidence:.63},{lastFrame:49},{firstFrame:1},{phases:[]},{phases:match().phases.reverse()},negative])assert.deepEqual(v({...match(),...patch}),{status:'NO_MATCH'});
 assert.throws(()=>v({...match(),actionId:'other'}));assert.match(vision.discoveryPrompt(brief),/sunlit terrace/);
 console.log('PASS verified actor, scene, camera, action phases, confidence, bounds, timing and real no-match');
 Object.assign(process.env,{OPENROUTER_API_KEY:'test',RENDER_WORKER_SHARED_SECRET:'test',RENDER_WORKER_URL:'https://worker.invalid'});
 let calls=0;
 const api=handlers(async(_cap,m,o)=>{
   calls++;await o.beforeChatSubmit();assert.equal(o.model,'approved/reviewer');assert.deepEqual(o.fallbackModels,[]);assert.equal(o.maxRetries,0);assert.equal(o.retry.maxRetries,0);
   assert.deepEqual(m[0].content.filter(x=>x.type==='image_url').map(x=>x.image_url.url),['data:image/jpeg;base64,/9j/AAAA','data:image/jpeg;base64,/9j/BBBB','data:image/jpeg;base64,/9j/CCCC']);
   assert.match(m[0].content[3].text,/0, 3, 6/);assert.match(m[0].content[5].text,/24, 27, 30/);
   return {content:JSON.stringify(negative),modelUsed:'approved/reviewer',requestId:'gen-existing',costUsd:.01};
 });
 const get=async f=>({...await api.estimate.handler(f.c,{takeId:'take',contextHash:'pin'}),takeId:'take',contextHash:'pin',candidateIndex:0});
 const f=context(),a=await get(f);assert.equal(a.maximumCostUsd,.016384);
 await assert.rejects(api.inspect.handler(f.c,{...a,maximumCostUsd:.001}),/pricing changed/);
 await assert.rejects(api.inspect.handler(f.c,{...a,contextHash:'forged'}),/changed/);
 f.setHeadroom(.001);await assert.rejects(api.inspect.handler(f.c,a),/allowance/);assert.equal(f.events.length,0);
 f.setHeadroom(10);assert.deepEqual(await api.inspect.handler(f.c,a),{status:'NO_MATCH'});
 assert.deepEqual(await api.inspect.handler(f.c,a),{status:'NO_MATCH'});assert.equal(calls,1);
 assert.equal(f.events.filter(x=>x[0].endsWith('reserve')).length,1);assert.equal(f.events.find(x=>x[0].endsWith('finish'))[1].actualCostUsd,.01);
 const bad=context();bad.invalidate();await assert.rejects(api.inspect.handler(bad.c,await get(bad)),/inconsistent/);assert.equal(bad.events.length,0);
 const lost=context(),throws=handlers(async(_c,_m,o)=>{await o.beforeChatSubmit();throw Error('private failure');});
 await assert.rejects(throws.inspect.handler(lost.c,await get(lost)),/receipt is saved/);
 await assert.rejects(throws.inspect.handler(lost.c,await get(lost)),/already checked/);
 assert(lost.events.some(([name,a])=>name.endsWith('finish')&&a.submitted&&!a.content));
 console.log('PASS ordered source pixels, pinned checksums, quote and allowance checks, retained no-match, ambiguous acceptance and no duplicate submission; no network used');
})().catch(e=>{console.error(e);process.exitCode=1;});
