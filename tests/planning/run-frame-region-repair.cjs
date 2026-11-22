const assert=require('node:assert/strict');
const {load,fixture}=require('../recipes/backend-fixture.cjs');
const {resolveStoryRepair,ACTION_MOTION_REPAIR_VERSION,motionRepairKey}=load('convex/storyActionRepairs.ts');
const {resolveFrameRegionAnchors}=load('convex/frameRegionRepairs.ts');
const {frameSelection}=load('renderer/src/media/frame-to-region-contract.ts');
const hash='a'.repeat(64),other='b'.repeat(64);
const action={id:'chew',subject:'Original cartoon man',action:'Three visible chewing cycles before the question',startSeconds:4.79,endSeconds:7.25,beforeSeconds:5.751};
async function setup(){
 const c=fixture();c.rows.get('production').projectType='ANIMATED_COMEDY_2D';c.put('productionVersions',{_id:'version',productionId:'production',status:'APPROVED'});
 c.put('shots',{_id:'shot',projectId:'project',productionId:'production',productionVersionId:'version',durationSeconds:193/24,prompt:'Original action',metadata:{storyActions:[action]}});
 c.put('assets',{_id:'asset',projectId:'project',scope:'PROJECT',storageId:'source',checksum:hash,mimeType:'video/mp4',width:864,height:480});
 c.storageObjects.set('source',{size:100,sha256:hash,contentType:'video/mp4'});
 c.put('shotVersions',{_id:'take',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',assetId:'asset',status:'COMPLETED',contextSnapshot:{request:{storyRepair:{approachVersion:'isolated-action-region-v4',failedActionIds:['chew']}}}});
 const review=await c.call('storyActionReviews','get',{takeId:'take'});
 await c.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[{actionId:'chew',result:'FAIL',observedStartSeconds:null,observedEndSeconds:null,evidence:'Action absent'}]});
 c.put('verifiedMediaProbes',{_id:'probe',projectId:'project',assetId:'asset',storageId:'source',checksum:hash,byteSize:100,width:864,height:480,durationSeconds:193/24,hasAudio:true,videoCodec:'h264',videoTimingSourceStorageId:'source',videoTimingSourceChecksum:hash,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:193}});
 await c.call('storyActionReviews','recordRepairRegion',{takeId:'take',requirementKey:review.requirementKey,x:320,y:64,width:256,height:256,stationaryConfirmed:true});
 c.put('resourceStates',{_id:'sourceApproval',projectId:'project',resourceType:'asset',resourceId:'asset',state:'APPROVED'});
 return c;
}
(async()=>{
 process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED='true';process.env.FINALFRAME_ACTION_REGION_REPAIR_ENABLED='true';process.env.FINALFRAME_FRAME_TO_REGION_REPAIR_ENABLED='true';
 const {prepare}=load('convex/frameRegionRepairs.ts');let queried=0;
 await prepare.handler({runQuery:async(ref,args)=>{assert.equal(String(ref),'frameRegionRepairs.preparationContext');assert.deepEqual(Object.keys(args),['takeId'],'runtime query validator rejects surplus confirmation field');queried++;return{ready:true};}},{takeId:'take',cartoonSourceConfirmed:true});assert.equal(queried,1);
 const c=await setup(),repair=await resolveStoryRepair(c,'take','shot',false,true),contract=repair.proof.frameToRegion;
 assert.equal(repair.proof.approachVersion,ACTION_MOTION_REPAIR_VERSION);assert.equal(contract.providerOutput.frames,96);assert.equal(contract.normalization.targetFrames,60);assert.match(repair.prompt,/BEFORE 1\.602/);assert.match(repair.prompt,/FOUR seconds/);assert.equal(c.count('generationJobs'),0);
 await assert.rejects(resolveStoryRepair(c,'take','shot'),/NEEDS_NEW_APPROACH/);await assert.rejects(resolveFrameRegionAnchors(c,'take'),/PREPARATION_REQUIRED/);
 c.rows.get('production').projectType='REALISTIC_UGC';await assert.rejects(resolveStoryRepair(c,'take','shot',false,true),/CARTOON_SOURCE_REQUIRED/);delete c.rows.get('production').projectType;await assert.rejects(resolveStoryRepair(c,'take','shot',false,true),/CARTOON_SOURCE_REQUIRED/);c.rows.get('production').projectType='ANIMATED_COMEDY_2D';
 c.rows.get('production').projectType='CINEMATIC_FILM';c.rows.get('version').sourcePlanId='plan';c.rows.get('version').snapshot={workflow:'FOOTAGE_TRANSFORM'};c.put('directorPlans',{_id:'plan',productionId:'production',input:{videoType:'CINEMATIC_FILM',canonicalPlanSettings:{workflow:'FOOTAGE_TRANSFORM'}}});await resolveStoryRepair(c,'take','shot',false,true);
 c.rows.get('plan').input.canonicalPlanSettings.workflow='IDEA';await assert.rejects(resolveStoryRepair(c,'take','shot',false,true),/CARTOON_SOURCE_REQUIRED/);c.rows.get('plan').input.canonicalPlanSettings.workflow='FOOTAGE_TRANSFORM';
 c.rows.get('plan').input.videoType='ANIMATED_COMEDY_2D';c.rows.get('production').projectType='ANIMATED_COMEDY_2D';
 console.log('PASS explicit v5 route changes strategy, scales action deadline to provider time, old paid edit stays blocked');
 const proof={version:'FRAME_TO_REGION_V1',phase:'PREPARED',frameToRegion:contract,width:256,height:256,anchorWidth:640,anchorHeight:640,firstFrame:114,lastFrame:173,firstAnchor:{width:640,height:640,sourceFrame:114,checksum:other,byteSize:50},lastAnchor:{width:640,height:640,sourceFrame:173,checksum:other,byteSize:50}};
 for(const id of ['first','last'])c.storageObjects.set(id,{size:50,sha256:other,contentType:'image/png'});
 const args={takeId:'take',cartoonSourceConfirmed:true,reviewId:repair.proof.regionReviewId,firstStorageId:'first',lastStorageId:'last',proof};
 await assert.rejects(c.call('frameRegionRepairs','recordAnchors',{...args,cartoonSourceConfirmed:false}),/CARTOON_SOURCE_REQUIRED/);
 await c.call('frameRegionRepairs','recordAnchors',args);const assets=c.count('assets');await c.call('frameRegionRepairs','recordAnchors',args);assert.equal(c.count('assets'),assets);assert.equal(c.count('approvals'),2);
 const anchors=await resolveFrameRegionAnchors(c,'take');assert.notEqual(anchors.firstAssetId,anchors.lastAssetId);assert.equal(c.rows.get(anchors.firstAssetId).originAssetId,'asset');assert.equal(c.count('providerBudgetReservations'),0);
 console.log('PASS source-frame derivation creates two immutable same-project references; double preparation idempotent, no purchase');
 c.signedIn=false;await resolveFrameRegionAnchors(c,'take','user');await assert.rejects(resolveFrameRegionAnchors(c,'take'),/Verified/);c.signedIn=true;
 c.rows.get(anchors.firstAssetId).projectId='other';await assert.rejects(resolveFrameRegionAnchors(c,'take'),/BINDING_CHANGED/);c.rows.get(anchors.firstAssetId).projectId='project';
 c.storageObjects.get('first').sha256=hash;await assert.rejects(resolveFrameRegionAnchors(c,'take'),/BINDING_CHANGED/);c.storageObjects.get('first').sha256=other;
 c.rows.get('sourceApproval').state='REVISION_REQUESTED';await assert.rejects(resolveFrameRegionAnchors(c,'take'),/approved/);c.rows.get('sourceApproval').state='APPROVED';
 const original=c.rows.get('take').contextSnapshot;c.rows.get('take').contextSnapshot={request:{storyRepair:{approachVersion:ACTION_MOTION_REPAIR_VERSION}}};await assert.rejects(resolveStoryRepair(c,'take','shot',false,true),/NEEDS_NEW_APPROACH/);c.rows.get('take').contextSnapshot=original;
 c.rows.get('asset').rights={status:'REVOKED'};await assert.rejects(resolveFrameRegionAnchors(c,'take'),/UNAVAILABLE/);delete c.rows.get('asset').rights;
 console.log('PASS source/anchor approval and checksum, project access and worker actor revalidated; no v5 retry chain');
 const job=c.put('generationJobs',{_id:'motionjob',createdByUserId:'user',projectId:'project',productionId:'production',provider:'openrouter',model:'bytedance/seedance-2.5',leaseId:'lease',leaseExpiresAt:Date.now()+60000,request:{operation:'FRAME_TO_VIDEO',storyRepair:{...repair.proof,source:anchors.source}},response:{}}),lease={jobId:'motionjob',leaseId:'lease'};
 c.storageObjects.set('raw',{size:50,sha256:other,contentType:'video/mp4'});await assert.rejects(c.call('frameRegionRepairs','record',{...lease,phase:'RAW',storageId:'raw'}),/BINDING_CHANGED/);c.rows.get('motionjob').providerJobId='accepted';
 await c.call('frameRegionRepairs','record',{...lease,phase:'RAW',storageId:'raw'});const composed={version:'FRAME_TO_REGION_V1',phase:'COMPOSED',frameToRegion:contract,providerInputFrames:96,providerInputWidth:640,providerInputHeight:640,providerInputFps:24,normalizedFrames:60,normalizedWidth:256,normalizedHeight:256,selectedProviderFrames:frameSelection(contract),outputFrames:193,width:864,height:480,fps:24,originalAudioCopied:true,checksum:other,byteSize:50};
 await assert.rejects(c.call('frameRegionRepairs','record',{...lease,phase:'COMPOSED',storageId:'raw',proof:{...composed,originalAudioCopied:false}}),/BINDING_CHANGED/);
 await c.call('frameRegionRepairs','record',{...lease,phase:'COMPOSED',storageId:'raw',proof:composed});assert.equal((await c.call('frameRegionRepairs','context',lease)).actionWindowComposed.storageId,'raw');assert.equal(c.rows.get('motionjob').providerJobId,'accepted');
 await assert.rejects(c.call('frameRegionRepairs','context',{...lease,leaseId:'wrong'}),/BINDING_CHANGED/);
 assert.equal((await c.call('storyActionRepairs','motionOption',{takeId:'take'})).eligible,true);c.rows.get('motionjob').idempotencyKey=motionRepairKey('take');assert.equal((await c.call('storyActionRepairs','motionOption',{takeId:'take'})).eligible,false);
 console.log('PASS retained accepted raw output resumes without purchase; exact composition and source audio required, existing job hides repeat purchase');

 // Exercise the actual canonical estimate/confirmation/fence, not a parallel
 // hand-authored request. The only seams are storage/auth persistence.
 process.env.FINALFRAME_GENERATION_WORKER_ENABLED='true';process.env.FINALFRAME_PAID_TEST_RUN='recipe-test';
 c.rows.get('project').ownerUserId='user';c.rows.get('shot').sceneId='scene';c.put('scenes',{_id:'scene',productionId:'production',sequenceId:'sequence'});c.put('sequences',{_id:'sequence',productionId:'production'});
 c.rows.get('version').snapshot={};c.rows.get('version').planningContextSnapshot={};
 const model={_id:'catalog',studioExternalId:'studio',provider:'openrouter',modelId:'bytedance/seedance-2.5',canonicalSlug:'bytedance/seedance-2.5-20260807',available:true,reviewedAt:1,lastSeenAt:Date.now(),supportsTextToVideo:true,supportsImageReferences:true,supportsFirstFrame:true,supportsLastFrame:true,supportedDurations:[4],supportedResolutions:['480p'],supportedSizes:['640x640'],supportedAspectRatios:['1:1'],supportedParameters:[],pricingSkus:{video_tokens:.0000107,video_tokens_without_audio:.0000107,video_tokens_with_video_input:.0000064},reviewedOperations:['GENERATE','FRAME_TO_VIDEO']};
 const routing=load('src/lib/ai/video-routing.ts');model.reviewedCatalogFingerprint=routing.videoCatalogFingerprint(model);c.put('videoModelCatalog',model);
 c.put('videoRoutePolicies',{_id:'policy',studioExternalId:'studio',videoType:'ANIMATED_COMEDY_2D',qualityTier:'STANDARD',path:'AI_VIDEO',preferredModelIds:[model.modelId],maxCostUsd:5,updatedAt:1});
 const {validateReviewedVideoJob}=load('convex/videoRouting.ts');
 const baseRoute={studioExternalId:'studio',modelId:model.modelId,productionVersionId:'version',shotId:'shot'};
 const forgedRoute={videoType:'ANIMATED_COMEDY_2D',qualityTier:'STANDARD',durationSeconds:4,aspectRatio:'1:1',resolution:'480p',audioPolicy:'SILENT',requiresFirstFrame:true,requiresLastFrame:true,certifiedActionMotionRepair:true,storyRepair:{approachVersion:ACTION_MOTION_REPAIR_VERSION}};
 for(const operation of ['FRAME_TO_VIDEO','GENERATE']) await assert.rejects(validateReviewedVideoJob(c,{...baseRoute,request:{...forgedRoute,task:operation,operation}}),/No available video model/);
 assert(await validateReviewedVideoJob(c,{...baseRoute,request:{...forgedRoute,task:'GENERATE',operation:'GENERATE',requiresFirstFrame:false,requiresLastFrame:false}}));
 console.log('PASS ordinary Seedance generation remains eligible; caller-supplied proof cannot enable either frame control');
 c.rows.get('motionjob').idempotencyKey='other';
 const create={productionId:'production',shotId:'shot',provider:'openrouter',model:model.modelId,request:{storyRepairTakeId:'take',storyRepairMode:'ANIMATE_MOTION',qualityTier:'STANDARD',constraints:{storyRepair:{sourceAssetId:'forged'}}},estimatedCost:1,idempotencyKey:motionRepairKey('take')};
 const estimate=await c.call('generationJobs','previewShotEstimate',create);assert.equal(estimate.providerHoldMicros,2_000_000);assert.equal(c.count('reservations'),0);
 const confirmed=await c.call('generationJobs','createReviewedTake',{estimateId:estimate.estimateId,quoteHash:estimate.quoteHash});
 const queued=c.rows.get(confirmed._id??confirmed.id);assert(queued);assert.equal(queued.request.operation,'FRAME_TO_VIDEO');assert.equal(queued.request.duration,4);assert.equal(queued.request.requiresFirstFrame,true);assert.equal(queued.request.requiresLastFrame,true);assert.equal(queued.request.hasVideoReference,false);assert.equal(queued.request.referenceAssetIds.length,2);assert.equal(queued.request.storyRepair.audioSource.assetId,'asset');assert(Math.abs(queued.estimatedProviderCostUsd-.41088)<1e-9);
 const duplicate=await c.call('generationJobs','createReviewedTake',{estimateId:estimate.estimateId,quoteHash:estimate.quoteHash});assert.equal(duplicate._id??duplicate.id,queued._id);assert.equal(c.count('reservations'),1);assert.equal(c.count('providerBudgetReservations'),1);
 Object.assign(queued,{leaseId:'dispatch',leaseExpiresAt:Date.now()+60000});
 const fence={jobId:queued._id,leaseId:'dispatch',liveCatalogFingerprint:routing.videoCatalogQuoteFingerprint(model),liveCatalogCheckedAt:Date.now()};
 c.signedIn=false;
 assert.equal((await c.call('generationJobs','fenceSubmission',fence)).allowed,true);assert.equal((await c.call('generationJobs','fenceSubmission',fence)).allowed,false);
 console.log('PASS real canonical quote→confirm→dispatch: exact first/last frames,4s640square,$2 conservative reserve, duplicate confirmation buys once, scheduled actor fence without session');

 c.signedIn=true;const {editedSourceContext}=load('convex/sourceAudioContracts.ts');
 const finishedRequest={...queued.request};const storedOutput='composed-output';c.storageObjects.set(storedOutput,{size:50,sha256:other,contentType:'video/mp4'});
 c.put('assets',{_id:'finished-asset',projectId:'project',scope:'PROJECT',storageId:storedOutput,checksum:other,mimeType:'video/mp4',metadata:{generationJobId:queued._id}});
 Object.assign(queued,{status:'COMPLETED',providerJobId:'accepted-motion',response:{assetId:'finished-asset',actionWindowComposed:{storageId:storedOutput,proof:composed}}});
 Object.assign(c.rows.get(queued.shotVersionId),{status:'COMPLETED',assetId:'finished-asset',contextSnapshot:{request:finishedRequest}});
 c.put('resourceStates',{_id:'finishedApproval',projectId:'project',resourceType:'asset',resourceId:'finished-asset',state:'APPROVED'});
 const takeState=[...c.rows.values()].find(r=>r._table==='resourceStates'&&r.resourceId===queued.shotVersionId);takeState.state='APPROVED';
 assert.equal((await editedSourceContext(c,'project',queued.shotVersionId)).original.asset._id,'asset');
 queued.response.actionWindowComposed.proof={...composed,originalAudioCopied:false};await assert.rejects(editedSourceContext(c,'project',queued.shotVersionId),/SOURCE_AUDIO_SOURCE_BINDING_REQUIRED/);queued.response.actionWindowComposed.proof=composed;
 const silentRequest=structuredClone(finishedRequest);silentRequest.storyRepair.source.hasAudio=false;queued.request=silentRequest;c.rows.get(queued.shotVersionId).contextSnapshot.request=silentRequest;queued.response.actionWindowComposed.proof={...composed,originalAudioCopied:false};assert.equal((await editedSourceContext(c,'project',queued.shotVersionId)).original.asset._id,'asset');queued.request=finishedRequest;c.rows.get(queued.shotVersionId).contextSnapshot.request=finishedRequest;queued.response.actionWindowComposed.proof=composed;
 console.log('PASS ordinary original-recording restoration accepts only exact completed v5 composition; missing original-audio proof denied');

 const {motionOutputValidationRequest}=load('src/lib/production/action-motion-repair.ts'),{validateMediaProbe}=load('convex/generationWorkerContracts.ts');
 const highContract=structuredClone(contract);highContract.region.window.width=1280;highContract.region.window.height=720;
 const outputRequest=motionOutputValidationRequest({operation:'FRAME_TO_VIDEO',duration:4,ratio:'1:1',resolution:'480p',constraints:{resolution:'480p',requiresAudio:false},expectedNativeOutput:{width:640,height:640},storyRepair:{approachVersion:ACTION_MOTION_REPAIR_VERSION,frameToRegion:highContract,source:{width:1280,height:720,durationSeconds:193/24,hasAudio:true}}});
 assert.equal(outputRequest.constraints,undefined);validateMediaProbe({width:1280,height:720,durationSeconds:193/24,videoCodec:'h264',hasAudio:true},outputRequest,'bytedance/seedance-2.5');assert.throws(()=>validateMediaProbe({width:1280,height:720,durationSeconds:193/24,videoCodec:'h264',hasAudio:false},outputRequest,'bytedance/seedance-2.5'));
 console.log('PASS final source720p probe never inherits provider480p constraints or loses original-audio requirement');

 const {frameRegionProcessing,retainFrameRegionRaw}=load('convex/frameRegionRepairs.ts');
 await assert.rejects(frameRegionProcessing(async()=>{throw Error('FRAME_TO_REGION_BINDING_CHANGED')}),e=>e.code==='FRAME_TO_REGION_MEDIA_INVALID');
 await assert.rejects(frameRegionProcessing(async()=>{throw Error('network timeout')}),e=>e.code==='FRAME_TO_REGION_WORKER_UNAVAILABLE');
 const deleted=[];c.storage.delete=async id=>{deleted.push(id);c.storageObjects.delete(id);};
 c.storageObjects.set('unused-anchor',{size:50,sha256:other,contentType:'image/png'});
 assert.equal(await c.call('frameRegionRepairs','discardUnadoptedAnchors',{reviewId:repair.proof.regionReviewId,storageIds:['first','unused-anchor']}),1);assert(c.storageObjects.has('first'));assert(!c.storageObjects.has('unused-anchor'));
 assert.equal(await c.call('frameRegionRepairs','discardUnadoptedAnchors',{reviewId:repair.proof.regionReviewId,storageIds:['first','last']}),0);assert(c.storageObjects.has('last'));deleted.length=0;
 console.log('PASS failed preparation cleanup deletes only unadopted PNGs; committed anchors survive lost acknowledgements');
 assert.equal(await c.call('frameRegionRepairs','discardUnadopted',{jobId:'motionjob',storageId:'raw'}),false);assert.equal(await c.call('frameRegionRepairs','discardUnadopted',{jobId:'motionjob',storageId:storedOutput}),false);
 c.storageObjects.set('unused',{size:50,sha256:other,contentType:'video/mp4'});assert.equal(await c.call('frameRegionRepairs','discardUnadopted',{jobId:'motionjob',storageId:'unused'}),true);assert.deepEqual(deleted,['unused']);
 // Lost acknowledgement after the record commits: reconciliation sees the
 // adopted receipt and never deletes paid media. No provider call is made.
 let adopted=false,cleaned=false;
 await assert.rejects(retainFrameRegionRaw({storage:{store:async()=> 'uncertain-storage'},runMutation:async(ref,args)=>{if(String(ref)==='frameRegionRepairs.record'){adopted=true;throw Error('acknowledgement lost');}assert.equal(String(ref),'frameRegionRepairs.discardUnadopted');assert.equal(args.storageId,'uncertain-storage');cleaned=!adopted;return false;}},{jobId:'job',leaseId:'lease'},new Uint8Array([1,2,3]).buffer),e=>e.code==='FRAME_TO_REGION_WORKER_UNAVAILABLE');assert(adopted&&!cleaned);
 console.log('PASS invalid media stops automatic composition retries; transient errors recover; adopted raw/output/asset objects survive cleanup and lost acknowledgement');

 const worker=load('convex/generationWorker.ts'),oldFetch=global.fetch;let failedArgs=null,processorCalls=0;
 process.env.RENDER_WORKER_URL='https://fixture.worker';process.env.RENDER_WORKER_SHARED_SECRET='fixture-only';
 delete c.rows.get('motionjob').response.actionWindowComposed;c.rows.get('motionjob').createdAt=Date.now();
 const workerCtx={runQuery:async(ref,args)=>String(ref)==='generationJobs.getWorkerInput'?{job:c.rows.get('motionjob'),request:c.rows.get('motionjob').request,references:[]}:c.runQuery(ref,args),runMutation:async(ref,args)=>{if(String(ref)==='generationJobs.claim')return{claimed:true,leaseId:'lease'};if(String(ref)==='generationJobs.fail'){failedArgs=args;return null;}return c.runMutation(ref,args);},storage:c.storage};
 global.fetch=async url=>{assert.equal(String(url),'https://fixture.worker/media/frame-to-region','accepted output must never buy or poll again');processorCalls++;return new Response('{}',{status:422});};
 try{await worker.run.handler(workerCtx,{jobId:'motionjob'});}finally{global.fetch=oldFetch;}
 assert.equal(processorCalls,1);assert.equal(failedArgs.errorCode,'FRAME_TO_REGION_MEDIA_INVALID');assert.equal(failedArgs.retryable,false);assert.equal(c.rows.get('motionjob').response.actionWindowRaw.storageId,'raw');
 console.log('PASS actual scheduled worker makes one local compose attempt for invalid retained output, stops retry, and preserves paid raw without another provider POST');
 console.log('No-cost handler contracts only; real creative result still unverified.');
})().catch(e=>{console.error(e);process.exitCode=1});
