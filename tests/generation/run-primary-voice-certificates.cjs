const assert=require('node:assert/strict');const h=require('./run-operation-controls.cjs');
const v=new Proxy({},{get:()=>()=>({})});const definitions=Object.fromEntries(['query','mutation','action','internalAction','internalQuery','internalMutation'].map(name=>[name,value=>value]));
const contract=h.registry.REVIEWED_OPERATION_CONTRACTS.referenceVoice;
const catalog={id:contract.modelId,endpoints:[{name:contract.endpointName,tag:'seed',model_id:contract.modelId,status:0,pricing:{prompt:'0',completion:'0.0025',discount:0},supports_voice_cloning:true,supports_multiple_audio_references:true,supports_image_reference:true}]};
const source={assetId:'audio',storageId:'storage',checksum:Buffer.alloc(32,1).toString('base64'),byteSize:512,durationSeconds:8,audioCodec:'pcm_s16le',audioFormat:'wav',durationMeasurement:'DECODED_PCM_SAMPLES_V1',sampleRate:48000,channels:1,hasVideo:false};
function quote(){return{model:contract.modelId,capability:'TEXT_TO_SPEECH',estimatedProviderCostUsd:.3,billing:'OUTPUT_SECONDS',checkedAt:Date.now(),referenceVoiceQuote:h.preparation.certifyReferenceVoiceEndpoints(catalog)};}
function fixture(){
 const deps={};const state=h.backendFixture({operation:'GENERATE'},[],(state,ctx,auth)=>{
  const imports={'./_generated/server':definitions,'./_generated/api':{internal:h.api},'convex/values':{v},'./authorization':{requireProjectRole:auth,requireProjectAccess:auth},'../src/lib/ai/model-registry':h.registry,'./generationWorkerContracts':h.contracts,'./generationContinuity':{resolveGenerationContinuity:async(_,args)=>({referenceAssetIds:args.referenceAssetIds})}};
  deps.voices=h.compile('convex/voices.ts',{...imports,'./resourceStates':{}});
  deps.audio=h.compile('convex/audioCertificates.ts',{...imports,'./voices':deps.voices});
  return{};
 },deps);
 state.storage.sha256=source.checksum;state.storage.contentType='audio/wav';state.ctx.storage.getUrl=async id=>`https://fixture.convex.cloud/api/storage/${id}`;
 const put=(table,row)=>state.rows.set(row._id,{...row,table});
 put('assets',{...state.rows.get('audio'),_id:'second-audio',storageId:'second-storage'});
 put('voices',{_id:'voice',projectId:'project',kind:'CLONED',status:'READY',currentConsentId:'consent',sampleAssetIds:['second-audio','audio']});
 put('voiceConsents',{_id:'consent',projectId:'project',voiceId:'voice',permittedUses:['SYNTHESIZE'],expiresAt:Date.now()+3600000});
 for(const [type,id]of [['voice','voice'],['asset','audio'],['asset','second-audio']])put('resourceStates',{_id:`state-${id}`,projectId:'project',resourceType:type,resourceId:id,state:'APPROVED'});
 state.measure=()=>deps.audio.recordVoiceSampleProbe.handler(state.ctx,{projectId:'project',voiceId:'voice',primaryVoiceSampleAssetId:'audio',storageId:'storage',checksum:source.checksum,byteSize:source.byteSize,probe:{...source,hasAudio:true,decodedSampleCount:source.durationSeconds*16000,decodedSampleRate:16000}});
 state.resolve=patch=>deps.voices.resolveVoiceSynthesisInput(state.ctx,{projectId:'project',voiceId:'voice',use:'SYNTHESIZE',primaryVoiceSampleAssetId:'audio',...patch});
 state.prepare=async(patch={})=>{const frozen=await state.resolve();return state.jobs.createPreparation.handler(state.ctx,{productionId:'production',kind:'NARRATION',text:'Original synthetic narrator.',targetVoiceId:'voice',primaryVoiceSampleAssetId:'audio',clone:true,model:contract.modelId,capability:'TEXT_TO_SPEECH',estimatedProviderCostUsd:.3,quote:quote(),idempotencyKey:'primary-voice-contract',voiceVersionId:frozen.voiceVersionId,voiceConfigSnapshot:frozen.voiceConfigSnapshot,voiceConfigHash:frozen.voiceConfigHash,...patch});};
 state.deps=deps;return state;
}
let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
const old=process.env.FINALFRAME_PREPARATION_ENABLED;
async function main(){process.env.FINALFRAME_PREPARATION_ENABLED='true';
 await check('selected primary sample is explicit and current approved voice membership/consent cannot be bypassed',async()=>{
  const state=fixture();const voice=await state.resolve();assert.equal(voice.references.length,1);assert.equal(voice.references[0].assetId,'audio','second stored enrollment sample is not silently substituted');
  await assert.rejects(state.resolve({primaryVoiceSampleAssetId:'image'}),/primary recording/);
  for(const change of [s=>s.rows.get('voice').status='REVOKED',s=>s.rows.get('consent').expiresAt=Date.now()-1,s=>s.rows.get('consent').permittedUses=[],s=>s.rows.get('state-audio').state='DRAFT',s=>s.rows.get('audio').rights={consent:false}]){const s=fixture();change(s);await assert.rejects(s.resolve());}
 });
 await check('actual trusted sample measurement binds SHA/bytes/container and canonical create freezes120 original seconds',async()=>{
  const state=fixture();await assert.rejects(state.prepare(),/Measure/);assert.equal(state.writes.length,0);await state.measure();
  const made=await state.prepare();const job=state.rows.get(made._id);assert.deepEqual(job.request.cloneSource,source);assert.equal(job.request.primaryVoiceSampleAssetId,'audio');assert.equal(job.request.quote.referenceVoiceQuote.maxOriginalOutputSeconds,120);assert.equal(job.estimatedProviderCostUsd,.3);
  assert.equal((await state.prepare())._id,made._id);assert.equal((await state.fence(made._id,{livePreparationQuote:quote()})).allowed,true);
  for(const patch of [{primaryVoiceSampleAssetId:undefined},{estimatedProviderCostUsd:.01},{text:'x'.repeat(3001)},{quote:{...quote(),referenceVoiceQuote:{...quote().referenceVoiceQuote,maxOriginalOutputSeconds:1}}}]){const s=fixture();await s.measure();await assert.rejects(s.prepare(patch));}
 });
 await check('queued primary/consent/source changes and stale/missing/changed live endpoint certificates block first POST',async()=>{
  for(const change of [s=>s.rows.get('consent').expiresAt=Date.now()-1,s=>s.storage.sha256='b'.repeat(64),s=>s.rows.get('state-audio').state='DRAFT',s=>[...s.rows.values()].find(row=>row.table==='verifiedAudioProbes').durationMeasurement=undefined]){const state=fixture();await state.measure();const made=await state.prepare();change(state);await assert.rejects(state.fence(made._id,{livePreparationQuote:quote()}));assert.equal(state.rows.get(made._id).submissionStartedAt,undefined);}
  for(const live of [undefined,{...quote(),checkedAt:Date.now()-31000},{...quote(),referenceVoiceQuote:{...quote().referenceVoiceQuote,endpointFingerprint:'changed'}}]){const state=fixture();await state.measure();const made=await state.prepare();await assert.rejects(state.fence(made._id,{livePreparationQuote:live}));}
 });
 await check('actual preparation worker sends exactly the chosen recording and fresh quote through actual fence once',async()=>{
  const state=fixture();await state.measure();const made=await state.prepare();const job=state.rows.get(made._id);job.request.quote.referenceVoiceQuote=Object.fromEntries(Object.entries(job.request.quote.referenceVoiceQuote).reverse());let calls=0;let captured;let fences=0;
  const worker=h.compile('convex/preparationWorker.ts',{'./_generated/api':{internal:h.api},'../src/lib/ai/preparation':{...h.preparation,quotePreparation:async()=>quote()},'./generationWorkerContracts':h.contracts,'../src/lib/adapters/openrouter-adapter':{synthesizeSpeech:async(input,options)=>{captured=input;await options.beforeMediaSubmit();calls++;return{contentType:'audio/mpeg',audio:new Uint8Array([1,2]),modelUsed:contract.modelId,costUsd:.3};}}});
  const ctx={runQuery:async(_,args)=>state.deps.voices.resolveFrozenVoiceSynthesisInput(state.ctx,args),storage:{store:async()=> 'prepared-storage'},runMutation:async()=>null};
  await worker.runPreparation(ctx,{job,request:job.request},{jobId:made._id,leaseId:'lease'},async live=>{fences++;await state.fence(made._id,{livePreparationQuote:live});});
  assert.equal(calls,1);assert.equal(fences,1);assert.deepEqual(captured.inputReferences,[{url:'https://fixture.convex.cloud/api/storage/storage'}]);assert.equal(captured.voice,undefined);
 });
 console.log(`Primary voice certificates: PASS (${checks}); actual resolvers/create/fence/worker, in-memory storage and mocked provider only. No paid or database calls.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(old===undefined)delete process.env.FINALFRAME_PREPARATION_ENABLED;else process.env.FINALFRAME_PREPARATION_ENABLED=old;h.cleanup();});
