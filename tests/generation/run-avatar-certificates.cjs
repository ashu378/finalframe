const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
const v = new Proxy({}, { get: () => () => ({}) });
const definitions = Object.fromEntries(['query','mutation','action','internalAction','internalQuery','internalMutation'].map(name=>[name,value=>value]));
const contract = h.registry.REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar;
const model = { ...h.model,modelId:contract.modelId,canonicalSlug:contract.canonicalSlug,supportedDurations:[],supportedResolutions:['720p','1080p'],supportedAspectRatios:['16:9','9:16','1:1'],supportedParameters:[...contract.passthrough],pricingSkus:{duration_seconds:.05},reviewedOperations:['LIP_SYNC'] };
const source = {assetId:'audio',storageId:'audio-storage',checksum:Buffer.alloc(32,1).toString('base64'),byteSize:512,durationSeconds:8.125,audioCodec:'pcm_s16le',audioFormat:'wav',durationMeasurement:'DECODED_PCM_SAMPLES_V1',sampleRate:48000,channels:1,hasVideo:false};
const portrait = {assetId:'image',storageId:'image-storage',checksum:Buffer.alloc(32,2).toString('base64'),byteSize:256,width:512,height:512,imageCodec:'png',mimeType:'image/png'};
const request = {videoType:'SOCIAL_CUTDOWN',task:'EDIT',operation:'LIP_SYNC',audioPolicy:'USE_RECORDING',qualityTier:'STANDARD',durationSeconds:source.durationSeconds,aspectRatio:'16:9',hasImageReferences:true,imageReferenceCount:1,hasAudioReference:true,lipSyncSource:source,lipSyncPortrait:portrait};
const endpoint = {data:{id:contract.modelId,architecture:{input_modalities:['text','image','audio'],output_modalities:['video']},endpoints:[{name:contract.endpointName,tag:'heygen',model_id:contract.modelId,status:0,pricing:{prompt:'0',completion:'0',discount:0},supports_voice_cloning:false,supports_multiple_audio_references:false,supports_image_reference:false,supports_diarization:false}]}};
function fixture() {
  const dependencies = {};
  const state = h.backendFixture({operation:'LIP_SYNC',audioPolicy:'USE_RECORDING'},['image','audio'],(state,ctx,auth)=>{
    const imports = {'./_generated/server':definitions,'./_generated/api':{internal:h.api},'convex/values':{v},'./authorization':{requireProjectRole:auth,requireMember:auth,requireAdmin:auth},'./generationWorkerContracts':h.contracts,'./generationContinuity':{resolveGenerationContinuity:async(_,args)=>({referenceAssetIds:args.referenceAssetIds})},'../src/lib/ai/model-registry':h.registry};
    dependencies.audio = h.compile('convex/audioCertificates.ts',{...imports,'./voices':{}});
    dependencies.image = h.compile('convex/imageCertificates.ts',imports);
    return h.compile('convex/videoRouting.ts',{...imports,'../src/lib/ai/video-routing':h.routing});
  },dependencies);
  state.rows.get('audio').storageId=source.storageId; state.rows.get('image').storageId=portrait.storageId;
  state.media=new Map([[source.storageId,{sha256:source.checksum,size:source.byteSize,contentType:'audio/wav'}],[portrait.storageId,{sha256:portrait.checksum,size:portrait.byteSize,contentType:'image/png'}]]);
  state.ctx.db.system.get=async(_,id)=>state.media.get(id);
  state.rows.set('catalog',{...structuredClone(model),_id:'catalog',table:'videoModelCatalog',studioExternalId:'studio',lastSeenAt:Date.now(),reviewedAt:Date.now(),reviewedCatalogFingerprint:h.routing.videoCatalogFingerprint(model)});
  state.rows.set('policy',{_id:'policy',table:'videoRoutePolicies',studioExternalId:'studio',videoType:'SOCIAL_CUTDOWN',qualityTier:'STANDARD',path:'AI_VIDEO',preferredModelIds:[model.modelId],maxCostUsd:10,updatedAt:1});
  const create=state.create;state.create=args=>create({model:model.modelId,...args});
  state.certify=async()=>{
    await dependencies.audio.recordProbe.handler(state.ctx,{productionId:'production',shotId:'shot',assetId:'audio',storageId:source.storageId,checksum:source.checksum,byteSize:source.byteSize,probe:{...source,hasAudio:true,decodedSampleCount:source.durationSeconds*16000,decodedSampleRate:16000}});
    await dependencies.image.recordProbe.handler(state.ctx,{productionId:'production',shotId:'shot',assetId:'image',storageId:portrait.storageId,checksum:portrait.checksum,byteSize:portrait.byteSize,probe:{...portrait,frameCount:1}});
  };
  state.live=()=>({liveCatalogFingerprint:h.routing.videoCatalogFingerprint(state.rows.get('catalog')),liveCatalogCheckedAt:Date.now(),liveEndpointFingerprint:h.routing.certifyAvatarEndpointCatalog(endpoint)});
  return state;
}
let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
async function main(){
  await check('reviewed permanent Avatar source contract bills full ceil audio and accepts null generation durations',()=>{
    const quote=h.routing.quoteSuppliedAudioAvatar(model,request);assert.equal(quote.costUsd,.45);assert.equal(quote.billableDurationSeconds,9);const exact=h.routing.quoteSuppliedAudioAvatar(model,{...request,lipSyncSource:{...source,durationSeconds:2}});assert.equal(exact.source.durationSeconds,2);assert.equal(exact.billableDurationSeconds,3,'one-sample safety belongs only to the billing ceiling, never playback length');assert.equal(h.routing.videoModelSupportsRequest(model,request),true);assert.equal(h.routing.selectVideoRoute(request,[model]).lipSyncQuote.canonicalSlug,contract.canonicalSlug);
    for(const patch of [{canonicalSlug:undefined},{canonicalSlug:'new-version'},{pricingSkus:{duration_seconds:.051}},{pricingSkus:{duration_seconds:.05,unknown_input:1}},{supportedParameters:[]}])assert.equal(h.routing.quoteSuppliedAudioAvatar({...model,...patch},request),undefined);
    for(const patch of [{audioPolicy:'SILENT'},{hasVideoReference:true},{imageReferenceCount:2},{requiresFirstFrame:true},{requiresAudio:true},{requiresMask:true},{lipSyncPortrait:{...portrait,width:2000}},{lipSyncSource:{...source,durationSeconds:60.001}},{lipSyncSource:{...source,durationSeconds:600.01}},{lipSyncSource:{...source,byteSize:32000001}},{lipSyncSource:{...source,audioFormat:'aiff'}},{lipSyncSource:{...source,durationMeasurement:undefined}}])assert.equal(h.routing.quoteSuppliedAudioAvatar(model,{...request,...patch}),undefined);
    assert.throws(()=>h.routing.certifyAvatarEndpointCatalog({data:{...endpoint.data,endpoints:[{...endpoint.data.endpoints[0],name:'HeyGen | new-version'}]}}));
  });
  await check('public action measures canonical audio and portrait and exposes full-source cost',async()=>{
    const action=h.publicActionFixture({operation:'LIP_SYNC',audioPolicy:'USE_RECORDING'},['image','audio']);action.model=model;action.actionSources={'audioCertificates.prepareSource':source,'imageCertificates.prepareSource':portrait};
    // Public discovery fixture needs the exact permanent version too.
    action.rawCatalog={};const result=await action.run();assert.equal(result.success,true);assert.equal(action.mutations[0].args.estimatedProviderCostUsd,.45);assert.equal(action.estimates[0].videoSeconds,9);
  });
  await check('canonical create ignores forged certificates and demands actual internally measured audio/image bytes',async()=>{
    const state=fixture();await assert.rejects(state.create(),/Measure/);assert.equal(state.writes.length,0);await state.certify();const made=await state.create({request:{ratio:'16:9',lipSyncSource:{durationSeconds:.1},lipSyncQuote:{costUsd:.01}}});
    const job=state.rows.get(made._id);assert.deepEqual(job.request.lipSyncSource,source);assert.deepEqual(job.request.lipSyncPortrait,portrait);assert.equal(job.request.duration,source.durationSeconds);assert.equal(job.estimatedProviderCostUsd,.45);assert.equal(job.estimatedCost,144);assert.equal(state.creditEstimates[0].durationSeconds,source.durationSeconds);assert.equal(state.creditReservations[0].amount,144);assert.equal((await state.fence(made._id,state.live())).allowed,true);
  });
  await check('submission fence checks current source/portrait/price/version and fresh endpoint proof before purchase',async()=>{
    for(const change of [s=>s.media.get(source.storageId).sha256='c'.repeat(64),s=>s.media.get(portrait.storageId).size++,s=>s.rows.get('image').projectId='foreign',s=>s.rows.get('catalog').canonicalSlug='new-version',s=>s.rows.get('catalog').pricingSkus.duration_seconds=.06]){
      const state=fixture();await state.certify();const made=await state.create();change(state);await assert.rejects(state.fence(made._id,state.live()),error=>error.code==='ROUTE_CHANGED');assert.equal(state.rows.get(made._id).submissionStartedAt,undefined);
    }
    for(const proof of [{liveEndpointFingerprint:'wrong'},{liveCatalogCheckedAt:Date.now()-31000}]){const state=fixture();await state.certify();const made=await state.create();await assert.rejects(state.fence(made._id,{...state.live(),...proof}));}
  });
  await check('actual worker omits duration/generated audio/frames and checks live endpoint before one submit',async()=>{
    const state=fixture();await state.certify();const made=await state.create();let posts=0;let captured;const oldFetch=global.fetch;const oldKey=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='fixture-only';
    global.fetch=async url=>{assert.equal(url,`https://openrouter.ai/api/v1/models/${model.modelId}/endpoints`);return Response.json(endpoint);};
    const worker=h.compile('convex/generationWorker.ts',{'./_generated/server':definitions,'./_generated/api':{internal:h.api},'convex/values':{v},'../src/lib/ai/video-routing':h.routing,'./preparationWorker':{},'./generationWorkerContracts':{...h.contracts,workerEnabled:()=>true},'../src/lib/ai/model-discovery':{discoverOpenRouterVideoModels:async()=>[{id:model.modelId,...model,allowedPassthroughParameters:model.supportedParameters}]},'../src/lib/adapters/openrouter-adapter':{buildVideoGenerationRequest:()=>{},generateVideo:async(input,options)=>{captured=input;await options.beforeMediaSubmit();posts++;return{id:'accepted',modelUsed:model.modelId};},pollVideo:async()=>({status:'pending'})}});
    const job=state.rows.get(made._id);
    try{await worker.run.handler({runQuery:async()=>({job,request:job.request,references:[{assetId:'image',kind:'image',url:'https://fixture.convex.cloud/api/storage/image'},{assetId:'audio',kind:'audio',url:'https://fixture.convex.cloud/api/storage/audio'}]}),runMutation:async(ref,args)=>ref==='generationJobs.claim'?{claimed:true,leaseId:'lease'}:ref==='generationJobs.fenceSubmission'?state.fence(made._id,args):{}},{jobId:made._id});}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldKey;}
    assert.equal(posts,1);for(const key of ['duration','generateAudio','frameImages'])assert.equal(captured[key],undefined);assert.equal(captured.inputReferences.length,2);
    const probe={durationSeconds:source.durationSeconds,width:1280,height:720,videoCodec:'h264',hasAudio:true};assert.doesNotThrow(()=>h.contracts.validateMediaProbe(probe,job.request));assert.throws(()=>h.contracts.validateMediaProbe({...probe,hasAudio:false},job.request));assert.throws(()=>h.contracts.validateMediaProbe({...probe,durationSeconds:source.durationSeconds+.2},job.request));
  });
  console.log(`Avatar certificates: PASS (${checks}); actual handlers/worker with isolated storage and mocked HTTP only. No paid or database calls.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(h.cleanup);
