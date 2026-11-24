const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{createHash}=require('node:crypto');
const {load,api}=require('../recipes/backend-fixture.cjs');
function subject(execute){
 const filename=path.resolve('convex/storyActionVision.ts'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m.require=n=>{
  if(n==='./_generated/server')return{action:v=>v};if(n==='./_generated/api')return{internal:api};
  if(n.endsWith('model-discovery'))return{};if(n.endsWith('model-registry'))return{};
  if(n.endsWith('openrouter-adapter'))return{executeAITask:execute};
  if(n.startsWith('.'))return load(path.resolve(path.dirname(filename),n)+'.ts');return require(n);
 };
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports.run.handler;
}
function fixture(size=64){
 const bytes=Buffer.alloc(size,7),events=[],check={projectId:'project',requestKey:size>2000000?'picture-grids-v1:request':'request',takeId:'take',requirementKey:'requirement',expiresAt:Date.now()+60000,model:'reviewed/video',maximumCostUsd:1,priceCeiling:{prompt:1,completion:1}};
 const data={storageId:'owned-storage',byteSize:size,checksum:createHash('sha256').update(bytes).digest('hex'),requirementKey:'requirement',actions:[{id:'step',subject:'performer',action:'points',startSeconds:0,endSeconds:1,beforeSeconds:1}]};
 const ctx={storage:{get:async id=>{assert.equal(id,'owned-storage');return new Blob([bytes]);},getUrl:async id=>{assert.equal(id,'owned-storage');events.push(['url']);return'https://fixture.convex.cloud/api/storage/owned-storage';}},runQuery:async ref=>{if(ref==='storyActionChecks.quoteContext')return check;if(ref==='providerTextRequests.inspect')return null;if(ref==='storyActionChecks.context')return data;throw Error(ref);},runMutation:async(ref,args)=>{events.push([ref,args]);if(ref==='providerTextRequests.reserve'||ref==='storyActionChecks.reserveGrid')return{created:true,request:{_id:'receipt'}};return null;}};
 return{ctx,events,data,check};
}
(async()=>{
 process.env.RENDER_WORKER_URL='https://worker.test';process.env.RENDER_WORKER_SHARED_SECRET='fixture';
 const grid=(f,sound=false)=>async(url,opts)=>{
  assert.equal(opts.redirect,'error');const req=JSON.parse(opts.body);assert.equal(req.url,'https://fixture.convex.cloud/api/storage/owned-storage');
  if(url.endsWith('/media/extract-audio')){
   assert.equal(req.startSample,0);assert.equal(req.sampleCount,48000);
   const wav=Buffer.alloc(44+192000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(192000,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(192000,40);
   return new Response(wav,{headers:{'content-type':'audio/wav','x-finalframe-output-checksum':createHash('sha256').update(wav).digest('hex')}});
  }
  assert.equal(url,'https://worker.test/media/probe');assert.equal(req.verifyVideoTiming,true);
  return Response.json({checksum:createHash('sha256').update(Buffer.alloc(f.data.byteSize,7)).digest('hex'),byteSize:f.data.byteSize,hasAudio:sound,
    videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:194},
    repairSamples:{version:'REPAIR_SAMPLES_V1',kind:'CANDIDATE',frameCount:194,firstFrame:0,stride:3,images:Array(9).fill('/9j/x')}});
 };
 for(const [size,hasAudio] of [[64,false],[19000000,true],[2000001,false]]){
  const f=fixture(size);global.fetch=grid(f,hasAudio);let sent;
  const run=subject(async(_cap,messages,opts)=>{sent=messages;assert.deepEqual(opts.fallbackModels,[]);assert.equal(opts.maxRetries,0);await opts.beforeChatSubmit();return{content:'{}',modelUsed:'reviewed/video',requestId:'gen-ok',costUsd:.01};});
  await run(f.ctx,{checkId:'check'});const parts=sent[0].content;
  if(size<=2000000)assert(parts[1].video_url.url.startsWith('data:video/mp4;'));
  else{assert.equal(parts.filter(p=>p.type==='image_url').length,9);assert.equal(parts.filter(p=>p.type==='input_audio').length,Number(hasAudio));assert(parts.every(p=>p.type!=='video_url'));assert.match(JSON.stringify(parts),/0.000, 0.125/);assert(!JSON.stringify(parts).includes('fixture.convex.cloud'));}
  assert.equal(f.events.filter(x=>x[0]==='providerTextRequests.markSubmitting').length,1);
 }
 console.log('PASS small inline video; 19MB stored clip yields private timed images and authenticated original WAV; silent clip stays silent');
 for(const fault of ['checksum','missing-url','legacy-quote']){
   const f=fixture(2000001);global.fetch=grid(f);
   if(fault==='checksum')f.data.checksum='wrong';else if(fault==='missing-url')f.ctx.storage.getUrl=async()=>null;else f.check.requestKey='old-method';
   await assert.rejects(subject(async()=>{throw Error('must not buy');})(f.ctx,{checkId:'check'}));
   assert(!f.events.some(x=>x[0].includes('reserve')));
 }
 console.log('PASS source mutation, unavailable bytes and stale media transports fail before reservation');
 for(const diagnostic of [{status:413,requestId:'gen-safe_123',expected:'ACTION_CHECK_HTTP_413'},{status:'secret',requestId:'https://private.invalid/?key=secret',expected:'ACTION_CHECK_FAILED'}]){
  const f=fixture();const run=subject(async(_c,_m,o)=>{await o.beforeChatSubmit();throw Object.assign(new Error('PRIVATE_PROVIDER_TOKEN'),diagnostic);});await assert.rejects(run(f.ctx,{checkId:'check'}),/no automatic paid retry/);
  const finish=f.events.find(x=>x[0]==='providerTextRequests.finish')[1];assert.equal(finish.submitted,true);assert.equal(finish.errorCode,diagnostic.expected);assert.equal(finish.providerRequestId,diagnostic.status===413?'gen-safe_123':undefined);assert(!JSON.stringify(f.events).includes('PRIVATE_PROVIDER_TOKEN'));
 }
 console.log('PASS sanitized HTTP diagnostics retain submitted uncertainty and never leak provider errors');
 const f=fixture();f.ctx.runQuery=async ref=>ref==='storyActionChecks.quoteContext'?f.check:{_id:'receipt',status:'SUBMITTED'};await assert.rejects(subject(async()=>{throw Error('must not buy');})(f.ctx,{checkId:'check'}),/not be purchased twice/);assert(!f.events.some(x=>x[0]==='providerTextRequests.reserve'));console.log('PASS existing uncertain receipt blocks duplicate paid checks');
})().catch(e=>{console.error(e);process.exitCode=1});
