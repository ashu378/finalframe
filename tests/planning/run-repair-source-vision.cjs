const assert=require('node:assert/strict');
const {load,api}=require('../recipes/backend-fixture.cjs');
const vision=load('src/lib/production/repair-source-vision.ts');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const filename=path.resolve('convex/automaticRepairVision.ts');
const brief={action:{id:'beat',subject:'performer in green',action:'lift the glass and drink',startSeconds:1,endSeconds:2,beforeSeconds:2},
  scene:'sunlit terrace',originalFrameCount:72,frameCount:48,targetStartFrame:24,targetEndFrame:48};
function match(){
  return {status:'MATCH',actionId:'beat',confidence:.93,identityMatches:true,sceneMatches:true,framingCompatible:true,movement:'ARTICULATED',
    firstFrame:0,lastFrame:33,exit:{kind:'NATURAL_RETURN',angle:'SAME_ANGLE',continuity:'COMPATIBLE',releaseFrame:27,settledFrame:33,donorPose:'The right hand rests beside the glass.',nextOriginalPose:'The lowered hand rests on the table.',evidence:'The elbow lowers past the plate and the hand settles beside the glass.'},evidence:'The hand lifts the glass up to the lips.',phases:[0,12,21].map((frame,i)=>({phaseNumber:i+1,frame,observation:['Fingers curl around the glass.','Elbow bends and glass rises.','Glass tilts against the lips.'][i]}))};
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
 base.frameCount=72;
 const candidate={...base,frameCount:48,assetId:'b',storageId:'candidate',checksum:'b'.repeat(64)};
 const data={...brief,contextHash:'pin',projectId:'one',fps:24,base,candidates:[candidate]};
 const c={storage:{getUrl:async id=>'https://fixture.convex.cloud/api/storage/'+id},runQuery:async(ref,a)=>{
   if(ref==='automaticPerformanceRepair.context')return data;if(ref==='providerTextRequests.inspect')return receipts.get(a.requestKey);return mask(ref);
 },runMutation:async(ref,a)=>{
   events.push([ref,a]);if(ref==='providerTextRequests.reserve'){const row={_id:a.requestKey,status:'RESERVED'};receipts.set(row._id,row);return {created:true,request:row};}
   const row=receipts.get(a.requestId);if(ref==='providerTextRequests.markSubmitting'){row.status='SUBMITTING';return null;}
   if(ref==='providerTextRequests.finish'){if(row.status==='COMPLETED')return null;row.status=a.content?'COMPLETED':'RECONCILIATION_REQUIRED';row.content=a.content;return null;}return mask(ref);
 }};
 let headroom=10,invalid=false,native=false;
 const hash=n=>require('node:crypto').createHash('sha256').update(String(n)).digest('hex');
 global.fetch=async(url,opts)=>{
   if(url==='https://openrouter.ai/api/v1/key')return Response.json({data:{limit_remaining:headroom}});
   assert.equal(url,'https://worker.invalid/media/probe');const req=JSON.parse(opts.body);assert.equal(req.verifyVideoTiming,true);assert.equal(opts.redirect,'error');
   const isBase=req.url.endsWith('/base');const input=isBase?base:candidate;assert.equal(req.checksum,input.checksum);
   if(req.repairFingerprints){
     const hashes=Array.from({length:input.frameCount},(_,i)=>hash(isBase?i:native?(i>=8&&i<32?1000+i:i+16):2000+i));
     return Response.json({checksum:req.checksum,byteSize:input.byteSize,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:input.frameCount},repairFingerprints:{version:'DECODED_REPAIR_FRAMES_V1',hashes}});
   }
   const context=req.repairSample.kind==='CONTEXT';
   const images=context?[isBase?(req.repairSample.frame===24?'/9j/AAAA':'/9j/DDDD'):'/9j/FFFF']:['/9j/BBBB','/9j/CCCC'];
   return Response.json({checksum:invalid?'0'.repeat(64):req.checksum,byteSize:input.byteSize,repairSamples:{version:'REPAIR_SAMPLES_V1',kind:req.repairSample.kind,
      firstFrame:context?req.repairSample.frame:0,stride:context?1:3,frameCount:input.frameCount,images}});
 };
 return {c,data,events,receipts,native:()=>{native=true;},setHeadroom:x=>{headroom=x;},invalidate:()=>{invalid=true;}};
}
(async()=>{
 const v=x=>vision.verifyDiscovery(brief,x);
 assert.deepEqual(v(match()),{status:'MATCH',donorStartFrame:0,donorEndFrame:34,targetEndFrame:48});
 for(const patch of [{movement:'DETACHED_PATCH'},{movement:'STILL_OR_CAMERA_ONLY'},{identityMatches:false},{sceneMatches:false},{framingCompatible:false},{confidence:.63},{lastFrame:49},{firstFrame:1},{phases:[]},{phases:match().phases.reverse()},negative])assert.deepEqual(v({...match(),...patch}),{status:'NO_MATCH'});
 const direction=match(),exit=direction.exit;
 for(const patch of [
   {exit:undefined}, // A previously successful V1 observation.
   {firstFrame:0,lastFrame:18,phases:[0,6,18].map((frame,i)=>({...direction.phases[i],frame})),exit:{...exit,releaseFrame:18,settledFrame:18}},
   {exit:{...exit,kind:'ABRUPT_OR_UNCLEAR'}}, {exit:{...exit,kind:'END_OF_SHOT'}},
   {exit:{...exit,releaseFrame:30,settledFrame:30}}, {exit:{...exit,settledFrame:30}},
   {exit:{...exit,nextOriginalPose:''}}, {exit:{...exit,kind:'COMPATIBLE_CAMERA_CUT'}}, {exit:{...exit,releaseFrame:19}},
 ])assert.deepEqual(v({...direction,...patch}),{status:'NO_MATCH'});
 assert.equal(v({...direction,exit:{...exit,kind:'COMPATIBLE_CAMERA_CUT',angle:'DIFFERENT_ANGLE'}}).status,'MATCH');
 assert.equal(vision.verifyDiscovery({...brief,targetStartFrame:0,targetEndFrame:42},direction).status,'NO_MATCH','short donor cannot rejoin at an unchecked earlier frame');
 const cannotJoin={...negative,exit:{...exit,kind:'ABRUPT_OR_UNCLEAR',continuity:'DISCONTINUITY',releaseFrame:null,settledFrame:null,
   donorPose:'The arm remains raised above the table.',nextOriginalPose:'Both hands rest at the glass.',evidence:'The hand jumps from head height straight to the glass in the next original frame.'}};
 const exitResult={status:'NO_MATCH',reason:'EXIT_DISCONTINUITY'};
 assert.deepEqual(v(cannotJoin),exitResult);
 for(const patch of [{identityMatches:false},{sceneMatches:false},{movement:'WRONG_ACTION'},{confidence:.4},{status:'UNCERTAIN'},
   {exit:{...cannotJoin.exit,continuity:'UNCERTAIN'}},{exit:{...cannotJoin.exit,nextOriginalPose:''}}])
   assert.deepEqual(v({...cannotJoin,...patch}),{status:'NO_MATCH'});
 const terminal={...brief,originalFrameCount:brief.targetEndFrame};
 assert.deepEqual(vision.verifyDiscovery(terminal,cannotJoin),{status:'NO_MATCH'});
 assert.equal(vision.verifyDiscovery(terminal,{...direction,exit:{...exit,kind:'END_OF_SHOT',nextOriginalPose:''}}).status,'MATCH');
 assert.equal(vision.verifyDiscovery(terminal,direction).status,'NO_MATCH');
 assert.match(vision.discoveryMessages(terminal,'base',null,['sheet'])[0].content[3].text,/END OF SHOT/);
 console.log('PASS release and settled boundary are observed after the gesture; abrupt, unobserved, prematurely truncated and legacy matches rejected');
 assert.throws(()=>v({...match(),actionId:'other'}));assert.match(vision.discoveryPrompt(brief),/sunlit terrace/);
 console.log('PASS verified actor, scene, camera, action phases, confidence, bounds, timing and real no-match');
 Object.assign(process.env,{OPENROUTER_API_KEY:'test',RENDER_WORKER_SHARED_SECRET:'test',RENDER_WORKER_URL:'https://worker.invalid'});
 let calls=0;
 const api=handlers(async(_cap,m,o)=>{
   calls++;await o.beforeChatSubmit();assert.equal(o.model,'approved/reviewer');assert.deepEqual(o.fallbackModels,[]);assert.equal(o.maxRetries,0);assert.equal(o.retry.maxRetries,0);
   assert.deepEqual(m[0].content.filter(x=>x.type==='image_url').map(x=>x.image_url.url),['data:image/jpeg;base64,/9j/AAAA','data:image/jpeg;base64,/9j/DDDD','data:image/jpeg;base64,/9j/BBBB','data:image/jpeg;base64,/9j/CCCC']);
   assert.match(m[0].content[3].text,/ORIGINAL EXIT.*frame 48/);assert.match(m[0].content[5].text,/0, 3, 6/);assert.match(m[0].content[7].text,/24, 27, 30/);
   return {content:JSON.stringify(cannotJoin),modelUsed:'approved/reviewer',requestId:'gen-existing',costUsd:.01};
 });
 const get=async f=>({...await api.estimate.handler(f.c,{takeId:'take',contextHash:'pin'}),takeId:'take',contextHash:'pin',candidateIndex:0});
 const f=context(),a=await get(f);assert.equal(a.maximumCostUsd,.016384);
 await assert.rejects(api.inspect.handler(f.c,{...a,maximumCostUsd:.001}),/settings changed/);
 await assert.rejects(api.inspect.handler(f.c,{...a,contextHash:'forged'}),/changed/);
 f.setHeadroom(.001);await assert.rejects(api.inspect.handler(f.c,a),/allowance/);assert.equal(f.events.length,0);
 f.setHeadroom(10);assert.deepEqual(await api.inspect.handler(f.c,a),exitResult);
 assert.deepEqual(await api.inspect.handler(f.c,a),exitResult);assert.equal(calls,1);
 assert.equal(f.events.filter(x=>x[0].endsWith('reserve')).length,1);assert.equal(f.events.find(x=>x[0].endsWith('finish'))[1].actualCostUsd,.01);
 const bad=context();bad.invalidate();await assert.rejects(api.inspect.handler(bad.c,await get(bad)),/inconsistent/);assert.equal(bad.events.length,0);
 const lost=context(),throws=handlers(async(_c,_m,o)=>{await o.beforeChatSubmit();throw Error('private failure');});
 await assert.rejects(throws.inspect.handler(lost.c,await get(lost)),/receipt is saved/);
 await assert.rejects(throws.inspect.handler(lost.c,await get(lost)),/already checked/);
 assert(lost.events.some(([name,a])=>name.endsWith('finish')&&a.submitted&&!a.content));
 const newMode=load('src/lib/production/exact-repair-alignment.ts');
 const H=n=>require('node:crypto').createHash('sha256').update(String(n)).digest('hex');
 const orig=Array.from({length:72},(_,i)=>H(i)),copy=orig.slice(16,64);
 for(let i=8;i<32;i++)copy[i]=H(i+500);
 assert.deepEqual(newMode.exactSourceAlignment(orig,copy,24,48),{donorStartFrame:8,donorEndFrame:32,targetEndFrame:48});
 assert.equal(newMode.exactSourceAlignment(orig,[...copy,...copy],24,48),null);
 assert.equal(newMode.exactSourceAlignment(orig,orig,24,48),null);
 assert.equal(newMode.exactSourceAlignment(orig,copy.map((v,i)=>i===32?H(999):v),24,48),null);
 assert.equal(newMode.exactSourceAlignment(orig.map((v,i)=>i>=16&&i<24?H(10):v),copy,24,48),null);
 const observation={actionId:'beat',result:'MATCH',confidence:.94,sameActor:true,sameScene:true,correctArticulatedAction:true,joinsNaturally:true,evidence:'The performer takes the glass from the table and drinks.',phases:[
   {phaseNumber:1,frame:8,observation:'His hand reaches the glass.'},{phaseNumber:2,frame:18,observation:'His elbow bends as the glass rises.'},{phaseNumber:3,frame:31,observation:'The glass is tilted to his lips.'}]};
 const selected={status:'MATCH',method:newMode.EXACT_REPAIR_ALIGNMENT_VERSION,donorStartFrame:8,donorEndFrame:32,targetEndFrame:48};
 for(const patch of [{sameActor:false},{sameScene:false},{correctArticulatedAction:false},{joinsNaturally:false},{confidence:.3},{phases:[...observation.phases.slice(0,2),{...observation.phases[2],frame:32}]}])
   assert.deepEqual(newMode.verifyAligned(brief,selected,{...observation,...patch}),{status:'NO_MATCH'});
 let buys=0;const exact=handlers(async(_c,m,o)=>{buys++;await o.beforeChatSubmit();assert.equal(o.structuredOutput.name,'native_performance_check');assert.match(JSON.stringify(m),/LAST candidate frame 31/);return{content:JSON.stringify(observation),modelUsed:'approved/reviewer',requestId:'gen-exact',costUsd:.01};});
 process.env.FINALFRAME_EXACT_REPAIR_ALIGNMENT_ENABLED='true';
 const n=context();n.native();const quoted=await get(n);assert.equal(quoted.alignmentMode,newMode.EXACT_REPAIR_ALIGNMENT_VERSION);
 assert.deepEqual(await exact.inspect.handler(n.c,quoted),selected);assert.deepEqual(await exact.inspect.handler(n.c,quoted),selected);assert.equal(buys,1);
 const blocked=context();blocked.native();const q=await get(blocked);const key=lost.events.find(([name])=>name.endsWith('reserve'))[1].requestKey;
 blocked.receipts.set(key,{status:'RECONCILIATION_REQUIRED'});await assert.rejects(exact.inspect.handler(blocked.c,q),/already checked/);
 blocked.receipts.set(key,{status:'COMPLETED',content:JSON.stringify({...negative,identityMatches:false})});assert.deepEqual(await exact.inspect.handler(blocked.c,q),{status:'NO_MATCH'});assert.equal(buys,1);
 const unmatched=context();const other=await get(unmatched);unmatched.receipts.set(key,{status:'COMPLETED',content:JSON.stringify(cannotJoin)});
 assert.deepEqual(await exact.inspect.handler(unmatched.c,other),exitResult);assert.equal(buys,1);
 delete process.env.FINALFRAME_EXACT_REPAIR_ALIGNMENT_ENABLED;
 console.log('PASS one unique diverse native offset, semantic review with exact observed endpoint, ambiguous handles rejected, prior wrong-actor/uncertain receipts cannot be repurchased, unchanged V2 results reused.');
 console.log('PASS ordered source pixels, pinned checksums, quote and allowance checks, retained no-match, ambiguous acceptance and no duplicate submission; no network used');
})().catch(e=>{console.error(e);process.exitCode=1;});
