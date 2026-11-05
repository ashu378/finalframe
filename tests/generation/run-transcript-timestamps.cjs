const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const h=require('./run-operation-controls.cjs'),backend=require('../recipes/backend-fixture.cjs');
const sourceFile=path.join(__dirname,'run-transcript-source-certificates.cjs'),m=new Module(sourceFile,module);m.filename=sourceFile;m.paths=Module._nodeModulePaths(__dirname);m._compile(fs.readFileSync(sourceFile,'utf8').split('let checks=0;')[0]+'\nmodule.exports={fixture,quote,source,config,bytes};',sourceFile);const{fixture,quote,source,config,bytes}=m.exports;
const contract=backend.load('src/lib/ai/transcription.ts'),adapter=backend.load('src/lib/adapters/openrouter-adapter.ts');
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
const oldFetch=global.fetch,oldEnabled=process.env.FINALFRAME_PREPARATION_ENABLED;
function transport(handler){return{apiKey:null,mock:{seed:'no-cost-transcription',handler},maxRetries:0,fallbackModels:[]};}
async function completed(segments,text='Hello. Welcome.'){
 const s=fixture();await s.measure();const made=await s.prepare(),job=s.rows.get(made._id);Object.assign(job,{status:'PROCESSING',submissionStartedAt:Date.now(),leaseId:'lease',leaseExpiresAt:Date.now()+60000});
 await s.jobs.completePreparation.handler(s.ctx,{jobId:made._id,leaseId:'lease',actualModel:config.id,text,segments,providerRequestId:'paid-existing-receipt',providerCostUsd:.0002,usage:{seconds:source.durationSeconds}});
 return{s,job:s.rows.get(made._id),transcript:[...s.rows.values()].find(r=>r.table==='transcripts')};
}
(async()=>{process.env.FINALFRAME_PREPARATION_ENABLED='true';
 await check('actual centralized adapter emits top-level verbose segment request and never silently resubmits rejected output mode',async()=>{
  const requests=[];const input={model:'test/stt',audio:{data:'YQ==',format:'wav'},responseFormat:'verbose_json',timestampGranularities:['segment']};
  const result=await adapter.transcribeAudio(input,transport(r=>{requests.push(r);return{body:{text:'Hello.',segments:[{start:.1,end:.4,text:'Hello.'}],usage:{cost:.0001}},headers:{'content-type':'application/json'}};}));
  assert.equal(requests.length,1);assert.equal(requests[0].body.response_format,'verbose_json');assert.deepEqual(requests[0].body.timestamp_granularities,['segment']);assert.equal(requests[0].body.provider,undefined);assert.equal(result.segments[0].start,.1);
  let rejects=0;await assert.rejects(adapter.transcribeAudio(input,transport(()=>{rejects++;return{status:400,body:{error:{message:'unsupported verbose'}},headers:{'content-type':'application/json'}};})),e=>e.status===400);assert.equal(rejects,1);
  for(const patch of[{responseFormat:'srt'},{timestampGranularities:['word'],responseFormat:'json'},{timestampGranularities:['invented']},{timestampGranularities:['segment','segment']}])assert.throws(()=>adapter.buildTranscriptionRequest({...input,...patch}),e=>e.code==='INVALID_REQUEST');
 });
 await check('canonical quote and new job freeze segment mode in durable identity; legacy completed key stays text-only and is never repurchased',async()=>{
  const s=fixture();await s.measure();const made=await s.prepare(),job=s.rows.get(made._id);assert.deepEqual(job.request.transcriptionOptions,contract.TRANSCRIPT_SEGMENT_REQUEST);assert.deepEqual(job.request.quote.transcriptionOptions,contract.TRANSCRIPT_SEGMENT_REQUEST);assert(job.requestHash.includes('PROVIDER_SEGMENTS_V1'));
  assert.equal((await s.prepare())._id,made._id);assert.equal(s.creditReservations.length,1);
  // Recreate an old immutable request identity exactly by omitting the additive field.
  delete job.request.transcriptionOptions;job.requestHash=job.requestHash.replace(',"transcriptionOptions":{"responseFormat":"verbose_json","timestampGranularities":["segment"],"version":"PROVIDER_SEGMENTS_V1"}','');job.status='COMPLETED';
  assert.equal((await s.prepare())._id,made._id);assert.equal(s.creditReservations.length,1);assert.equal(s.rows.get(made._id).request.transcriptionOptions,undefined);
 });
 await check('actual worker passes frozen options exactly once, retains text on missing timing and rejects tampered request before submission',async()=>{
  for(const changed of[false,true]){const s=fixture();await s.measure();const made=await s.prepare(),job=s.rows.get(made._id);Object.assign(job,{status:'PROCESSING',leaseId:'lease',leaseExpiresAt:Date.now()+60000});if(changed)job.request.transcriptionOptions.responseFormat='srt';let posts=0,saved;
   global.fetch=async()=>new Response(bytes,{headers:{'content-type':'audio/wav'}});
   const worker=h.compile('convex/preparationWorker.ts',{'./_generated/api':{internal:h.api},'../src/lib/ai/preparation':{...h.preparation,quotePreparation:quote},'./generationWorkerContracts':h.contracts,'../src/lib/adapters/openrouter-adapter':{transcribeAudio:async(input,options)=>{assert.equal(input.responseFormat,'verbose_json');assert.deepEqual(input.timestampGranularities,['segment']);await options.beforeMediaSubmit();posts++;return{modelUsed:config.id,text:'Hello. Welcome.',segments:[],requestId:'retained-receipt',costUsd:.0002};}}});
   const run=worker.runPreparation({runMutation:async(_,args)=>saved=args},await s.jobs.getWorkerInput.handler(s.ctx,{jobId:made._id,leaseId:'lease'}),{jobId:made._id,leaseId:'lease'},q=>s.fence(made._id,{livePreparationQuote:q}));if(changed)await assert.rejects(run,/TRANSCRIPT_REQUEST_CHANGED/);else{await run;assert.equal(saved.text,'Hello. Welcome.');assert.deepEqual(saved.segments,[]);assert.equal(saved.providerCostUsd,.0002);}assert.equal(posts,changed?0:1);
  }
 });
 await check('completion saves exact phrase timing, intervening silence, decoded source checksum and receipt, with one settlement',async()=>{
  const segments=[{start:.1,end:.7,text:'Hello.'},{start:2.2,end:2.8,text:'Welcome.'}];const{s,job,transcript}=await completed(segments);assert.deepEqual(transcript.segments.segments,segments);assert.equal(transcript.segments.alignment.status,'TIMED_SEGMENTS');assert.equal(transcript.checksum,source.checksum);assert.deepEqual(transcript.segments.source,source);assert.equal(transcript.segments.providerRequestId,'paid-existing-receipt');assert.equal(job.response.transcriptAlignment.status,'TIMED_SEGMENTS');assert.equal(job.status,'COMPLETED');assert.equal(s.creditSettlements.length,1);assert.equal(s.providerSettlements[0].actualCostUsd,.0002);
  await s.jobs.completePreparation.handler(s.ctx,{jobId:job._id,leaseId:'lease',actualModel:config.id,text:'Do not overwrite',segments:[]});assert.equal(s.creditSettlements.length,1);assert.deepEqual(transcript.segments.segments,segments);
 });
 await check('missing, malformed, nonfinite, overlapping, excessive and out-of-duration timestamps preserve paid text and safely disable automatic alignment',async()=>{
  for(const segments of[undefined,[],{},[{start:NaN,end:1,text:'Hello.'}],[{start:-1,end:1,text:'Hello.'}],[{start:0,end:source.durationSeconds+1/16000,text:'Hello.'}],[{start:0,end:0,text:'Hello.'}],[{start:1,end:2,text:'A'},{start:1.5,end:2.5,text:'B'}],Array.from({length:1001},()=>({start:0,end:1,text:'Hello.'})),[{start:0,end:1,text:' '.repeat(3)}]]){
   const{s,job,transcript}=await completed(segments);assert.equal(job.status,'COMPLETED');assert.equal(transcript.segments.text,'Hello. Welcome.');assert.deepEqual(transcript.segments.segments,[]);assert.equal(transcript.segments.alignment.status,'TEXT_ONLY');assert.equal(s.creditSettlements.length,1);assert.equal(job.providerCostUsd,.0002);assert.equal(h.contracts.publicJob(job).transcriptAlignmentStatus,'TEXT_ONLY');
  }
  const silent=await completed([],'');assert.equal(silent.transcript.segments.alignment.status,'NO_SPEECH');assert.equal(silent.job.response.text,'');assert.deepEqual(silent.transcript.segments.segments,[]);
 });
 await check('frozen mode and live bytes stay fenced; changed source cannot attach transcription to replacement recording',async()=>{
  const s=fixture();await s.measure();const made=await s.prepare();await assert.rejects(s.fence(made._id,{livePreparationQuote:{...await quote(),transcriptionOptions:undefined}}),/TRANSCRIPT_REQUEST_CHANGED/);assert.equal(s.rows.get(made._id).submissionStartedAt,undefined);
  const job=s.rows.get(made._id);Object.assign(job,{status:'PROCESSING',submissionStartedAt:Date.now(),leaseId:'lease',leaseExpiresAt:Date.now()+60000});s.storage.sha256='changed';await assert.rejects(s.jobs.completePreparation.handler(s.ctx,{jobId:made._id,leaseId:'lease',actualModel:config.id,text:'Hello.',segments:[{start:0,end:.5,text:'Hello.'}]}));assert.equal([...s.rows.values()].filter(r=>r.table==='transcripts').length,0);assert.equal(s.creditSettlements.length,0);
 });
 await check('actual caption pipeline stops on retained text-only or silent transcript without fabricating cues or making a purchase',async()=>{
  for(const text of['Hello. Welcome.','']){
   const ctx=backend.fixture(),alignment=contract.normalizeTranscriptSegments(text,[],4);
   const run=ctx.put('recipeRuns',{_id:'run',projectId:'project',productionId:'production',boundRecipe:{fps:30}});
   const node=ctx.put('recipeRunNodes',{_id:'caption-node',nodeId:'captions',runId:'run',operation:'CAPTIONS',projectId:'project',productionId:'production',request:{transcriptStepKey:'transcript',language:'en'}});
   ctx.put('recipeRunNodes',{_id:'transcript-node',nodeId:'transcript',runId:'run',status:'COMPLETED',resultId:'transcript'});
   ctx.put('recipeRunNodes',{_id:'timeline-node',nodeId:'timeline',runId:'run',request:{durationFrames:120}});
   ctx.put('transcripts',{_id:'transcript',productionId:'production',status:'COMPLETED',segments:{text,...alignment}});
   ctx.put('resourceStates',{_id:'transcript-state',projectId:'project',productionId:'production',resourceType:'transcript',resourceId:'transcript',state:'APPROVED'});
   await assert.rejects(backend.load('convex/recipeLocal.ts').captionDraft(ctx,node,run,'user'),/CAPTION_TIMING_REVIEW_REQUIRED/);
   assert.equal(ctx.count('captions'),0);assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('timelines'),0);
  }
 });
 console.log('Transcript timestamps: '+checks+' PASS; real adapter/worker/canonical completion with isolated HTTP/storage, no paid or online calls.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=oldFetch;if(oldEnabled===undefined)delete process.env.FINALFRAME_PREPARATION_ENABLED;else process.env.FINALFRAME_PREPARATION_ENABLED=oldEnabled;h.cleanup();});
